const { app, BrowserWindow, ipcMain, dialog, protocol, clipboard, nativeImage, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const SRC = path.join(__dirname, 'src');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };
const RAW_EXT = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'mef', 'mos', 'kdc', 'dcr', 'rwl'];
const IMG_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'tif', 'tiff', 'ico'];
const OPEN_FILTERS = [
  { name: 'All supported', extensions: [...IMG_EXT, ...RAW_EXT, 'stratum', 'xmp'] },
  { name: 'Camera RAW', extensions: RAW_EXT },
  { name: 'Images', extensions: IMG_EXT },
  { name: 'Stratum project', extensions: ['stratum'] },
  { name: 'Lightroom preset / sidecar', extensions: ['xmp'] }
];

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let win = null;
let allowClose = false;
const pendingOpen = [];

function filesFromArgv(argv) {
  return argv.slice(1).filter(a => !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile() && /\.[a-z0-9]{2,8}$/i.test(a) && !/\.(exe|asar|js)$/i.test(a));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on('second-instance', (_e, argv) => {
  const files = filesFromArgv(argv);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (files.length) win.webContents.send('open-paths', files); }
});

function readState() { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window.json'), 'utf8')); } catch { return {}; } }
function writeState() { if (!win) return; try { const b = win.getNormalBounds(); fs.writeFileSync(path.join(app.getPath('userData'), 'window.json'), JSON.stringify({ ...b, max: win.isMaximized() })); } catch {} }

function createWindow() {
  const st = readState();
  win = new BrowserWindow({
    width: st.width || 1480, height: st.height || 920, x: st.x, y: st.y,
    minWidth: 980, minHeight: 620, show: false,
    backgroundColor: '#1c1e23', title: 'Stratum',
    icon: path.join(SRC, 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#191b1f', symbolColor: '#e1e4ea', height: 34 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  if (st.max) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://stratum/index.html');
  win.on('close', e => {
    writeState();
    if (!allowClose) { e.preventDefault(); win.webContents.send('close-request'); }
  });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  Menu.setApplicationMenu(null);
  protocol.handle('app', async req => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || !p) p = '/index.html';
    const file = path.normalize(path.join(SRC, p));
    if (!file.startsWith(SRC)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  pendingOpen.push(...filesFromArgv(process.argv));
  createWindow();
});
app.on('window-all-closed', () => app.quit());

/* ---------- IPC ---------- */
const readEntry = async p => ({ path: p, name: path.basename(p), data: new Uint8Array(await fs.promises.readFile(p)) });

ipcMain.handle('startup-paths', () => pendingOpen.splice(0));
ipcMain.handle('dialog:open', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, {
    title: opts.title || 'Open',
    properties: ['openFile', ...(opts.multi ? ['multiSelections'] : [])],
    filters: opts.filters || OPEN_FILTERS
  });
  if (r.canceled) return [];
  return Promise.all(r.filePaths.map(readEntry));
});
ipcMain.handle('file:read', (_e, p) => readEntry(p));
ipcMain.handle('dialog:save', async (_e, opts = {}) => {
  const r = await dialog.showSaveDialog(win, { title: opts.title || 'Save', defaultPath: opts.defaultPath, filters: opts.filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:folder', async (_e, opts = {}) => {
  const r = await dialog.showOpenDialog(win, { title: opts.title || 'Choose folder', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('file:write', async (_e, p, data) => { await fs.promises.writeFile(p, Buffer.from(data)); return true; });
ipcMain.handle('path:join', (_e, ...parts) => path.join(...parts));
ipcMain.handle('path:exists', (_e, p) => fs.existsSync(p));
ipcMain.handle('shell:reveal', (_e, p) => { shell.showItemInFolder(p); return true; });

ipcMain.handle('clipboard:read', () => {
  const out = { files: [], png: null, own: null };
  let formats = [];
  try { formats = typeof clipboard.availableFormats === 'function' ? clipboard.availableFormats() : []; } catch {}
  try { const h = clipboard.readHTML(); const m = h && h.match(/stratum-clip" content="([^"]+)/); if (m) { out.own = m[1]; return out; } } catch {}
  try {
    if (process.platform === 'win32') {
      const raw = clipboard.readBuffer('FileNameW');
      if (raw && raw.length) {
        const p = raw.toString('ucs2').replace(/\0+$/, '').split('\0')[0];
        if (p && fs.existsSync(p)) out.files.push(p);
      }
    } else if (process.platform === 'darwin') {
      const u = clipboard.read('public.file-url');
      if (u) { const p = decodeURIComponent(u.replace('file://', '')); if (fs.existsSync(p)) out.files.push(p); }
    } else {
      const t = clipboard.readText();
      t.split(/\r?\n/).forEach(l => { const p = l.replace(/^file:\/\//, ''); if (p && fs.existsSync(p) && fs.statSync(p).isFile()) out.files.push(decodeURIComponent(p)); });
    }
  } catch {}
  if (!out.files.length && (formats.length === 0 || formats.some(f => f.startsWith('image/')))) {
    const img = clipboard.readImage();
    if (!img.isEmpty()) out.png = new Uint8Array(img.toPNG());
  }
  return out;
});
ipcMain.handle('clipboard:writeImage', (_e, png, marker) => { clipboard.write({ image: nativeImage.createFromBuffer(Buffer.from(png)), html: marker ? `<meta name="stratum-clip" content="${marker}">` : '' }); return true; });

const presetFile = () => path.join(app.getPath('userData'), 'presets.json');
ipcMain.handle('presets:load', () => { try { return JSON.parse(fs.readFileSync(presetFile(), 'utf8')); } catch { return []; } });
ipcMain.handle('presets:save', (_e, list) => { fs.writeFileSync(presetFile(), JSON.stringify(list, null, 1)); return true; });
const prefFile = () => path.join(app.getPath('userData'), 'prefs.json');
ipcMain.handle('prefs:load', () => { try { return JSON.parse(fs.readFileSync(prefFile(), 'utf8')); } catch { return {}; } });
ipcMain.handle('prefs:save', (_e, p) => { fs.writeFileSync(prefFile(), JSON.stringify(p, null, 1)); return true; });

ipcMain.handle('app:quit', () => { allowClose = true; if (win) win.close(); });
ipcMain.handle('app:title', (_e, t) => { if (win) win.setTitle(t); });
ipcMain.handle('app:version', () => app.getVersion());

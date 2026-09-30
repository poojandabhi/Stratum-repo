const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stratumHost', {
  isDesktop: true,
  platform: process.platform,
  startupPaths: () => ipcRenderer.invoke('startup-paths'),
  openDialog: opts => ipcRenderer.invoke('dialog:open', opts),
  saveDialog: opts => ipcRenderer.invoke('dialog:save', opts),
  folderDialog: opts => ipcRenderer.invoke('dialog:folder', opts),
  readFile: p => ipcRenderer.invoke('file:read', p),
  writeFile: (p, data) => ipcRenderer.invoke('file:write', p, data),
  join: (...parts) => ipcRenderer.invoke('path:join', ...parts),
  exists: p => ipcRenderer.invoke('path:exists', p),
  reveal: p => ipcRenderer.invoke('shell:reveal', p),
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboardImage: (png, marker) => ipcRenderer.invoke('clipboard:writeImage', png, marker),
  loadPresets: () => ipcRenderer.invoke('presets:load'),
  savePresets: list => ipcRenderer.invoke('presets:save', list),
  loadPrefs: () => ipcRenderer.invoke('prefs:load'),
  savePrefs: p => ipcRenderer.invoke('prefs:save', p),
  quit: () => ipcRenderer.invoke('app:quit'),
  setTitle: t => ipcRenderer.invoke('app:title', t),
  version: () => ipcRenderer.invoke('app:version'),
  onOpenPaths: fn => ipcRenderer.on('open-paths', (_e, paths) => fn(paths)),
  onCloseRequest: fn => ipcRenderer.on('close-request', () => fn())
});

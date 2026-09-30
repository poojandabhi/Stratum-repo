/* Files: decoding (RAW, TIFF, standard images), open/save projects, export, clipboard and Paste Special. */
const RAW_EXT = ['cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef', 'srw', 'x3f', '3fr', 'iiq', 'erf', 'mef', 'mos', 'kdc', 'dcr', 'rwl'];
const extOf = n => (String(n).match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
const baseName = n => String(n).replace(/\.[^.]+$/, '');

async function pickFiles(multi = true, title = 'Open', filters) {
  if (desktop) return desktop.openDialog({ multi, title, filters });
  return new Promise(res => {
    const inp = $('#fileIn'); inp.multiple = multi; inp.value = '';
    inp.onchange = async () => res(await Promise.all([...inp.files].map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    inp.click();
  });
}
async function saveBytes(bytes, name, filters) {
  if (desktop) {
    const p = await desktop.saveDialog({ defaultPath: name, filters }); if (!p) return null;
    await desktop.writeFile(p, bytes); toast(`Saved ${p.split(/[\\/]/).pop()}`); return p;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return name;
}
const canvasBytes = (cv, type = 'image/png', q) => new Promise((res, rej) => cv.toBlob(b => b ? b.arrayBuffer().then(ab => res(new Uint8Array(ab))) : rej(new Error('Encoding failed')), type, q));
function canvasFromRGBA(data, w, h) { const c = mk(w, h); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer || data, data.byteOffset || 0, w * h * 4), w, h), 0, 0); return c; }
function previewFromSource(src, maxEdge = 480) {
  const s = Math.max(1, Math.max(src.w, src.h) / maxEdge), w = Math.max(1, Math.round(src.w / s)), h = Math.max(1, Math.round(src.h / s)), c = mk(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = Math.min(src.w - 1, Math.floor(x * s)), sy = Math.min(src.h - 1, Math.floor(y * s)), k = (sy * src.w + sx) * 3, o = (y * w + x) * 4; img.data[o] = src.rgb[k] >> 8; img.data[o + 1] = src.rgb[k + 1] >> 8; img.data[o + 2] = src.rgb[k + 2] >> 8; img.data[o + 3] = 255; }
  ctx.putImageData(img, 0, 0); return c;
}

/* ---------- decoders ---------- */
let LibRawMod = null;
async function decodeRaw(entry) {
  if (!LibRawMod) LibRawMod = (await import('./vendor/libraw/index.js')).default;
  const raw = new LibRawMod();
  try {
    await raw.open(new Uint8Array(entry.data), { useCameraWb: true, outputBps: 16, outputColor: 1, userQual: 3, halfSize: !!S.prefs.rawHalf, gamm: [1 / 2.4, 12.92], highlight: 0 });
    let meta = null; try { meta = await raw.metadata(); } catch (e) {}
    const img = await raw.imageData();
    if (!img || !img.data) throw new Error('This RAW file could not be decoded.');
    const w = img.width, h = img.height, n = w * h;
    let rgb;
    if (img.bits === 16 && img.colors === 3) rgb = img.data instanceof Uint16Array ? img.data : new Uint16Array(img.data.buffer, img.data.byteOffset, n * 3);
    else if (img.colors === 3) { rgb = new Uint16Array(n * 3); for (let i = 0; i < n * 3; i++) rgb[i] = img.data[i] * 257; }
    else { rgb = new Uint16Array(n * 3); const c = img.colors; for (let i = 0; i < n; i++) { const v = img.data[i * c]; rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = img.bits === 16 ? v : v * 257; } }
    if (rgb.buffer.byteLength !== rgb.byteLength) rgb = rgb.slice();
    const src = { w, h, rgb, alpha: null };
    const info = { kind: `Camera RAW · 16-bit · ${extOf(entry.name).toUpperCase()}`, w, h };
    if (meta) {
      info.camera = [meta.camera_make || meta.make, meta.camera_model || meta.model].filter(Boolean).join(' ');
      const sh = meta.shutter ? (meta.shutter >= 1 ? meta.shutter + 's' : '1/' + Math.round(1 / meta.shutter) + 's') : '';
      info.exif = [meta.iso_speed ? 'ISO ' + Math.round(meta.iso_speed) : '', sh, meta.aperture ? 'f/' + (+meta.aperture).toFixed(1) : '', meta.focal_len ? Math.round(meta.focal_len) + 'mm' : ''].filter(Boolean).join(' · ');
    }
    return { name: baseName(entry.name), src, info, isRaw: true, preview: previewFromSource(src) };
  } finally { try { raw.dispose(); } catch (e) {} }
}
function decodeTiff(entry) {
  const buf = entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength);
  const ifds = UTIF.decode(buf); const page = ifds.find(i => i.t256 && i.t257) || ifds[0];
  UTIF.decodeImage(buf, page, ifds);
  const w = page.width, h = page.height, bps = page.t258 ? page.t258[0] : 8, spp = page.t277 ? page.t277[0] : 1, photo = page.t262 ? page.t262[0] : 2;
  if (bps === 16 && (spp === 3 || spp === 4) && photo === 2 && !(page.t259 && page.t259[0] === 7)) {
    const words = new Uint16Array(page.data.buffer, page.data.byteOffset, w * h * spp), n = w * h, rgb = new Uint16Array(n * 3); let alpha = null;
    if (spp === 4) alpha = new Uint8Array(n);
    for (let i = 0; i < n; i++) { rgb[i * 3] = words[i * spp]; rgb[i * 3 + 1] = words[i * spp + 1]; rgb[i * 3 + 2] = words[i * spp + 2]; if (alpha) alpha[i] = words[i * spp + 3] >> 8; }
    const src = { w, h, rgb, alpha };
    return { name: baseName(entry.name), src, info: { kind: 'TIFF · 16-bit', w, h }, preview: previewFromSource(src) };
  }
  const rgba = UTIF.toRGBA8(page), cv = canvasFromRGBA(rgba, w, h);
  return { name: baseName(entry.name), canvas: cv, info: { kind: `TIFF · ${bps}-bit`, w, h } };
}
async function decodeBitmap(entry) {
  const ext = extOf(entry.name), type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', avif: 'image/avif', ico: 'image/x-icon' }[ext] || '';
  const bmp = await createImageBitmap(new Blob([entry.data], { type }), { colorSpaceConversion: 'default', premultiplyAlpha: 'none' });
  const cv = mk(bmp.width, bmp.height); cv.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
  return { name: baseName(entry.name), canvas: cv, info: { kind: `${(ext || 'image').toUpperCase()} · 8-bit`, w: cv.width, h: cv.height } };
}
async function decodeAny(entry) {
  const ext = extOf(entry.name);
  busy(true, `Decoding ${entry.name}…`);
  try {
    let dec;
    if (RAW_EXT.includes(ext)) dec = await decodeRaw(entry);
    else if (ext === 'tif' || ext === 'tiff') dec = decodeTiff(entry);
    else dec = await decodeBitmap(entry);
    if (!dec.src) { const d = dec.canvas.getContext('2d').getImageData(0, 0, dec.canvas.width, dec.canvas.height).data; dec.src = rgba8ToSource(d, dec.canvas.width, dec.canvas.height); dec.preview = dec.canvas; }
    dec.path = entry.path || null; dec.fileName = entry.name;
    return dec;
  } catch (e) {
    console.error(e); toast(`${entry.name}: ${e.message || 'could not be opened.'}`, 4200); return null;
  } finally { busy(false); }
}

/* ---------- open ---------- */
async function openEntries(entries) {
  for (const e of entries) {
    const ext = extOf(e.name);
    if (ext === 'stratum') { await loadProject(e); continue; }
    if (ext === 'xmp') { try { await importXmpText(new TextDecoder().decode(e.data), e.name); } catch (err) { toast(`${e.name}: ${err.message}`); } continue; }
    const dec = await decodeAny(e); if (dec) await openDecoded(dec);
  }
  renderFilm();
}
async function openDecoded(dec) {
  const d = makeDoc(dec.name, dec.src.w, dec.src.h);
  d.meta.srcPath = dec.path; d.meta.kind = dec.info.kind;
  const tmpDoc = doc; doc = d;
  const L = newLayer('Background');
  doc = tmpDoc;
  if (dec.canvas) L.canvas.getContext('2d').drawImage(dec.canvas, 0, 0);
  else if (dec.preview) { const c = L.canvas.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(dec.preview, 0, 0, d.w, d.h); }
  const alpha = dec.src.alpha;
  const { srcId } = await Dev.addSource(dec.src);
  L.dev = { srcId, settings: devDefaults(), info: dec.info, place: { x: 0, y: 0, w: d.w, h: d.h } };
  L.name = dec.isRaw ? 'Photo (RAW)' : 'Photo';
  d.layers = [L]; d.active = 0;
  addDoc(d, 'Open');
  Dev.requestRender(L, 'proxy');
  if (S.prefs.autoPasteOnOpen && S.devClip) await applyDevPatch([d], S.devClip.patch, 'Paste Settings on Import');
  return d;
}
async function openDialog() { const fs = await pickFiles(true, 'Open'); if (fs.length) await openEntries(fs); }
async function openPaths(paths) { if (!desktop) return; const es = []; for (const p of paths) { try { es.push(await desktop.readFile(p)); } catch (e) { toast(`Could not read ${p}`); } } await openEntries(es); }

/* ---------- place / paste ---------- */
async function placeDecoded(dec, opt = {}) {
  const o = Object.assign({ mode: S.prefs.pasteMode || 'fit', scale: 100, resample: S.prefs.resample || 'lanczos', keepPhoto: true, look: 'keep' }, opt);
  if (!doc || o.mode === 'newdoc') { const d = await openDecoded(dec); return d; }
  const sw = dec.src.w, sh = dec.src.h; let tw = sw, th = sh;
  if (o.mode === 'fit') { const s = Math.min(1, doc.w / sw, doc.h / sh); tw = sw * s; th = sh * s; }
  else if (o.mode === 'fill') { const s = Math.max(doc.w / sw, doc.h / sh); tw = sw * s; th = sh * s; }
  else if (o.mode === 'scale') { tw = sw * o.scale / 100; th = sh * o.scale / 100; }
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  const x = Math.round((doc.w - tw) / 2), y = Math.round((doc.h - th) / 2);
  const lookRef = o.look === 'match' ? (await Dev.ready(doc), flatten()) : null;
  const L = newLayer(dec.name.slice(0, 32));
  const keep = (o.keepPhoto && o.resample !== 'nearest') || !dec.canvas && !dec.preview;
  if (keep || dec.isRaw) {
    const c = L.canvas.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(dec.canvas || dec.preview, x, y, tw, th);
    const { srcId } = await Dev.addSource(dec.src);
    L.dev = { srcId, settings: devDefaults(), info: dec.info, place: { x, y, w: tw, h: th } };
  } else {
    const srcCv = dec.canvas || dec.preview; let scaled;
    if (tw === srcCv.width && th === srcCv.height) scaled = srcCv;
    else if (o.resample === 'lanczos') scaled = await Dev.resizeCanvas(srcCv, tw, th);
    else { scaled = mk(tw, th); const c = scaled.getContext('2d'); c.imageSmoothingEnabled = o.resample !== 'nearest'; c.imageSmoothingQuality = 'high'; c.drawImage(srcCv, 0, 0, tw, th); }
    L.canvas.getContext('2d').drawImage(scaled, x, y);
  }
  doc.layers.splice(doc.active + 1, 0, L); doc.active++;
  snapshot('Paste');
  if (L.dev) {
    if (o.look === 'match' && lookRef) await setMatchFromCanvas(lookRef, doc.name);
    else if (o.look === 'settings' && S.devClip) { L.dev.settings = devMerge(L.dev.settings, S.devClip.patch); snapshot('Paste Settings'); }
    Dev.requestRender(L, 'proxy');
  }
  return L;
}
async function readClipboardEntries() {
  if (!desktop) return null;
  const r = await desktop.readClipboard();
  if (r.own && S.clip && S.clip.marker === r.own) return { own: true };
  if (r.files.length) { const es = []; for (const p of r.files) es.push(await desktop.readFile(p)); return { entries: es, from: 'file' }; }
  if (r.png) return { entries: [{ name: 'Pasted image.png', data: r.png }], from: 'bitmap' };
  return null;
}
async function pasteSmart() {
  const c = await readClipboardEntries();
  if (c && c.entries) { for (const e of c.entries) { const dec = await decodeAny(e); if (dec) await placeDecoded(dec); } return; }
  if (S.clip) return pasteInternal();
  toast('The clipboard has no image. Copy a picture, a photo file in Explorer, or a selection.');
}
async function pasteSpecial() {
  const c = await readClipboardEntries();
  let decs = [];
  if (c && c.entries) { for (const e of c.entries) { const d = await decodeAny(e); if (d) decs.push(d); } }
  else if (S.clip) { const b = S.clip.bounds, cv = mk(b.w, b.h); cv.getContext('2d').drawImage(S.clip.canvas, -b.x, -b.y); const d = cv.getContext('2d').getImageData(0, 0, b.w, b.h).data; decs = [{ name: 'Pasted selection', canvas: cv, src: rgba8ToSource(d, b.w, b.h), info: { kind: 'Stratum selection · 8-bit', w: b.w, h: b.h }, preview: cv }]; }
  if (!decs.length) { toast('The clipboard has no image to paste.'); return; }
  const d0 = decs[0];
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px';
  body.innerHTML = `
    <div class="note"><b style="color:var(--fg)">${esc(d0.fileName || d0.name)}</b>${decs.length > 1 ? ` and ${decs.length - 1} more` : ''}<br>${esc(d0.info.kind)} · ${d0.src.w} × ${d0.src.h} px${d0.info.camera ? ' · ' + esc(d0.info.camera) : ''}${c && c.from === 'file' ? '<br>Pasting the original file, so no quality is lost to a screenshot-style bitmap copy.' : ''}</div>
    <label class="field"><span>Placement</span><select id="psMode">
      <option value="actual">Actual pixels (100%, no resampling)</option>
      <option value="fit" selected>Fit inside canvas (only shrinks)</option>
      <option value="fill">Fill canvas</option>
      <option value="scale">Scale by percentage</option>
      <option value="newdoc">As a new document</option></select></label>
    <label class="field" id="psScaleW" hidden><span>Scale (%)</span><input type="number" id="psScale" value="100" min="1" max="800"></label>
    <label class="field"><span>Resampling</span><select id="psRes">
      <option value="lanczos">Lanczos-3 (sharpest, best for photos)</option>
      <option value="bilinear">Bilinear (smoother)</option>
      <option value="nearest">Nearest neighbor (hard edges, pixel art)</option></select></label>
    <label class="opt"><input type="checkbox" id="psKeep" checked> Keep as photo layer (16-bit source, editable in Develop)</label>
    <label class="field"><span>Look</span><select id="psLook">
      <option value="keep">Keep the original look</option>
      <option value="match" ${doc ? '' : 'disabled'}>Match this document's look (adjustable in Develop › Match Look)</option>
      <option value="settings" ${S.devClip ? '' : 'disabled'}>Apply copied develop settings</option></select></label>`;
  body.querySelector('#psMode').onchange = e => { body.querySelector('#psScaleW').hidden = e.target.value !== 'scale'; };
  body.querySelector('#psRes').value = S.prefs.resample || 'lanczos';
  modal({ title: 'Paste Special', body, ok: 'Paste', wide: true, onOk: async () => {
    const o = { mode: $('#psMode').value, scale: +$('#psScale').value || 100, resample: $('#psRes').value, keepPhoto: $('#psKeep').checked, look: $('#psLook').value };
    S.prefs.resample = o.resample; if (o.mode !== 'newdoc') S.prefs.pasteMode = o.mode; savePrefs();
    for (const d of decs) await placeDecoded(d, o);
  } });
}
async function copy() {
  const L = layer(); if (!L) return;
  if (L.dev) await Dev.waitLayer(L);
  const cv = clipTo(cloneC(L.canvas), selMask()), b = doc.sel ? selBounds() : { x: 0, y: 0, w: doc.w, h: doc.h };
  S.clip = { canvas: cv, bounds: b, marker: 'c' + Date.now() };
  toast(doc.sel ? 'Copied selection' : 'Copied layer');
  if (desktop) { const t = mk(b.w, b.h); t.getContext('2d').drawImage(cv, -b.x, -b.y); desktop.writeClipboardImage(await canvasBytes(t), S.clip.marker); }
}
async function cut() { await copy(); clearPx('Cut'); }
function pasteInternal() {
  if (!S.clip) { toast('Nothing to paste yet. Copy a selection first.'); return; }
  if (!doc) { const b = S.clip.bounds, d = makeDoc('Pasted', b.w, b.h); docs.push(d); switchDoc(d); const L = newLayer('Background'); L.canvas.getContext('2d').drawImage(S.clip.canvas, -b.x, -b.y); d.layers = [L]; resetHistory('Paste'); d.dirty = false; fit(); return; }
  const L = newLayer('Pasted'); L.canvas.getContext('2d').drawImage(S.clip.canvas, 0, 0); doc.layers.splice(doc.active + 1, 0, L); doc.active++; snapshot('Paste');
}

/* ---------- project (.stratum) ---------- */
async function saveProject(saveAs) {
  if (!doc) return false;
  busy(true, 'Saving project…');
  try {
    await Dev.ready(doc);
    const chunks = []; let off = 0;
    const add = u8 => { chunks.push(u8); const c = { o: off, l: u8.length }; off += u8.length; return c; };
    const layers = [];
    for (const L of doc.layers) {
      const e = { name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend };
      if (L.dev) {
        const s = await Dev.getSource(L.dev.srcId);
        const rgb = pako.deflate(new Uint8Array(s.rgb.buffer), { level: 1 });
        e.dev = { settings: L.dev.settings, info: L.dev.info, place: L.dev.place, w: s.w, h: s.h, rgb: add(rgb), alpha: s.alpha ? add(pako.deflate(s.alpha, { level: 1 })) : null };
      } else e.png = add(await canvasBytes(L.canvas));
      layers.push(e);
    }
    const head = new TextEncoder().encode(JSON.stringify({ app: 'Stratum', version: 2, name: doc.name, w: doc.w, h: doc.h, active: doc.active, layers }));
    const out = new Uint8Array(12 + head.length + off);
    out.set(new TextEncoder().encode('STRATUM2'), 0); new DataView(out.buffer).setUint32(8, head.length, true); out.set(head, 12);
    let p = 12 + head.length; for (const c of chunks) { out.set(c, p); p += c.length; }
    let path = !saveAs && doc.path;
    if (path && desktop) { await desktop.writeFile(path, out); toast(`Saved ${doc.name}.stratum`); }
    else { path = await saveBytes(out, doc.name + '.stratum', [{ name: 'Stratum project', extensions: ['stratum'] }]); if (!path) return false; }
    doc.path = desktop ? path : null; doc.name = baseName(String(path).split(/[\\/]/).pop()); doc.dirty = false; renderTabs(); updateStatus();
    return true;
  } catch (e) { console.error(e); toast('Could not save: ' + e.message, 4200); return false; }
  finally { busy(false); }
}
async function loadProject(entry) {
  busy(true, 'Opening project…');
  try {
    const u8 = entry.data, magic = new TextDecoder().decode(u8.subarray(0, 8));
    if (magic !== 'STRATUM2') throw new Error('Not a Stratum project file.');
    const hl = new DataView(u8.buffer, u8.byteOffset).getUint32(8, true), head = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl))), base = 12 + hl;
    const chunk = c => u8.subarray(base + c.o, base + c.o + c.l);
    const d = makeDoc(head.name, head.w, head.h); const prev = doc; doc = d;
    for (const e of head.layers) {
      const L = newLayer(e.name); Object.assign(L, { visible: e.visible, opacity: e.opacity, blend: e.blend });
      if (e.dev) {
        const rgbB = pako.inflate(chunk(e.dev.rgb)), rgb = new Uint16Array(rgbB.buffer, rgbB.byteOffset, rgbB.byteLength / 2).slice();
        const alpha = e.dev.alpha ? pako.inflate(chunk(e.dev.alpha)) : null;
        const { srcId } = await Dev.addSource({ w: e.dev.w, h: e.dev.h, rgb, alpha });
        L.dev = { srcId, settings: devMerge(devDefaults(), e.dev.settings), info: e.dev.info, place: e.dev.place };
      } else {
        const bmp = await createImageBitmap(new Blob([chunk(e.png)], { type: 'image/png' }));
        L.canvas.getContext('2d').drawImage(bmp, 0, 0);
      }
      d.layers.push(L);
    }
    d.active = Math.min(head.active || 0, d.layers.length - 1); doc = prev;
    d.path = entry.path || null;
    addDoc(d, 'Open Project'); Dev.renderAll(d, 'proxy');
  } catch (e) { console.error(e); toast(`${entry.name}: ${e.message}`, 4200); }
  finally { busy(false); }
}

/* ---------- export ---------- */
function exportOptionsBody(multi) {
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px';
  body.innerHTML = `
    <div class="two"><label class="field"><span>Format</span><select id="exF"><option value="jpeg">JPEG</option><option value="png">PNG (lossless)</option><option value="webp">WebP</option><option value="tiff">TIFF (lossless, 8-bit)</option></select></label>
    <label class="field"><span>Quality <b id="exQv" style="font:11px var(--mono)">${S.prefs.jpegQ}</b></span><input type="range" id="exQ" min="40" max="100" value="${S.prefs.jpegQ}" style="accent-color:var(--accent)"></label></div>
    <div class="two"><label class="field"><span>Resize</span><select id="exR"><option value="none">Full resolution</option><option value="long">Long edge</option><option value="pct">Percentage</option></select></label>
    <label class="field"><span id="exRlabel">Pixels</span><input type="number" id="exRv" value="2048" min="16" max="20000" disabled></label></div>
    <label class="field"><span>Resampling</span><select id="exRes"><option value="lanczos">Lanczos-3 (sharpest)</option><option value="bilinear">Bilinear</option></select></label>
    ${multi ? '<label class="field"><span>File name suffix</span><input type="text" id="exSuf" value="-edit"></label>' : ''}
    <div class="note" id="exInfo"></div>`;
  const q = body.querySelector('#exQ'), f = body.querySelector('#exF'), r = body.querySelector('#exR'), rv = body.querySelector('#exRv');
  q.oninput = () => body.querySelector('#exQv').textContent = q.value;
  const upd = () => { q.disabled = !['jpeg', 'webp'].includes(f.value); rv.disabled = r.value === 'none'; body.querySelector('#exRlabel').textContent = r.value === 'pct' ? 'Percent' : 'Pixels'; if (r.value === 'pct' && +rv.value > 400) rv.value = 50; if (r.value === 'long' && +rv.value < 100) rv.value = 2048; body.querySelector('#exInfo').textContent = f.value === 'jpeg' ? 'JPEG has no transparency; transparent areas get the background color.' : ''; };
  f.onchange = upd; r.onchange = upd; upd();
  return body;
}
const readExportOpts = () => ({ fmt: $('#exF').value, q: +$('#exQ').value, resize: $('#exR').value, rv: +$('#exRv').value, res: $('#exRes').value, suffix: $('#exSuf') ? $('#exSuf').value : '' });
async function renderExport(d, o) {
  await Dev.ready(d);
  let cv = flatten(o.fmt === 'jpeg' ? S.bg : null, d);
  let nw = cv.width, nh = cv.height;
  if (o.resize === 'long') { const s = Math.min(1, o.rv / Math.max(nw, nh)); nw = Math.round(nw * s); nh = Math.round(nh * s); }
  else if (o.resize === 'pct') { nw = Math.round(nw * o.rv / 100); nh = Math.round(nh * o.rv / 100); }
  if (nw !== cv.width || nh !== cv.height) {
    if (o.res === 'lanczos') cv = await Dev.resizeCanvas(cv, nw, nh);
    else { const t = mk(nw, nh), c = t.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, nw, nh); cv = t; }
  }
  if (o.fmt === 'tiff') { const d8 = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; return { bytes: new Uint8Array(UTIF.encodeImage(d8.buffer, cv.width, cv.height)), ext: 'tif', w: cv.width, h: cv.height }; }
  const bytes = await canvasBytes(cv, 'image/' + o.fmt, o.q / 100);
  return { bytes, ext: o.fmt === 'jpeg' ? 'jpg' : o.fmt, w: cv.width, h: cv.height };
}
function cmdExport() {
  if (!doc) return;
  const body = exportOptionsBody(false);
  modal({ title: 'Export', body, ok: 'Export…', wide: true, onOk: async () => {
    const o = readExportOpts(); S.prefs.jpegQ = o.q; savePrefs();
    busy(true, 'Exporting…');
    try { const r = await renderExport(doc, o); busy(false); const p = await saveBytes(r.bytes, `${doc.name}.${r.ext}`, [{ name: r.ext.toUpperCase(), extensions: [r.ext] }]); if (p) toast(`Exported ${r.w} × ${r.h} px`); }
    catch (e) { toast('Export failed: ' + e.message); } finally { busy(false); }
  } });
}
function cmdExportAll() {
  if (!docs.length) return;
  const sel = docs.filter(d => d.filmSel), targets = sel.length > 1 ? sel : docs;
  const body = exportOptionsBody(true);
  body.prepend(Object.assign(document.createElement('div'), { className: 'note', textContent: `Exports ${targets.length} image${targets.length === 1 ? '' : 's'} with their develop settings applied${sel.length > 1 ? ' (filmstrip selection)' : ''}.` }));
  modal({ title: 'Export Photos', body, ok: 'Choose folder…', wide: true, onOk: async () => {
    const o = readExportOpts(); S.prefs.jpegQ = o.q; savePrefs();
    const folder = desktop ? await desktop.folderDialog({ title: 'Export to folder' }) : null;
    if (desktop && !folder) return;
    let n = 0;
    for (const d of targets) {
      busy(true, `Exporting ${n + 1} of ${targets.length}…`);
      try { const r = await renderExport(d, o), name = `${d.name}${o.suffix}.${r.ext}`; if (desktop) await desktop.writeFile(await desktop.join(folder, name), r.bytes); else await saveBytes(r.bytes, name); n++; }
      catch (e) { toast(`${d.name}: ${e.message}`); } finally { busy(false); }
    }
    toast(`Exported ${n} photo${n === 1 ? '' : 's'}${folder ? ' to ' + folder : ''}`, 4000);
    if (desktop && folder && n) desktop.reveal(await desktop.join(folder, `${targets[0].name}${o.suffix}.${o.fmt === 'jpeg' ? 'jpg' : o.fmt === 'tiff' ? 'tif' : o.fmt}`));
  } });
}
async function savePrefs() { try { desktop ? await desktop.savePrefs(S.prefs) : localStorage.setItem('stratum.prefs', JSON.stringify(S.prefs)); } catch (e) {} }
async function loadPrefs() { try { const p = desktop ? await desktop.loadPrefs() : JSON.parse(localStorage.getItem('stratum.prefs') || '{}'); Object.assign(S.prefs, p || {}); } catch (e) {} }

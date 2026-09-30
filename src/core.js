/* Stratum core: documents, layers, rendering, selection, history, tools. */
const $ = (s, r = document) => r.querySelector(s);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const cloneC = s => { const n = mk(s.width, s.height); n.getContext('2d').drawImage(s, 0, 0); return n; };
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
const hexRgb = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const esc = t => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const desktop = window.stratumHost || null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ICON = {
  move: '<path d="M12 3v18M3 12h18M12 3 9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  marquee: '<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2.2"/>',
  lasso: '<path d="M12 4.5c4.8 0 8 2 8 4.8s-3.2 4.8-8 4.8-8-2-8-4.8 3.2-4.8 8-4.8z" stroke-dasharray="3 2"/><path d="M7.5 13.2c-1.2 1.8-.6 3.6 1.3 3.8 1.8.2 1.9 2 .2 3.5"/>',
  crop: '<path d="M7 3v14h14M3 7h14v14"/>',
  eyedropper: '<path d="M14.5 4.5 19.5 9.5 17.5 11.5 12.5 6.5zM13.5 7.5 5 16v3h3l8.5-8.5"/>',
  brush: '<path d="M20 4c-2.8 1-7.6 5.6-9.6 8.6l1.2 1.2c3-2 7.6-6.8 8.4-9.8z"/><path d="M9.2 13.6c-2 0-3.8 1.5-3.8 3.8 0 1-.9 1.9-2 2 3.1 1.5 7.2.4 7.4-3.1z"/>',
  clone: '<path d="M9.5 3.5h5v4.2l-.9 3.3h-3.2l-.9-3.3zM5 13h14v3.8H5zM6.5 20h11"/>',
  eraser: '<path d="M14.8 4.2 20.8 10.2 12 19H7.2L3.2 15z"/><path d="M8.8 10.2l6 6M7.2 19H21"/>',
  fill: '<path d="M5 11.5 11.5 5l7 7-6.5 6.5z"/><path d="M5 11.5h13.5M20.5 15.5s1.2 1.6 1.2 2.6a1.2 1.2 0 0 1-2.4 0c0-1 1.2-2.6 1.2-2.6z"/>',
  gradient: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 16 16 4M8 20 20 8M12 20l8-8" opacity=".7"/>',
  text: '<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/>',
  shape: '<rect x="3.5" y="10" width="9.5" height="9.5"/><circle cx="15" cy="9" r="5.5"/>',
  hand: '<path d="M8 12.5V6a1.5 1.5 0 0 1 3 0v5.5m0-6.5a1.5 1.5 0 0 1 3 0v6m0-5a1.5 1.5 0 0 1 3 0V12m0-3a1.5 1.5 0 0 1 3 0v6c0 3.3-2.5 6-6 6h-1.6c-2 0-3.4-1-4.5-2.5l-3-4.3a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.2"/><path d="M15 15l5.5 5.5M8 10.5h5M10.5 8v5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  merge: '<path d="M7 4v4l5 5 5-5V4M12 13v7M8.5 16.5 12 20l3.5-3.5"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/>'
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

const TOOLS = [
  ['move', 'Move', 'V', 'Drag to move the layer. With a selection, moves only the selected pixels. Arrow keys nudge.'],
  ['marquee', 'Marquee', 'M', 'Drag to select. Shift for a square or circle. Click to deselect.'],
  ['lasso', 'Lasso', 'L', 'Drag a freehand selection.'],
  ['crop', 'Crop', 'C', 'Drag a crop box, then press Enter to apply or Esc to cancel.'],
  '-',
  ['eyedropper', 'Eyedropper', 'I', 'Click to sample the foreground color. Alt-click samples the background color.'],
  ['brush', 'Brush', 'B', 'Paint with the foreground color. [ and ] change size.'],
  ['clone', 'Clone Stamp', 'S', 'Alt-click to set a source point, then paint to copy pixels from it.'],
  ['eraser', 'Eraser', 'E', 'Erase pixels on the active layer to transparency.'],
  ['fill', 'Paint Bucket', 'G', 'Fill similar colors with the foreground color.'],
  ['gradient', 'Gradient', 'G', 'Drag to draw a gradient. Shift snaps to 45°.'],
  '-',
  ['text', 'Type', 'T', 'Click to type. Enter commits, Shift+Enter adds a line, Esc cancels.'],
  ['shape', 'Shape', 'U', 'Drag to draw. Shift constrains proportions.'],
  '-',
  ['hand', 'Hand', 'H', 'Drag to pan. Hold Space with any tool to pan.'],
  ['zoom', 'Zoom', 'Z', 'Click to zoom in, Alt-click to zoom out. Ctrl + scroll also zooms.']
];
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'], ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
const SWATCHES = ['#000000', '#ffffff', '#8a8f98', '#e5484d', '#f76b15', '#ffc53d', '#f2c14e', '#46a758', '#12a594', '#0090ff', '#3e63dd', '#8e4ec6', '#d6409f', '#7a5238', '#1d2a44', '#c7d2fe'];
const FONTS = ['IBM Plex Sans', 'Playfair Display', 'Anton', 'Caveat', 'IBM Plex Mono', 'Georgia', 'Arial', 'Segoe UI', 'Times New Roman'];

let uid = 1, docSeq = 1;
const docs = [];
let doc = null;
const S = {
  tool: 'brush', zoom: 1, fg: '#f2c14e', bg: '#ffffff',
  o: { size: 28, hardness: 70, opacity: 100, tolerance: 32, contiguous: true, gradType: 'linear', gradColors: 'fgbg', shape: 'rect', shapeMode: 'fill', strokeW: 6, font: 'IBM Plex Sans', fontSize: 72, bold: false, marquee: 'rect', aligned: true },
  preview: null, drag: null, hover: null, temp: null, crop: null, clip: null, cloneSrc: null, cloneOff: null, space: false, modal: null, textEd: null,
  prefs: { resample: 'lanczos', pasteMode: 'fit', rawHalf: false, jpegQ: 92 }
};
const hooks = { docChanged: [], layerChanged: [], afterRestore: [] };
const emit = (k, ...a) => hooks[k].forEach(f => { try { f(...a); } catch (e) { console.error(e); } });

const view = $('#view'), over = $('#over'), stage = $('#stage'), vp = $('#viewport');
const vctx = view.getContext('2d', { willReadFrequently: true }), octx = over.getContext('2d');
const layer = () => doc && doc.layers[doc.active];
const newLayer = name => ({ id: uid++, name, canvas: mk(doc.w, doc.h), visible: true, opacity: 1, blend: 'source-over', ver: 0, dev: null });
const touch = L => { L.ver = (L.ver || 0) + 1; };

function makeDoc(name, w, h) { return { id: docSeq++, name, w: Math.round(w), h: Math.round(h), layers: [], active: 0, sel: null, hist: [], hi: -1, zoom: 1, sx: 0, sy: 0, path: null, dirty: false, cache: new Map(), meta: {} }; }

/* ---------- rendering ---------- */
let rq = false;
function render() { if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; draw(); }); }
function draw() {
  if (!doc) return;
  vctx.globalAlpha = 1; vctx.globalCompositeOperation = 'source-over'; vctx.clearRect(0, 0, doc.w, doc.h);
  doc.layers.forEach((L, i) => { if (!L.visible) return; const src = S.preview && S.preview.i === i ? S.preview.canvas : L.canvas; vctx.globalAlpha = L.opacity; vctx.globalCompositeOperation = L.blend; vctx.drawImage(src, 0, 0); });
  vctx.globalAlpha = 1; vctx.globalCompositeOperation = 'source-over'; drawOverlay();
}
function flatten(bgFill, d = doc) {
  const f = mk(d.w, d.h), c = f.getContext('2d');
  if (bgFill) { c.fillStyle = bgFill; c.fillRect(0, 0, d.w, d.h); }
  d.layers.forEach(L => { if (!L.visible) return; c.globalAlpha = L.opacity; c.globalCompositeOperation = L.blend; c.drawImage(L.canvas, 0, 0); });
  return f;
}
function resizeViews() { if (!doc) return; view.width = over.width = doc.w; view.height = over.height = doc.h; sizeStage(); }
function sizeStage() { if (!doc) return; stage.style.width = doc.w * S.zoom + 'px'; stage.style.height = doc.h * S.zoom + 'px'; view.classList.toggle('px', S.zoom >= 2); updateStatus(); }
function setZoom(z, ax, ay) {
  if (!doc) return;
  z = Math.min(32, Math.max(0.01, z)); const r = vp.getBoundingClientRect();
  if (ax == null) { ax = r.left + r.width / 2; ay = r.top + r.height / 2; }
  const sr = view.getBoundingClientRect(), dx = (ax - sr.left) / S.zoom, dy = (ay - sr.top) / S.zoom;
  S.zoom = z; sizeStage(); const nr = view.getBoundingClientRect();
  vp.scrollLeft += nr.left + dx * z - ax; vp.scrollTop += nr.top + dy * z - ay;
  if (S.textEd) positionText(); drawOverlay();
}
function fit() { if (!doc) return; const r = vp.getBoundingClientRect(); setZoom(Math.max(0.01, Math.min((r.width - 64) / doc.w, (r.height - 64) / doc.h, 1))); }
const pt = e => { const r = view.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom }; };

/* ---------- documents ---------- */
function addDoc(d, label = 'Open') {
  docs.push(d); switchDoc(d); resetHistory(label); d.dirty = false; fit(); emit('docChanged');
}
function switchDoc(d) {
  if (doc === d) return;
  commitText();
  if (doc) { doc.zoom = S.zoom; doc.sx = vp.scrollLeft; doc.sy = vp.scrollTop; }
  doc = d; S.preview = null; S.crop = null; S.temp = null; S.drag = null;
  $('#welcome').hidden = !!doc; stage.parentElement.hidden = !doc;
  if (!doc) { refresh(); emit('docChanged'); return; }
  S.zoom = d.zoom; resizeViews();
  requestAnimationFrame(() => { vp.scrollLeft = d.sx; vp.scrollTop = d.sy; });
  refresh(); emit('docChanged');
}
async function closeDoc(d = doc, force) {
  if (!d) return true;
  if (d.dirty && !force) {
    const ans = await ask(`Save changes to “${d.name}”?`, 'Your edits will be lost if you close without saving.', [['save', 'Save', true], ['discard', "Don't Save"], ['cancel', 'Cancel']]);
    if (ans === 'cancel' || ans == null) return false;
    if (ans === 'save') { if (doc !== d) switchDoc(d); const ok = await saveProject(false); if (!ok) return false; }
  }
  const i = docs.indexOf(d); docs.splice(i, 1);
  if (window.Dev) Dev.dropDoc(d);
  if (doc === d) { doc = null; switchDoc(docs[Math.min(i, docs.length - 1)] || null); }
  emit('docChanged');
  return true;
}

/* ---------- selection ---------- */
function selPath(c, s, ox = 0, oy = 0) { c.beginPath(); if (s.type === 'rect') c.rect(s.x + ox, s.y + oy, s.w, s.h); else if (s.type === 'ellipse') c.ellipse(s.x + s.w / 2 + ox, s.y + s.h / 2 + oy, s.w / 2, s.h / 2, 0, 0, Math.PI * 2); else { s.pts.forEach((p, i) => i ? c.lineTo(p.x + ox, p.y + oy) : c.moveTo(p.x + ox, p.y + oy)); c.closePath(); } }
function selMask() { const s = doc.sel; if (!s) return null; const m = mk(doc.w, doc.h), c = m.getContext('2d'); c.fillStyle = '#000'; selPath(c, s); c.fill(); if (s.inv) { c.globalCompositeOperation = 'xor'; c.fillRect(0, 0, doc.w, doc.h); } return m; }
function clipTo(cv, mask) { if (!mask) return cv; const c = cv.getContext('2d'); c.save(); c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); c.restore(); return cv; }
function mergeSel(orig, mod, mask) { if (!mask) return mod; const o = cloneC(orig), c = o.getContext('2d'); c.globalCompositeOperation = 'destination-out'; c.drawImage(mask, 0, 0); c.globalCompositeOperation = 'source-over'; c.drawImage(clipTo(mod, mask), 0, 0); return o; }
function selBounds() {
  const s = doc.sel; if (!s || s.inv) return { x: 0, y: 0, w: doc.w, h: doc.h };
  let x0, y0, x1, y1;
  if (s.type === 'lasso') { x0 = Math.min(...s.pts.map(p => p.x)); x1 = Math.max(...s.pts.map(p => p.x)); y0 = Math.min(...s.pts.map(p => p.y)); y1 = Math.max(...s.pts.map(p => p.y)); } else { x0 = s.x; y0 = s.y; x1 = s.x + s.w; y1 = s.y + s.h; }
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(doc.w, Math.ceil(x1)); y1 = Math.min(doc.h, Math.ceil(y1));
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}
function rectFrom(a, b, sq) { let w = b.x - a.x, h = b.y - a.y; if (sq) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; } return { x: Math.round(Math.min(a.x, a.x + w)), y: Math.round(Math.min(a.y, a.y + h)), w: Math.round(Math.abs(w)), h: Math.round(Math.abs(h)) }; }

/* ---------- overlay ---------- */
let ants = 0;
setInterval(() => { if (doc && (doc.sel || S.temp)) { ants = (ants + 1) % 8; drawOverlay(); } }, 110);
function dashed(c, z, pathFn) { c.save(); c.lineWidth = 1 / z; c.setLineDash([4 / z, 4 / z]); pathFn(); c.strokeStyle = '#000'; c.lineDashOffset = -ants / z; c.stroke(); c.strokeStyle = '#fff'; c.lineDashOffset = (4 - ants) / z; c.stroke(); c.restore(); }
function drawOverlay() {
  if (!doc) return;
  const c = octx, z = S.zoom; c.clearRect(0, 0, doc.w, doc.h);
  const s = doc.sel;
  if (s) { const o = S.selOff || { dx: 0, dy: 0 }; dashed(c, z, () => selPath(c, s, o.dx, o.dy)); if (s.inv) dashed(c, z, () => { c.beginPath(); c.rect(0, 0, doc.w, doc.h); }); }
  const t = S.temp;
  if (t && t.kind === 'sel') dashed(c, z, () => selPath(c, t.sel));
  if (t && t.kind === 'line') { c.save(); c.lineWidth = 1.5 / z; c.strokeStyle = '#fff'; c.shadowColor = '#000'; c.shadowBlur = 2; c.beginPath(); c.moveTo(t.a.x, t.a.y); c.lineTo(t.b.x, t.b.y); c.stroke(); [t.a, t.b].forEach(p => { c.beginPath(); c.arc(p.x, p.y, 4 / z, 0, 7); c.stroke(); }); c.restore(); }
  const r = S.crop;
  if (r) { c.save(); c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.rect(0, 0, doc.w, doc.h); c.rect(r.x, r.y, r.w, r.h); c.fill('evenodd'); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1 / z; c.beginPath(); for (let i = 1; i < 3; i++) { c.moveTo(r.x + r.w * i / 3, r.y); c.lineTo(r.x + r.w * i / 3, r.y + r.h); c.moveTo(r.x, r.y + r.h * i / 3); c.lineTo(r.x + r.w, r.y + r.h * i / 3); } c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 1.5 / z; c.strokeRect(r.x, r.y, r.w, r.h); c.restore(); }
  if (S.tool === 'clone' && S.cloneSrc) { let p = S.cloneSrc; if (S.drag && S.cloneOff && S.hover) p = { x: S.hover.x + S.cloneOff.x, y: S.hover.y + S.cloneOff.y }; c.save(); c.lineWidth = 1.5 / z; c.strokeStyle = '#fff'; c.shadowColor = '#000'; c.shadowBlur = 2; const k = 8 / z; c.beginPath(); c.moveTo(p.x - k, p.y); c.lineTo(p.x + k, p.y); c.moveTo(p.x, p.y - k); c.lineTo(p.x, p.y + k); c.stroke(); c.restore(); }
  if (S.hover && ['brush', 'eraser', 'clone'].includes(S.tool) && !S.space) { const p = S.hover, rad = Math.max(1 / z, S.o.size / 2); c.save(); c.lineWidth = 1 / z; c.strokeStyle = 'rgba(0,0,0,.8)'; c.beginPath(); c.arc(p.x, p.y, rad + .5 / z, 0, 7); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(p.x, p.y, Math.max(.5 / z, rad - .5 / z), 0, 7); c.stroke(); c.restore(); }
}

/* ---------- history ---------- */
function histLimit() { const mp = doc.w * doc.h / 1e6; return mp > 30 ? 12 : mp > 12 ? 20 : 40; }
function snapLayer(L) {
  const base = { id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend };
  if (L.dev) return { ...base, dev: { ...L.dev, settings: devClone(L.dev.settings) }, canvas: null };
  const c = doc.cache.get(L.id); let copy;
  if (c && c.ref === L.canvas && c.ver === (L.ver || 0)) copy = c.copy;
  else { copy = cloneC(L.canvas); doc.cache.set(L.id, { ref: L.canvas, ver: L.ver || 0, copy }); }
  return { ...base, dev: null, canvas: copy };
}
function snapshot(label) {
  if (!doc) return;
  const h = doc.hist; h.length = doc.hi + 1;
  h.push({ label, t: new Date(), w: doc.w, h: doc.h, active: doc.active, sel: doc.sel ? structuredClone(doc.sel) : null, layers: doc.layers.map(snapLayer) });
  while (h.length > histLimit()) h.shift();
  doc.hi = h.length - 1; S.preview = null;
  if (h.length > 1) doc.dirty = true;
  refresh(); emit('layerChanged');
}
function restore(i) {
  const h = doc.hist; if (i < 0 || i >= h.length) return;
  cancelText(); doc.hi = i; const st = h[i]; const resized = st.w !== doc.w || st.h !== doc.h;
  doc.w = st.w; doc.h = st.h; doc.active = st.active; doc.sel = st.sel ? structuredClone(st.sel) : null;
  const cur = new Map(doc.layers.map(L => [L.id, L]));
  doc.layers = st.layers.map(s => {
    const L = { id: s.id, name: s.name, visible: s.visible, opacity: s.opacity, blend: s.blend, ver: 0, dev: null };
    if (s.dev) {
      const old = cur.get(s.id);
      L.canvas = old && old.canvas.width === doc.w && old.canvas.height === doc.h ? old.canvas : mk(doc.w, doc.h);
      if (old && old.canvas === L.canvas && !old.dev) L.canvas = cloneC(old.canvas);
      L.dev = { ...s.dev, settings: devClone(s.dev.settings) };
    } else {
      L.canvas = cloneC(s.canvas); doc.cache.set(L.id, { ref: L.canvas, ver: 0, copy: s.canvas });
    }
    return L;
  });
  S.preview = null; S.crop = null; S.temp = null;
  if (resized) resizeViews();
  doc.dirty = true;
  refresh(); emit('afterRestore'); emit('layerChanged');
}
const undo = () => { if (!doc) return; if (doc.hi > 0) restore(doc.hi - 1); else toast('Nothing to undo'); };
const redo = () => { if (!doc) return; if (doc.hi < doc.hist.length - 1) restore(doc.hi + 1); else toast('Nothing to redo'); };
function resetHistory(label) { doc.hist.length = 0; doc.hi = -1; doc.cache = new Map(); snapshot(label); }
function refresh() { render(); if (window.renderLayers) { renderLayers(); renderHistory(); updateStatus(); buildOptions(); renderTabs(); } }

/* ---------- painting helpers ---------- */
function canPaint(quiet) {
  const L = layer(); if (!L) return false;
  if (!L.visible) { if (!quiet) toast('The active layer is hidden. Show it to edit.'); return false; }
  if (L.dev) {
    if (Dev.isPending(L)) { toast('Finishing the full-resolution render. Try again in a moment.'); return false; }
    L.dev = null; touch(L); toast('Photo layer rasterized so it can be painted. Undo restores its develop settings.');
    emit('layerChanged');
  }
  return true;
}
function composePreview(f, erase) { const L = layer(), c = S.pc.getContext('2d'); c.save(); c.clearRect(0, 0, doc.w, doc.h); c.drawImage(L.canvas, 0, 0); c.globalAlpha = S.o.opacity / 100; c.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; c.drawImage(f, 0, 0); c.restore(); S.preview = { i: doc.active, canvas: S.pc }; render(); }
function commitPreview(label) { if (!S.preview) return; layer().canvas = S.preview.canvas; S.preview = null; snapshot(label); }
function clearPreview() { S.preview = null; S.temp = null; render(); }
function makeTip(size, hard, color) {
  const d = Math.max(2, Math.ceil(size) + 2), t = mk(d, d), c = t.getContext('2d'), r = Math.max(.5, size / 2), m = d / 2;
  if (hard >= 99) { c.fillStyle = color; c.beginPath(); c.arc(m, m, r, 0, 7); c.fill(); }
  else { const rgb = hexRgb(color).join(','), g = c.createRadialGradient(m, m, r * hard / 100, m, m, r); g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(0, 0, d, d); }
  return t;
}
function beginStroke() { S.stroke = mk(doc.w, doc.h); S.sctx = S.stroke.getContext('2d'); S.mask = selMask(); S.tip = makeTip(S.o.size, S.o.hardness, S.tool === 'clone' ? '#ffffff' : S.fg); S.pc = mk(doc.w, doc.h); if (S.tool === 'clone') { S.cloneSnap = cloneC(layer().canvas); S.ctmp = mk(S.tip.width, S.tip.height); } }
function stamp(p) {
  const t = S.tip, h = t.width / 2;
  if (S.tool === 'clone') { const c = S.ctmp.getContext('2d'); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, t.width, t.height); c.drawImage(S.cloneSnap, -(p.x + S.cloneOff.x - h), -(p.y + S.cloneOff.y - h)); c.globalCompositeOperation = 'destination-in'; c.drawImage(t, 0, 0); S.sctx.drawImage(S.ctmp, p.x - h, p.y - h); }
  else S.sctx.drawImage(t, p.x - h, p.y - h);
}
function stampLine(a, b) { const dist = Math.hypot(b.x - a.x, b.y - a.y); if (dist === 0) stamp(b); else { const n = Math.ceil(dist / Math.max(1, S.o.size * .12)); for (let i = 1; i <= n; i++) stamp({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }); } S.last = b; if (S.mask) clipTo(S.stroke, S.mask); composePreview(S.stroke, S.tool === 'eraser'); }
function flood(img, x, y, tol, contig) {
  const d = img.data, W = img.width, H = img.height, N = W * H, k0 = (y * W + x) * 4, r0 = d[k0], g0 = d[k0 + 1], b0 = d[k0 + 2], a0 = d[k0 + 3], out = new Uint8Array(N);
  const ok = i => { const k = i * 4; return Math.abs(d[k] - r0) <= tol && Math.abs(d[k + 1] - g0) <= tol && Math.abs(d[k + 2] - b0) <= tol && Math.abs(d[k + 3] - a0) <= tol; };
  if (!contig) { for (let i = 0; i < N; i++) if (ok(i)) out[i] = 1; return out; }
  const st = new Int32Array(N); let sp = 0; const s0 = y * W + x; st[sp++] = s0; out[s0] = 1;
  while (sp) {
    const i = st[--sp], px = i % W;
    if (px > 0 && !out[i - 1] && ok(i - 1)) { out[i - 1] = 1; st[sp++] = i - 1; }
    if (px < W - 1 && !out[i + 1] && ok(i + 1)) { out[i + 1] = 1; st[sp++] = i + 1; }
    if (i >= W && !out[i - W] && ok(i - W)) { out[i - W] = 1; st[sp++] = i - W; }
    if (i < N - W && !out[i + W] && ok(i + W)) { out[i + W] = 1; st[sp++] = i + W; }
  }
  return out;
}

/* ---------- tools ---------- */
const T = {};
T.brush = T.eraser = { down(p) { if (!canPaint()) return false; beginStroke(); stampLine(p, p); }, move(p) { stampLine(S.last, p); }, up() { commitPreview(S.tool === 'eraser' ? 'Eraser' : 'Brush Tool'); } };
T.clone = { down(p) { if (!S.cloneSrc) { toast('Alt-click to set a clone source first.'); return false; } if (!canPaint()) return false; if (!S.cloneOff || !S.o.aligned) S.cloneOff = { x: S.cloneSrc.x - p.x, y: S.cloneSrc.y - p.y }; beginStroke(); stampLine(p, p); }, move(p) { stampLine(S.last, p); }, up() { commitPreview('Clone Stamp'); } };
T.fill = { down(p) { if (!canPaint()) return false; const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return false; const L = layer(), img = L.canvas.getContext('2d').getImageData(0, 0, doc.w, doc.h), m = flood(img, x, y, S.o.tolerance, S.o.contiguous); const f = mk(doc.w, doc.h), fc = f.getContext('2d'), fi = fc.createImageData(doc.w, doc.h), [r, g, b] = hexRgb(S.fg); for (let i = 0; i < m.length; i++) if (m[i]) { const k = i * 4; fi.data[k] = r; fi.data[k + 1] = g; fi.data[k + 2] = b; fi.data[k + 3] = 255; } fc.putImageData(fi, 0, 0); clipTo(f, selMask()); S.pc = mk(doc.w, doc.h); composePreview(f); commitPreview('Paint Bucket'); return false; } };
T.gradient = {
  down(p) { if (!canPaint()) return false; S.g0 = p; S.g1 = null; S.pc = mk(doc.w, doc.h); S.mask = selMask(); },
  move(p, e) { let b = p; if (e.shiftKey) { const a = S.g0, ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(p.x - a.x, p.y - a.y); b = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d }; } S.g1 = b; const a = S.g0, f = mk(doc.w, doc.h), c = f.getContext('2d');
    const g = S.o.gradType === 'linear' ? c.createLinearGradient(a.x, a.y, b.x, b.y) : c.createRadialGradient(a.x, a.y, 0, a.x, a.y, Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)));
    g.addColorStop(0, S.fg); g.addColorStop(1, S.o.gradColors === 'fgbg' ? S.bg : `rgba(${hexRgb(S.fg).join(',')},0)`); c.fillStyle = g; c.fillRect(0, 0, doc.w, doc.h); clipTo(f, S.mask); S.temp = { kind: 'line', a, b }; composePreview(f); },
  up() { S.temp = null; if (S.g1 && Math.hypot(S.g1.x - S.g0.x, S.g1.y - S.g0.y) > 1) commitPreview('Gradient'); else clearPreview(); }
};
T.shape = {
  down(p) { if (!canPaint()) return false; S.s0 = p; S.s1 = null; S.pc = mk(doc.w, doc.h); S.mask = selMask(); },
  move(p, e) { const a = S.s0, f = mk(doc.w, doc.h), c = f.getContext('2d'); c.fillStyle = c.strokeStyle = S.fg; c.lineWidth = S.o.strokeW; c.lineCap = 'round'; c.lineJoin = 'round';
    if (S.o.shape === 'line') { let b = p; if (e.shiftKey) { const ang = Math.round(Math.atan2(p.y - a.y, p.x - a.x) / (Math.PI / 4)) * (Math.PI / 4), d = Math.hypot(p.x - a.x, p.y - a.y); b = { x: a.x + Math.cos(ang) * d, y: a.y + Math.sin(ang) * d }; } c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    else { const r = rectFrom(a, p, e.shiftKey); c.beginPath(); if (S.o.shape === 'rect') c.rect(r.x, r.y, r.w, r.h); else if (S.o.shape === 'round') c.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * .18); else c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); S.o.shapeMode === 'fill' ? c.fill() : c.stroke(); }
    S.s1 = p; clipTo(f, S.mask); composePreview(f); },
  up() { if (S.s1 && Math.hypot(S.s1.x - S.s0.x, S.s1.y - S.s0.y) > 1) commitPreview({ rect: 'Rectangle', round: 'Rounded Rectangle', ellipse: 'Ellipse', line: 'Line' }[S.o.shape]); else clearPreview(); }
};
T.marquee = { down(p) { S.m0 = p; S.temp = null; }, move(p, e) { S.temp = { kind: 'sel', sel: { type: S.o.marquee, ...rectFrom(S.m0, p, e.shiftKey), inv: false } }; drawOverlay(); },
  up() { const t = S.temp; S.temp = null; if (!t || t.sel.w < 2 || t.sel.h < 2) { if (doc.sel) { doc.sel = null; snapshot('Deselect'); } drawOverlay(); return; } doc.sel = t.sel; snapshot(S.o.marquee === 'rect' ? 'Rectangular Marquee' : 'Elliptical Marquee'); } };
T.lasso = { down(p) { S.temp = { kind: 'sel', sel: { type: 'lasso', pts: [p], inv: false } }; }, move(p) { const pts = S.temp.sel.pts, l = pts[pts.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) > 1.5 / S.zoom) { pts.push(p); drawOverlay(); } },
  up() { const t = S.temp; S.temp = null; if (!t || t.sel.pts.length < 3) { if (doc.sel) { doc.sel = null; snapshot('Deselect'); } drawOverlay(); return; } doc.sel = t.sel; snapshot('Lasso'); } };
T.move = {
  down(p) { if (!canPaint()) return false; const L = layer(); S.mv = { p0: p, dx: 0, dy: 0 }; if (doc.sel) { const m = selMask(); S.mv.float = clipTo(cloneC(L.canvas), m); const base = cloneC(L.canvas), bc = base.getContext('2d'); bc.globalCompositeOperation = 'destination-out'; bc.drawImage(m, 0, 0); S.mv.base = base; } else { S.mv.float = L.canvas; S.mv.base = null; } S.pc = mk(doc.w, doc.h); },
  move(p, e) { let dx = Math.round(p.x - S.mv.p0.x), dy = Math.round(p.y - S.mv.p0.y); if (e && e.shiftKey) { Math.abs(dx) > Math.abs(dy) ? dy = 0 : dx = 0; } S.mv.dx = dx; S.mv.dy = dy; movePreview(); },
  up() { const { dx, dy } = S.mv; S.selOff = null; if (!dx && !dy) { clearPreview(); return; } if (doc.sel) offsetSel(dx, dy); commitPreview('Move'); }
};
function movePreview() { const c = S.pc.getContext('2d'); c.clearRect(0, 0, doc.w, doc.h); if (S.mv.base) c.drawImage(S.mv.base, 0, 0); c.drawImage(S.mv.float, S.mv.dx, S.mv.dy); S.preview = { i: doc.active, canvas: S.pc }; if (doc.sel) S.selOff = { dx: S.mv.dx, dy: S.mv.dy }; render(); }
function offsetSel(dx, dy) { const s = doc.sel; if (s.type === 'lasso') s.pts = s.pts.map(p => ({ x: p.x + dx, y: p.y + dy })); else { s.x += dx; s.y += dy; } }
function nudge(dx, dy) { if (T.move.down({ x: 0, y: 0 }) === false) return; S.mv.dx = dx; S.mv.dy = dy; movePreview(); T.move.up(); }
T.crop = { down(p) { S.c0 = p; S.crop = null; }, move(p, e) { const r = rectFrom(S.c0, p, e.shiftKey); const x0 = Math.max(0, r.x), y0 = Math.max(0, r.y); S.crop = { x: x0, y: y0, w: Math.min(doc.w, r.x + r.w) - x0, h: Math.min(doc.h, r.y + r.h) - y0 }; drawOverlay(); updateStatus(); }, up() { if (S.crop && (S.crop.w < 4 || S.crop.h < 4)) S.crop = null; buildOptions(); drawOverlay(); } };
T.eyedropper = { down(p, e) { pick(p, e.altKey); }, move(p, e) { pick(p, e.altKey); }, up() {} };
function pick(p, bg) { const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= doc.w || y >= doc.h) return; const d = vctx.getImageData(x, y, 1, 1).data; if (!d[3]) return; setColor(bg ? 'bg' : 'fg', rgbHex(d[0], d[1], d[2])); }
T.hand = { down(p, e) { S.pan = { x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop }; }, move(p, e) { vp.scrollLeft = S.pan.l - (e.clientX - S.pan.x); vp.scrollTop = S.pan.t - (e.clientY - S.pan.y); }, up() {} };
T.zoom = { down(p, e) { setZoom(S.zoom * (e.altKey ? 1 / 1.5 : 1.5), e.clientX, e.clientY); return false; } };
T.text = { down(p) { placeText(p); return false; } };

/* ---------- type ---------- */
const fontStr = px => `${S.o.bold ? '700 ' : ''}${px}px "${S.o.font}", sans-serif`;
function placeText(p) {
  commitText();
  if (!layer()) return;
  const ta = document.createElement('textarea'); ta.className = 'text-edit'; ta.id = 'typeEditor'; ta.spellcheck = false; ta.setAttribute('aria-label', 'Type text');
  stage.appendChild(ta); S.textEd = { ta, p }; positionText();
  ta.addEventListener('input', positionText);
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } else if (e.key === 'Escape') { e.preventDefault(); cancelText(); } });
  ta.addEventListener('blur', () => { if (S.textEd && S.textEd.ta === ta) commitText(); });
  setTimeout(() => ta.focus(), 0);
}
function positionText() {
  const t = S.textEd; if (!t) return; const z = S.zoom, px = S.o.fontSize, ta = t.ta;
  ta.style.font = fontStr(px * z); ta.style.lineHeight = '1.2'; ta.style.color = S.fg; ta.style.left = t.p.x * z + 'px'; ta.style.top = t.p.y * z + 'px';
  const c = octx; c.save(); c.font = fontStr(px); const lines = ta.value.split('\n'); const w = Math.max(px * .6, ...lines.map(l => c.measureText(l).width)); c.restore();
  ta.style.width = (w + px * .5) * z + 'px'; ta.style.height = lines.length * px * 1.2 * z + 2 + 'px';
}
function cancelText() { const t = S.textEd; if (!t) return; S.textEd = null; t.ta.remove(); }
async function commitText() {
  const t = S.textEd; if (!t) return; S.textEd = null; const txt = t.ta.value; t.ta.remove(); if (!txt.trim() || !doc) return;
  try { await document.fonts.load(fontStr(S.o.fontSize)); } catch (e) {}
  const L = newLayer(txt.replace(/\s+/g, ' ').trim().slice(0, 28)), c = L.canvas.getContext('2d'), px = S.o.fontSize; c.font = fontStr(px); c.fillStyle = S.fg; c.textBaseline = 'top';
  txt.split('\n').forEach((line, i) => c.fillText(line, t.p.x, t.p.y + px * .1 + i * px * 1.2));
  doc.layers.splice(doc.active + 1, 0, L); doc.active++; snapshot('Type Layer');
}

/* ---------- pointer ---------- */
vp.addEventListener('pointerdown', e => {
  if (!doc) return;
  if (e.target.closest('.text-edit')) return; if (e.button === 2) return;
  e.preventDefault(); closeMenus();
  const tool = (S.space || e.button === 1) ? 'hand' : S.tool, p = pt(e); S.hover = p;
  if (tool === 'clone' && e.altKey) { S.cloneSrc = p; S.cloneOff = null; toast('Clone source set'); drawOverlay(); buildOptions(); return; }
  if (tool !== 'text') commitText();
  const r = T[tool].down(p, e); if (r === false) return;
  S.drag = { tool }; try { vp.setPointerCapture(e.pointerId); } catch (_) {}
});
vp.addEventListener('pointermove', e => {
  if (!doc) return;
  const p = pt(e); S.hover = p; $('#stPos').textContent = `X ${Math.round(p.x)}  Y ${Math.round(p.y)}`;
  if (S.drag) { const f = T[S.drag.tool].move; f && f(p, e); if (S.tool === 'clone') drawOverlay(); }
  else if (['brush', 'eraser', 'clone'].includes(S.tool)) drawOverlay();
});
const endDrag = e => { if (!S.drag) return; const t = S.drag.tool; S.drag = null; const f = T[t].up; f && f(pt(e), e); drawOverlay(); };
vp.addEventListener('pointerup', endDrag); vp.addEventListener('pointercancel', endDrag);
vp.addEventListener('pointerleave', () => { if (!S.drag && doc) { S.hover = null; drawOverlay(); } });
vp.addEventListener('contextmenu', e => e.preventDefault());
vp.addEventListener('wheel', e => { if (!doc) return; if (e.ctrlKey || e.metaKey || e.altKey) { e.preventDefault(); setZoom(S.zoom * Math.exp(-e.deltaY * .0025), e.clientX, e.clientY); } }, { passive: false });

/* ---------- edit commands ---------- */
function clearPx(label = 'Clear') { if (!doc || !canPaint()) return; const L = layer(), c = L.canvas.getContext('2d'); if (doc.sel) { c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(selMask(), 0, 0); c.restore(); } else c.clearRect(0, 0, doc.w, doc.h); touch(L); snapshot(label); }
function fillSel(which) { if (!doc || !canPaint()) return; const f = mk(doc.w, doc.h), c = f.getContext('2d'); c.fillStyle = S[which]; c.fillRect(0, 0, doc.w, doc.h); clipTo(f, selMask()); const L = layer(); L.canvas.getContext('2d').drawImage(f, 0, 0); touch(L); snapshot('Fill'); }
const selectAll = () => { if (!doc) return; doc.sel = { type: 'rect', x: 0, y: 0, w: doc.w, h: doc.h, inv: false }; snapshot('Select All'); };
const deselect = () => { if (!doc || !doc.sel) return; doc.sel = null; snapshot('Deselect'); };
const inverse = () => { if (!doc) return; if (!doc.sel) { toast('Make a selection first.'); return; } doc.sel.inv = !doc.sel.inv; snapshot('Inverse'); };

/* ---------- layer commands ---------- */
function addLayer(L, label) { doc.layers.splice(doc.active + 1, 0, L); doc.active++; snapshot(label); }
const cmdNewLayer = () => addLayer(newLayer('Layer ' + (doc.layers.length + 1)), 'New Layer');
function cmdDup() { const L = layer(); const n = { ...L, id: uid++, name: L.name + ' copy', canvas: cloneC(L.canvas), ver: 0, dev: L.dev ? { ...L.dev, settings: devClone(L.dev.settings) } : null }; addLayer(n, 'Duplicate Layer'); if (n.dev) Dev.requestRender(n, 'proxy'); }
function cmdViaCopy() { if (!doc.sel) return cmdDup(); const L = layer(); addLayer({ ...newLayer('Layer via Copy'), canvas: clipTo(cloneC(L.canvas), selMask()) }, 'Layer via Copy'); }
function cmdDel() { if (doc.layers.length < 2) { toast('An image needs at least one layer.'); return; } doc.layers.splice(doc.active, 1); doc.active = Math.max(0, doc.active - 1); snapshot('Delete Layer'); }
async function cmdMerge() { if (doc.active === 0) { toast('There is no layer below to merge into.'); return; } await Dev.ready(doc); const top = layer(), bot = doc.layers[doc.active - 1], n = cloneC(bot.canvas), c = n.getContext('2d'); if (top.visible) { c.globalAlpha = top.opacity; c.globalCompositeOperation = top.blend; c.drawImage(top.canvas, 0, 0); } bot.canvas = n; bot.dev = null; bot.ver = 0; doc.layers.splice(doc.active, 1); doc.active--; snapshot('Merge Down'); }
async function cmdFlatten() { await Dev.ready(doc); const f = flatten(); const L = newLayer('Background'); L.canvas = f; doc.layers = [L]; doc.active = 0; snapshot('Flatten Image'); }
function cmdArrange(dir) { const i = doc.active, j = i + dir; if (j < 0 || j >= doc.layers.length) return; [doc.layers[i], doc.layers[j]] = [doc.layers[j], doc.layers[i]]; doc.active = j; snapshot(dir > 0 ? 'Bring Forward' : 'Send Backward'); }
function flipLayer(h) { if (!canPaint()) return; const L = layer(), n = mk(doc.w, doc.h), c = n.getContext('2d'); h ? (c.translate(doc.w, 0), c.scale(-1, 1)) : (c.translate(0, doc.h), c.scale(1, -1)); c.drawImage(L.canvas, 0, 0); L.canvas = n; snapshot(h ? 'Flip Layer Horizontal' : 'Flip Layer Vertical'); }

/* ---------- image commands ---------- */
async function transformAll(nw, nh, fn, label, resampler) {
  if (!doc) return;
  cancelText();
  const hasDev = doc.layers.some(L => L.dev);
  if (hasDev) { await Dev.ready(doc); doc.layers.forEach(L => { if (L.dev) { L.dev = null; touch(L); } }); }
  for (const L of doc.layers) {
    if (resampler) { L.canvas = await resampler(L.canvas); continue; }
    const n = mk(nw, nh), c = n.getContext('2d'); c.imageSmoothingQuality = 'high'; fn(c, L.canvas); L.canvas = n;
  }
  doc.w = Math.round(nw); doc.h = Math.round(nh); doc.sel = null; S.crop = null; resizeViews(); snapshot(label); fit();
  if (hasDev) toast('Photo layers were rasterized for this change. Undo restores their develop settings.');
}
const rot = deg => { const w = doc.w, h = doc.h; if (deg === 90) transformAll(h, w, (c, s) => { c.translate(h, 0); c.rotate(Math.PI / 2); c.drawImage(s, 0, 0); }, 'Rotate 90° Clockwise'); else if (deg === -90) transformAll(h, w, (c, s) => { c.translate(0, w); c.rotate(-Math.PI / 2); c.drawImage(s, 0, 0); }, 'Rotate 90° Counter Clockwise'); else transformAll(w, h, (c, s) => { c.translate(w, h); c.rotate(Math.PI); c.drawImage(s, 0, 0); }, 'Rotate 180°'); };
const flipCanvas = hz => { const w = doc.w, h = doc.h; transformAll(w, h, (c, s) => { hz ? (c.translate(w, 0), c.scale(-1, 1)) : (c.translate(0, h), c.scale(1, -1)); c.drawImage(s, 0, 0); }, hz ? 'Flip Canvas Horizontal' : 'Flip Canvas Vertical'); };
function applyCrop(r, label = 'Crop') { r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }; transformAll(r.w, r.h, (c, s) => c.drawImage(s, -r.x, -r.y), label); }
const cropToSel = () => { if (!doc.sel) { toast('Make a selection first.'); return; } applyCrop(selBounds(), 'Crop to Selection'); };

/* ---------- adjustments & filters (pixel layers) ---------- */
function premul(d, dir) { for (let i = 0; i < d.length; i += 4) { const a = d[i + 3]; if (dir > 0) { const f = a / 255; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; } else if (a) { const f = 255 / a; d[i] = clamp(d[i] * f); d[i + 1] = clamp(d[i + 1] * f); d[i + 2] = clamp(d[i + 2] * f); } } }
function blurPass(src, dst, W, H, r, horiz) {
  const iarr = 1 / (r + r + 1), outer = horiz ? H : W, inner = horiz ? W : H, so = horiz ? W * 4 : 4, si = horiz ? 4 : W * 4, last = inner - 1;
  for (let o = 0; o < outer; o++) { const base = o * so; for (let ch = 0; ch < 4; ch++) { const first = src[base + ch], lastv = src[base + last * si + ch]; let val = (r + 2) * first; for (let j = 1; j < r; j++) val += src[base + Math.min(j, last) * si + ch];
    for (let x = 0; x < inner; x++) { const ai = x + r, bi = x - r - 1; val += (ai > last ? lastv : src[base + ai * si + ch]) - (bi < 0 ? first : src[base + bi * si + ch]); dst[base + x * si + ch] = val * iarr; } } }
}
function gauss(d, W, H, rad) { if (rad < .5) return; const r = Math.max(1, Math.round(rad * .75)), tmp = new Float32Array(d.length), a = Float32Array.from(d); for (let k = 0; k < 3; k++) { blurPass(a, tmp, W, H, r, true); blurPass(tmp, a, W, H, r, false); } for (let i = 0; i < d.length; i++) d[i] = a[i]; }
const h2r = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
const ADJ = {
  brightness: { label: 'Brightness/Contrast…', p: [['Brightness', -150, 150, 0], ['Contrast', -100, 100, 0]], f(d, [b, c]) { const C = c * 2.54, k = 259 * (C + 255) / (255 * (259 - C)); for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = clamp(k * (d[i + j] + b - 128) + 128); } },
  levels: { label: 'Levels…', p: [['Input black', 0, 253, 0], ['Midtones (gamma)', .1, 3, 1, .01], ['Input white', 2, 255, 255]], f(d, [bl, g, wh]) { if (wh <= bl) wh = bl + 1; const lut = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) { const t = Math.min(1, Math.max(0, (v - bl) / (wh - bl))); lut[v] = Math.pow(t, 1 / g) * 255; } for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; } } },
  hsl: { label: 'Hue/Saturation…', p: [['Hue', -180, 180, 0], ['Saturation', -100, 100, 0], ['Lightness', -100, 100, 0]], f(d, [h, s, l]) { const hs = h / 360; for (let i = 0; i < d.length; i += 4) { let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let H = 0, Sa = 0, L = (mx + mn) / 2; if (mx !== mn) { const dd = mx - mn; Sa = L > .5 ? dd / (2 - mx - mn) : dd / (mx + mn); H = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; H /= 6; }
    H = ((H + hs) % 1 + 1) % 1; Sa = s >= 0 ? Sa + (1 - Sa) * s / 100 * Sa : Sa * (1 + s / 100); L = l >= 0 ? L + (1 - L) * l / 100 : L * (1 + l / 100); if (Sa === 0) r = g = b = L; else { const q = L < .5 ? L * (1 + Sa) : L + Sa - L * Sa, p = 2 * L - q; r = h2r(p, q, H + 1 / 3); g = h2r(p, q, H); b = h2r(p, q, H - 1 / 3); } d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; } } },
  temp: { label: 'Color Balance…', p: [['Temperature', -100, 100, 0], ['Tint', -100, 100, 0]], f(d, [t, n]) { for (let i = 0; i < d.length; i += 4) { d[i] = clamp(d[i] + t * .6); d[i + 1] = clamp(d[i + 1] - n * .6); d[i + 2] = clamp(d[i + 2] - t * .6); } } },
  exposure: { label: 'Exposure…', p: [['Exposure (stops)', -3, 3, 0, .05]], f(d, [e]) { const k = Math.pow(2, e); for (let i = 0; i < d.length; i += 4) { d[i] = clamp(d[i] * k); d[i + 1] = clamp(d[i + 1] * k); d[i + 2] = clamp(d[i + 2] * k); } } },
  threshold: { label: 'Threshold…', p: [['Threshold level', 1, 255, 128]], f(d, [t]) { for (let i = 0; i < d.length; i += 4) { const v = (.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) >= t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } } },
  posterize: { label: 'Posterize…', p: [['Levels', 2, 16, 4]], f(d, [n]) { const s = 255 / (n - 1); for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = Math.round(Math.round(d[i + j] / s) * s); } },
  invert: { label: 'Invert', f(d) { for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; } } },
  desat: { label: 'Desaturate', f(d) { for (let i = 0; i < d.length; i += 4) { const v = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = v; } } },
  sepia: { label: 'Sepia', f(d) { for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; d[i] = clamp(.393 * r + .769 * g + .189 * b); d[i + 1] = clamp(.349 * r + .686 * g + .168 * b); d[i + 2] = clamp(.272 * r + .534 * g + .131 * b); } } },
  auto: { label: 'Auto Contrast', f(d) { let lo = 255, top = 0; for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const v = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; if (v < lo) lo = v; if (v > top) top = v; } if (top - lo < 2) return; const k = 255 / (top - lo); for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = clamp((d[i + j] - lo) * k); } },
  blur: { label: 'Gaussian Blur…', p: [['Radius (px)', 0, 60, 6, .5]], f(d, [r], W, H) { premul(d, 1); gauss(d, W, H, r); premul(d, -1); } },
  sharpen: { label: 'Unsharp Mask…', p: [['Amount (%)', 0, 300, 120], ['Radius (px)', .5, 8, 1.5, .5]], f(d, [a, r], W, H) { const b = Uint8ClampedArray.from(d); gauss(b, W, H, r); const k = a / 100; for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = clamp(d[i + j] + (d[i + j] - b[i + j]) * k); } },
  noise: { label: 'Add Noise…', p: [['Amount (%)', 0, 100, 12]], f(d, [a]) { const k = a * 2.55; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - .5) * k; d[i] = clamp(d[i] + n); d[i + 1] = clamp(d[i + 1] + n); d[i + 2] = clamp(d[i + 2] + n); } } },
  pixelate: { label: 'Mosaic…', p: [['Cell size (px)', 2, 80, 12]], f(d, [s], W, H) { s = Math.round(s); for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) { let r = 0, g = 0, b = 0, a = 0, n = 0; const ye = Math.min(H, y + s), xe = Math.min(W, x + s); for (let yy = y; yy < ye; yy++) for (let xx = x; xx < xe; xx++) { const k = (yy * W + xx) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; a += d[k + 3]; n++; } r /= n; g /= n; b /= n; a /= n; for (let yy = y; yy < ye; yy++) for (let xx = x; xx < xe; xx++) { const k = (yy * W + xx) * 4; d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = a; } } } },
  vignette: { label: 'Vignette…', p: [['Amount (%)', 0, 100, 55], ['Midpoint (%)', 0, 95, 45]], f(d, [a, m], W, H) { const cx = W / 2, cy = H / 2, s = m / 100, k = a / 100; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const nd = Math.hypot((x - cx) / cx, (y - cy) / cy) / 1.4142, t = Math.min(1, Math.max(0, (nd - s) / (1 - s))), f = 1 - k * t * t * (3 - 2 * t), i = (y * W + x) * 4; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; } } },
  emboss: { label: 'Emboss', f(d, v, W, H) { const s = Uint8ClampedArray.from(d); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, j = (Math.max(0, y - 1) * W + Math.max(0, x - 1)) * 4, q = (Math.min(H - 1, y + 1) * W + Math.min(W - 1, x + 1)) * 4; for (let c = 0; c < 3; c++) d[i + c] = clamp(128 + (s[q + c] - s[j + c]) * 1.5); } } },
  edges: { label: 'Find Edges', f(d, v, W, H) { const s = Uint8ClampedArray.from(d), L = i => .299 * s[i] + .587 * s[i + 1] + .114 * s[i + 2]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const at = (xx, yy) => L((Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))) * 4); const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1), gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1); const m = 255 - clamp(Math.hypot(gx, gy)); const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = m; } } }
};
function runAdj(A, orig, vals, mask) { const c = cloneC(orig), x = c.getContext('2d'), img = x.getImageData(0, 0, c.width, c.height); A.f(img.data, vals, c.width, c.height); x.putImageData(img, 0, 0); return mask ? mergeSel(orig, c, mask) : c; }
function openAdj(key) {
  if (!doc) return;
  const L0 = layer();
  if (L0 && L0.dev && ['brightness', 'levels', 'hsl', 'temp', 'exposure', 'auto', 'desat'].includes(key) && !doc.sel) {
    toast('Tip: this is a photo layer. The Develop panel adjusts it without losing quality.');
  }
  if (!canPaint()) return; const A = ADJ[key], L = layer(), orig = cloneC(L.canvas), mask = selMask(), name = A.label.replace('…', '');
  if (!A.p) { L.canvas = runAdj(A, orig, [], mask); snapshot(name); return; }
  const vals = A.p.map(p => p[3]); let pend = false, prevOn = true;
  const run = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; S.preview = prevOn ? { i: doc.active, canvas: runAdj(A, orig, vals, mask) } : null; render(); }); };
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '14px';
  A.p.forEach(([lab, min, max, def, step = 1], k) => body.append(sliderField(lab, min, max, def, step, v => { vals[k] = v; run(); }, 'adj' + k)));
  if (mask) body.append(Object.assign(document.createElement('div'), { className: 'note', textContent: 'Applies inside the current selection only.' }));
  modal({ title: name, body, preview: v => { prevOn = v; run(); }, onOk: () => { L.canvas = runAdj(A, orig, vals, mask); snapshot(name); }, onCancel: () => { S.preview = null; render(); } }); run();
}
function sliderField(label, min, max, def, step, on, id) { const f = document.createElement('label'); f.className = 'field'; f.innerHTML = `<span>${label}</span><div class="slide"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${def}"><input type="number" min="${min}" max="${max}" step="${step}" value="${def}" aria-label="${label}"></div>`; const [r, n] = f.querySelectorAll('input'); r.oninput = () => { n.value = r.value; on(+r.value); }; n.oninput = () => { if (n.value === '') return; r.value = n.value; on(+n.value); }; return f; }

/* ---------- modal ---------- */
function modal({ title, body, ok = 'OK', onOk, onCancel, preview, wide, hideCancel, extra }) {
  closeMenus(); $('#mTitle').textContent = title; const b = $('#mBody'); b.innerHTML = ''; b.append(body); $('#mOk').textContent = ok; $('#mCancel').hidden = !!hideCancel; $('#dialog').classList.toggle('wide', !!wide);
  $('#mPrevWrap').style.visibility = preview ? 'visible' : 'hidden'; $('#mPrev').checked = true; $('#mPrev').onchange = e => preview && preview(e.target.checked);
  $('#dialog .foot .extra')?.remove();
  if (extra) { const x = document.createElement('button'); x.className = 'btn extra'; x.textContent = extra[0]; x.onclick = () => { const m = S.modal; S.modal = null; $('#modal').hidden = true; extra[1](); }; $('#dialog .foot .r').prepend(x); }
  $('#modal').hidden = false; S.modal = { onOk, onCancel }; const f = b.querySelector('input:not([type=checkbox]),select'); setTimeout(() => (f || $('#mOk')).focus(), 0);
}
function closeModal(ok) { const m = S.modal; if (!m) return; S.modal = null; $('#modal').hidden = true; const f = ok ? m.onOk : m.onCancel; f && f(); }
function ask(title, text, buttons) {
  return new Promise(res => {
    const body = document.createElement('div'); body.className = 'note'; body.textContent = text;
    const def = buttons.find(b => b[2]) || buttons[0], cancel = buttons.find(b => b[0] === 'cancel');
    const others = buttons.filter(b => b !== def && b !== cancel);
    modal({ title, body, ok: def[1], onOk: () => res(def[0]), onCancel: () => res(cancel ? 'cancel' : null), extra: others[0] ? [others[0][1], () => res(others[0][0])] : null, hideCancel: !cancel });
  });
}
$('#mOk').onclick = () => closeModal(true); $('#mCancel').onclick = () => closeModal(false);
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeModal(false); });

let tt; function toast(m, ms = 2600) { const t = $('#toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(tt); tt = setTimeout(() => t.style.opacity = 0, ms); }
let busyN = 0;
function busy(on, text) { busyN = Math.max(0, busyN + (on ? 1 : -1)); if (text) $('#busyText').textContent = text; $('#busy').hidden = busyN === 0; }

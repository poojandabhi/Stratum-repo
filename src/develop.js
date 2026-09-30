/* Develop: engine client, Lightroom-style panel, presets, copy/paste/sync settings, Match Look. */
const Dev = (() => {
  const wFull = new Worker('develop-worker.js'), wFast = new Worker('develop-worker.js');
  let job = 1, srcSeq = 1;
  const waits = new Map();
  const onMsg = e => { const m = e.data, w = waits.get(m.job); if (!w) return; waits.delete(m.job); m.type === 'error' ? w.rej(new Error(m.message)) : w.res(m); };
  wFull.onmessage = onMsg; wFast.onmessage = onMsg;
  const call = (w, msg, transfer) => { const j = job++; msg.job = j; return new Promise((res, rej) => { waits.set(j, { res, rej }); w.postMessage(msg, transfer || []); }); };
  const R = new WeakMap();
  const st = L => { let r = R.get(L); if (!r) { r = { fastBusy: false, fastNext: null, fullBusy: false, fullNext: false, timer: null, token: 0, waiters: [] }; R.set(L, r); } return r; };
  let before = false;
  const effSettings = L => before ? devDefaults() : L.dev.settings;
  const sources = new Map();

  async function addSource({ w, h, rgb, alpha }) {
    const id = srcSeq++;
    const a = await call(wFull, { type: 'source', id, w, h, rgb, alpha, wantProxy: true }, [rgb.buffer, ...(alpha ? [alpha.buffer] : [])]);
    await call(wFast, { type: 'source', id, w: a.proxy.w, h: a.proxy.h, rgb: a.proxy.rgb, alpha: a.proxy.alpha, fullW: w, proxyEdge: 1600 }, [a.proxy.rgb.buffer, ...(a.proxy.alpha ? [a.proxy.alpha.buffer] : [])]);
    sources.set(id, { w, h, stats: a.stats });
    return { srcId: id, stats: a.stats };
  }
  function paint(L, res, level) {
    if (!L.dev) return;
    const pl = L.dev.place || { x: 0, y: 0, w: L.canvas.width, h: L.canvas.height };
    const c = L.canvas.getContext('2d');
    const img = new ImageData(res.data, res.w, res.h);
    const full = level === 'full' && pl.x === 0 && pl.y === 0 && pl.w === res.w && pl.h === res.h && L.canvas.width === res.w && L.canvas.height === res.h;
    if (full) { c.putImageData(img, 0, 0); }
    else {
      const t = mk(res.w, res.h); t.getContext('2d').putImageData(img, 0, 0);
      c.save(); c.clearRect(0, 0, L.canvas.width, L.canvas.height); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(t, pl.x, pl.y, pl.w, pl.h); c.restore();
    }
    render();
  }
  function requestRender(L, level = 'quick') {
    if (!L || !L.dev) return;
    const r = st(L);
    const msg = { type: 'render', id: L.dev.srcId, settings: effSettings(L), level };
    if (r.fastBusy) r.fastNext = msg; else sendFast(L, msg);
    scheduleFull(L, level === 'quick' ? 650 : 250);
  }
  function sendFast(L, msg) {
    const r = st(L); r.fastBusy = true;
    call(wFast, msg).then(res => {
      r.fastBusy = false;
      if (L.dev && L.dev.srcId === msg.id) { if (!r.fullFresh) paint(L, res, res.level); L._hist = res.hist; if (L === photoLayer()) Panel.hist(res.hist); }
      if (r.fastNext) { const n = r.fastNext; r.fastNext = null; sendFast(L, n); }
      else if (!r.timer && !r.fullBusy) flushWaiters(r);
    }).catch(err => { r.fastBusy = false; toast(err.message); if (!r.timer && !r.fullBusy) flushWaiters(r); });
    r.fullFresh = false;
  }
  function scheduleFull(L, delay) {
    const r = st(L); clearTimeout(r.timer);
    r.timer = setTimeout(() => { r.timer = null; runFull(L); }, delay);
  }
  function runFull(L) {
    const r = st(L); if (!L.dev) { flushWaiters(r); return; }
    if (r.fullBusy) { r.fullNext = true; return; }
    r.fullBusy = true; const token = ++r.token; const s = devClone(effSettings(L)), srcId = L.dev.srcId;
    busy(true, 'Rendering full resolution…');
    call(wFull, { type: 'render', id: srcId, settings: s, level: 'full' }).then(res => {
      busy(false); r.fullBusy = false;
      const stale = !L.dev || L.dev.srcId !== srcId || JSON.stringify(effSettings(L)) !== JSON.stringify(s);
      if (!stale) { paint(L, res, 'full'); r.fullFresh = true; if (window.renderLayers) { renderLayers(); renderFilm(); } }
      if (r.fullNext || (stale && L.dev)) { r.fullNext = false; runFull(L); return; }
      if (!r.timer && !r.fastBusy) flushWaiters(r);
    }).catch(err => { busy(false); r.fullBusy = false; toast(err.message); flushWaiters(r); });
  }
  function flushWaiters(r) { const w = r.waiters.splice(0); w.forEach(f => f()); }
  const isPending = L => { const r = R.get(L); return !!(L.dev && r && (r.timer || r.fullBusy || r.fastBusy)); };
  function waitLayer(L) {
    const r = st(L);
    if (!L.dev || !(r.timer || r.fullBusy || r.fastBusy)) return Promise.resolve();
    if (r.timer) { clearTimeout(r.timer); r.timer = null; runFull(L); }
    return new Promise(res => r.waiters.push(res));
  }
  async function ready(d = doc) { if (!d) return; await Promise.all(d.layers.filter(L => L.dev).map(waitLayer)); }
  function renderAll(d, level = 'proxy') { d.layers.forEach(L => { if (L.dev) requestRender(L, level); }); }
  function dropDoc(d) {
    const ids = new Set(); d.layers.forEach(L => L.dev && ids.add(L.dev.srcId)); d.hist.forEach(h => h.layers.forEach(l => l.dev && ids.add(l.dev.srcId)));
    const inUse = new Set(); docs.forEach(o => { if (o === d) return; o.layers.forEach(L => L.dev && inUse.add(L.dev.srcId)); o.hist.forEach(h => h.layers.forEach(l => l.dev && inUse.add(l.dev.srcId))); });
    ids.forEach(id => { if (inUse.has(id)) return; sources.delete(id); call(wFull, { type: 'drop', id }); call(wFast, { type: 'drop', id }); });
  }
  const refStats = (rgb, w, h, alpha) => call(wFast, { type: 'refStats', rgb, w, h, alpha }, [rgb.buffer]).then(m => m.stats);
  const auto = srcId => call(wFast, { type: 'auto', id: srcId }).then(m => m.patch);
  const getSource = srcId => call(wFull, { type: 'getSource', id: srcId });
  function resizeCanvas(cv, nw, nh) {
    nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
    if (nw === cv.width && nh === cv.height) return Promise.resolve(cloneC(cv));
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    return call(wFull, { type: 'resize', data: d, w: cv.width, h: cv.height, nw, nh }, [d.buffer]).then(m => { const o = mk(m.w, m.h); o.getContext('2d').putImageData(new ImageData(m.data, m.w, m.h), 0, 0); return o; });
  }
  function setBefore(v) { before = v; docs.forEach(d => d.layers.forEach(L => L.dev && requestRender(L, 'proxy'))); }
  return { addSource, requestRender, renderAll, isPending, ready, dropDoc, refStats, auto, getSource, resizeCanvas, setBefore, get before() { return before; }, sources, waitLayer };
})();

/* ---------- helpers ---------- */
function photoLayer(d = doc) { if (!d) return null; const a = d.layers[d.active]; if (a && a.dev) return a; return d.layers.find(L => L.dev) || null; }
function rgba8ToSource(data, w, h) {
  const n = w * h, rgb = new Uint16Array(n * 3); let alpha = null;
  for (let i = 0; i < n; i++) { const k = i * 4, o = i * 3; rgb[o] = data[k] * 257; rgb[o + 1] = data[k + 1] * 257; rgb[o + 2] = data[k + 2] * 257; if (data[k + 3] < 255 && !alpha) { alpha = new Uint8Array(n).fill(255); } if (alpha) alpha[i] = data[k + 3]; }
  return { w, h, rgb, alpha };
}
async function convertToPhoto(L = layer(), label = 'Convert to Photo Layer', quiet) {
  if (!L) return null;
  if (L.dev) return L;
  const d = L.canvas.getContext('2d').getImageData(0, 0, L.canvas.width, L.canvas.height).data;
  busy(true, 'Preparing photo layer…');
  try {
    const src = rgba8ToSource(d, L.canvas.width, L.canvas.height);
    const { srcId } = await Dev.addSource(src);
    L.dev = { srcId, settings: devDefaults(), info: { kind: '8-bit pixels', w: src.w, h: src.h }, place: { x: 0, y: 0, w: src.w, h: src.h } };
    if (!quiet) snapshot(label);
    Dev.requestRender(L, 'proxy');
    return L;
  } finally { busy(false); }
}
function devScale(patch, amt, base = DEV_DEFAULTS) {
  if (amt === 1) return devClone(patch);
  const out = {}, lerp = (a, b) => a + (b - a) * amt;
  for (const k of Object.keys(patch)) {
    const v = patch[k], b = base[k];
    if (typeof v === 'number') out[k] = +lerp(b, v).toFixed(3);
    else if (typeof v === 'boolean') out[k] = amt >= 0.5 ? v : b;
    else if (k === 'curve') { out[k] = {}; for (const ch of ['rgb', 'r', 'g', 'b']) out[k][ch] = (v[ch] || [[0, 0], [1, 1]]).map(([x, y]) => [x, Math.max(0, Math.min(1, x + (y - x) * amt))]); }
    else if (k === 'hsl') out[k] = { hue: v.hue.map(x => x * amt), sat: v.sat.map(x => x * amt), lum: v.lum.map(x => x * amt) };
    else if (k === 'grade') out[k] = { ...v, shadowSat: v.shadowSat * amt, midSat: v.midSat * amt, highSat: v.highSat * amt, balance: v.balance * amt };
    else if (k === 'match') out[k] = v ? { ...v, amount: Math.min(100, v.amount * amt) } : v;
    else out[k] = devClone(v);
  }
  return out;
}
function curveLUTm(pts, n = 256) {
  const p = pts.slice().sort((a, b) => a[0] - b[0]), xs = p.map(q => q[0]), ys = p.map(q => q[1]), m = xs.length, lut = new Float32Array(n);
  const d = [], ms = new Array(m);
  for (let i = 0; i < m - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  ms[0] = d[0]; ms[m - 1] = d[m - 2]; for (let i = 1; i < m - 1; i++) ms[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < m - 1; i++) { if (d[i] === 0) { ms[i] = ms[i + 1] = 0; continue; } const a = ms[i] / d[i], b = ms[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); ms[i] = t * a * d[i]; ms[i + 1] = t * b * d[i]; } }
  let seg = 0;
  for (let k = 0; k < n; k++) { const x = k / (n - 1); if (x <= xs[0]) { lut[k] = ys[0]; continue; } if (x >= xs[m - 1]) { lut[k] = ys[m - 1]; continue; } while (seg < m - 2 && x > xs[seg + 1]) seg++; const h = xs[seg + 1] - xs[seg], t = (x - xs[seg]) / h, t2 = t * t, t3 = t2 * t; lut[k] = Math.max(0, Math.min(1, (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * ms[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * ms[seg + 1])); }
  return lut;
}

/* ---------- presets store ---------- */
const Presets = {
  user: [],
  async load() { try { this.user = desktop ? await desktop.loadPresets() : JSON.parse(localStorage.getItem('stratum.presets') || '[]'); } catch (e) { this.user = []; } },
  async save() { try { desktop ? await desktop.savePresets(this.user) : localStorage.setItem('stratum.presets', JSON.stringify(this.user)); } catch (e) { toast('Presets could not be saved.'); } },
  all() { return [...BUILTIN_PRESETS.map(p => ({ ...p, builtin: true })), ...this.user.map(p => ({ ...p, group: p.group || 'User Presets' }))]; }
};

/* ---------- applying settings ---------- */
async function applyDevPatch(targetDocs, patch, label, opts = {}) {
  let n = 0;
  for (const d of targetDocs) {
    const prev = doc; if (doc !== d) switchDoc(d);
    let L = photoLayer(d);
    if (!L) { L = layer(); if (!L) continue; await convertToPhoto(L, '', true); }
    const base = opts.replace ? devDefaults() : L.dev.settings;
    L.dev.settings = devMerge(base, patch);
    snapshot(label); Dev.requestRender(L, 'proxy'); n++;
    if (opts.stay && prev && prev !== d) switchDoc(prev);
  }
  Panel.build(); renderFilm();
  return n;
}
function copySettingsDialog() {
  const L = photoLayer(); if (!L) { toast('Select a photo layer to copy its develop settings.'); return; }
  const changed = devChangedGroups(L.dev.settings);
  const body = groupChecks(changed.length ? changed : DEV_GROUPS.map(g => g[0]).filter(g => g !== 'match'));
  modal({ title: 'Copy Settings', body, ok: 'Copy', wide: true, onOk: () => {
    const groups = readChecks(body); if (!groups.length) { toast('Choose at least one group to copy.'); return; }
    S.devClip = { patch: devPick(L.dev.settings, groups), groups, from: doc.name };
    toast(`Copied ${groups.length} setting group${groups.length > 1 ? 's' : ''} from ${doc.name}`); Panel.build();
  } });
}
function groupChecks(checked) {
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px';
  body.innerHTML = `<div class="checks">${DEV_GROUPS.map(([k, label]) => `<label><input type="checkbox" data-g="${k}" ${checked.includes(k) ? 'checked' : ''}> ${label}</label>`).join('')}</div><div class="row-btns"><button class="btn" data-all="1" type="button">Check All</button><button class="btn" data-all="0" type="button">Check None</button></div>`;
  body.querySelectorAll('[data-all]').forEach(b => b.onclick = () => body.querySelectorAll('[data-g]').forEach(c => c.checked = b.dataset.all === '1'));
  return body;
}
const readChecks = body => [...body.querySelectorAll('[data-g]')].filter(c => c.checked).map(c => c.dataset.g);
function pasteTargets() { const sel = docs.filter(d => d.filmSel); return sel.length > 1 ? sel : [doc].filter(Boolean); }
async function pasteSettings(amount = 1) {
  if (!S.devClip) { toast('Copy settings from a photo first (Develop › Copy Settings).'); return; }
  const targets = pasteTargets();
  const n = await applyDevPatch(targets, devScale(S.devClip.patch, amount), 'Paste Settings', { stay: true });
  toast(`Pasted settings to ${n} photo${n === 1 ? '' : 's'}${amount !== 1 ? ` at ${Math.round(amount * 100)}%` : ''}`);
}
function pasteSettingsSpecial() {
  if (!S.devClip) { toast('Copy settings from a photo first (Develop › Copy Settings).'); return; }
  const body = groupChecks(S.devClip.groups);
  body.querySelectorAll('[data-g]').forEach(c => { if (!S.devClip.groups.includes(c.dataset.g)) { c.disabled = true; c.parentElement.style.opacity = .45; } });
  const amt = sliderField('Strength (%)', 0, 150, 100, 1, () => {}, 'pasteAmt');
  const t = pasteTargets();
  const note = Object.assign(document.createElement('div'), { className: 'note', textContent: `From “${S.devClip.from}” to ${t.length > 1 ? t.length + ' selected photos' : '“' + (t[0] ? t[0].name : '') + '”'}. Strength scales every copied slider, curve and color shift.` });
  body.prepend(amt); body.append(note);
  modal({ title: 'Paste Settings', body, ok: 'Paste', wide: true, onOk: async () => {
    const groups = readChecks(body), a = +amt.querySelector('input').value / 100;
    const patch = devPick(devMerge(devDefaults(), S.devClip.patch), groups.filter(g => S.devClip.groups.includes(g)));
    const n = await applyDevPatch(t, devScale(patch, a), 'Paste Settings', { stay: true });
    toast(`Pasted ${groups.length} group${groups.length === 1 ? '' : 's'} to ${n} photo${n === 1 ? '' : 's'} at ${Math.round(a * 100)}%`);
  } });
}
let prevDocId = null;
hooks.docChanged.push(() => { if (doc && S.lastDocId !== doc.id) { prevDocId = S.lastDocId; S.lastDocId = doc.id; } });
async function pastePrevious() {
  const p = docs.find(d => d.id === prevDocId), L = p && photoLayer(p);
  if (!L) { toast('Open another photo and edit it first. “Previous” copies from the photo you viewed before this one.'); return; }
  await applyDevPatch([doc], devClone(L.dev.settings), 'Previous Settings', { replace: true });
  toast(`Applied settings from ${p.name}`);
}
function syncDialog() {
  const L = photoLayer(); if (!L) { toast('Select a photo layer to sync from.'); return; }
  if (docs.length < 2) { toast('Open two or more photos to sync settings between them.'); return; }
  const body = groupChecks(devChangedGroups(L.dev.settings));
  const tg = document.createElement('div'); tg.className = 'targets';
  tg.innerHTML = `<div class="subhead">Apply to</div>` + docs.filter(d => d !== doc).map(d => `<label><input type="checkbox" data-doc="${d.id}" ${d.filmSel || docs.filter(x => x.filmSel).length < 2 ? 'checked' : ''}> ${esc(d.name)}</label>`).join('');
  body.append(tg);
  modal({ title: `Sync Settings from “${doc.name}”`, body, ok: 'Synchronize', wide: true, onOk: async () => {
    const groups = readChecks(body), ids = [...tg.querySelectorAll('[data-doc]')].filter(c => c.checked).map(c => +c.dataset.doc);
    const patch = devPick(L.dev.settings, groups), targets = docs.filter(d => ids.includes(d.id));
    const n = await applyDevPatch(targets, patch, 'Sync Settings', { stay: true });
    toast(`Synced ${groups.length} group${groups.length === 1 ? '' : 's'} to ${n} photo${n === 1 ? '' : 's'}`);
  } });
}
async function resetDevelop() { const L = photoLayer(); if (!L) return; L.dev.settings = devDefaults(); snapshot('Reset Develop'); Dev.requestRender(L, 'proxy'); Panel.build(); }
async function autoDevelop() { const L = photoLayer(); if (!L) return; const patch = await Dev.auto(L.dev.srcId); L.dev.settings = devMerge(L.dev.settings, patch); snapshot('Auto Tone'); Dev.requestRender(L, 'proxy'); Panel.build(); }
function savePresetDialog() {
  const L = photoLayer(); if (!L) { toast('Select a photo layer first.'); return; }
  const body = groupChecks(devChangedGroups(L.dev.settings).filter(g => g !== 'match'));
  const nm = document.createElement('label'); nm.className = 'field'; nm.innerHTML = '<span>Preset name</span><input type="text" id="presetName" value="My Look">'; body.prepend(nm);
  modal({ title: 'New Develop Preset', body, ok: 'Create', wide: true, onOk: async () => {
    const groups = readChecks(body), name = $('#presetName').value.trim() || 'Untitled preset';
    Presets.user.push({ name, group: 'User Presets', s: devPick(L.dev.settings, groups), groups });
    await Presets.save(); Panel.build(); toast(`Saved preset “${name}”`);
  } });
}
async function applyPreset(p) {
  const L0 = photoLayer();
  const targets = pasteTargets();
  if (targets.length === 1 && L0) S.lastPreset = { base: devClone(L0.dev.settings), patch: p.s, name: p.name, amount: 100, docId: doc.id };
  const n = await applyDevPatch(targets, p.s, 'Preset: ' + p.name, { stay: true });
  if (n > 1) toast(`Applied “${p.name}” to ${n} photos`);
  Panel.build();
}
function presetAmount(v) {
  const lp = S.lastPreset, L = photoLayer(); if (!lp || !L || lp.docId !== doc.id) return;
  lp.amount = v; L.dev.settings = devMerge(lp.base, devScale(lp.patch, v / 100, lp.base)); Dev.requestRender(L, 'quick');
}
async function importXmpText(text, fname) {
  const { name, patch } = parseXmp(text);
  const nm = name || (fname || 'Imported preset').replace(/\.xmp$/i, '');
  Presets.user.push({ name: nm, group: 'Imported (Lightroom)', s: patch, groups: devGroupsIn(patch) });
  await Presets.save();
  if (doc) await applyPreset({ name: nm, s: patch });
  Panel.build();
  toast(`Imported “${nm}” (${devGroupsIn(patch).length} setting groups)`);
}
async function exportXmp() {
  const L = photoLayer(); if (!L) { toast('Select a photo layer first.'); return; }
  const name = (doc.name || 'Stratum') + ' look', text = toXmp(L.dev.settings, name, devChangedGroups(L.dev.settings));
  await saveBytes(new TextEncoder().encode(text), name + '.xmp', [{ name: 'Lightroom preset', extensions: ['xmp'] }]);
}

/* ---------- Match Look ---------- */
async function setMatchFromCanvas(cv, label) {
  const L = photoLayer(); if (!L) { toast('Select a photo layer first.'); return; }
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const src = rgba8ToSource(d, cv.width, cv.height);
  await setMatchFromSource(src, label, cv);
}
async function setMatchFromSource(src, label, thumbCv) {
  const L = photoLayer(); if (!L) { toast('Select a photo layer first.'); return; }
  busy(true, 'Analyzing reference…');
  try {
    const stats = await Dev.refStats(src.rgb, src.w, src.h, src.alpha);
    const ref = { cdf: stats.cdf, ma: stats.ma, mb: stats.mb, sa: stats.sa, sb: stats.sb, zones: stats.zones, name: label };
    let thumb = null;
    if (thumbCv) { const t = mk(96, 72), c = t.getContext('2d'), s = Math.max(96 / thumbCv.width, 72 / thumbCv.height); c.drawImage(thumbCv, (96 - thumbCv.width * s) / 2, (72 - thumbCv.height * s) / 2, thumbCv.width * s, thumbCv.height * s); thumb = t.toDataURL('image/jpeg', .8); }
    ref.thumb = thumb;
    const prev = L.dev.settings.match;
    L.dev.settings.match = { amount: prev ? prev.amount : 100, tone: prev ? prev.tone : 80, color: prev ? prev.color : 100, saturation: prev ? prev.saturation ?? 100 : 100, neutralize: prev ? prev.neutralize : 0, ref };
    snapshot('Match Look'); Dev.requestRender(L, 'proxy'); Panel.build();
    toast(`Matched the look of ${label}. Fine-tune with the sliders.`);
  } finally { busy(false); }
}
async function matchFromFile() { const f = await pickFiles(false, 'Choose a reference photo'); if (!f.length) return; const dec = await decodeAny(f[0]); if (!dec) return; await setMatchFromSource(dec.src, dec.name, dec.preview); }
function matchFromDoc() {
  const others = docs.filter(d => d !== doc); if (!others.length) { toast('Open the reference photo as another document first, or choose a file.'); return; }
  const body = document.createElement('div'); body.className = 'targets';
  body.innerHTML = others.map((d, i) => `<label><input type="radio" name="refdoc" value="${d.id}" ${i ? '' : 'checked'}> ${esc(d.name)}</label>`).join('');
  modal({ title: 'Match Look from Open Document', body, ok: 'Match', onOk: async () => { const id = +body.querySelector('input:checked').value, d = docs.find(x => x.id === id); await Dev.ready(d); await setMatchFromCanvas(flatten(null, d), d.name); } });
}
async function matchFromClipboard() {
  const r = desktop ? await desktop.readClipboard() : { files: [], png: null };
  if (r.files.length) { const e = await desktop.readFile(r.files[0]); const dec = await decodeAny(e); if (dec) await setMatchFromSource(dec.src, dec.name, dec.preview); return; }
  if (r.png) { const dec = await decodeAny({ name: 'Clipboard image.png', data: r.png }); if (dec) await setMatchFromSource(dec.src, 'Clipboard image', dec.preview); return; }
  toast('Copy an image or an image file first.');
}

/* ---------- Develop panel ---------- */
const Panel = (() => {
  const host = $('#paneDevelop');
  let histData = null, curveCh = 'rgb', hslMode = 'hue', openSecs = new Set(['basic', 'presets', 'match']);
  const L = () => photoLayer();
  const set = (path, v, commitLabel) => {
    const l = L(); if (!l) return;
    let o = l.dev.settings; const ks = path.split('.'); for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
    if (commitLabel) { snapshot('Develop: ' + commitLabel); Dev.requestRender(l, 'proxy'); markMods(); }
    else Dev.requestRender(l, 'quick');
  };
  const get = path => { let o = L().dev.settings; for (const k of path.split('.')) o = o[k]; return o; };
  function row(label, path, min, max, step = 1, def = 0, cls = '') {
    const v = get(path), id = 'dv_' + path.replace(/\W/g, '_');
    return `<div class="drow ${cls}" data-path="${path}" data-def="${def}" data-min="${min}" data-max="${max}"><label for="${id}" title="Double-click to reset">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><input type="number" min="${min}" max="${max}" step="${step}" value="${+(+v).toFixed(step < 1 ? 2 : 0)}" aria-label="${label}"></div>`;
  }
  const sec = (key, title, inner, groupKeys) => `<details class="dsec" data-sec="${key}" ${openSecs.has(key) ? 'open' : ''}><summary>${title}${groupKeys ? `<span class="mod" data-mod="${groupKeys}" hidden></span>` : ''}</summary><div class="dbody">${inner}</div></details>`;
  function build() {
    const l = L();
    if (!doc) { host.innerHTML = `<div class="dev-empty">Open a photo or RAW file to use Develop.</div>`; return; }
    if (!l) {
      host.innerHTML = `<div class="dev-empty"><div>Develop edits a photo layer non-destructively in 16-bit, like Lightroom. RAW files open as photo layers automatically.</div><button class="btn primary" id="devConvert">Make “${esc(layer() ? layer().name : '')}” a photo layer</button>${S.devClip ? `<button class="btn" id="devPasteEmpty">Paste copied settings</button>` : ''}</div>`;
      $('#devConvert').onclick = async () => { await convertToPhoto(); build(); };
      const pe = $('#devPasteEmpty'); if (pe) pe.onclick = () => pasteSettings();
      return;
    }
    const s = l.dev.settings, info = l.dev.info || {};
    histData = l._hist || null;
    const presets = Presets.all(); const groups = [...new Set(presets.map(p => p.group))];
    const m = s.match;
    host.innerHTML = `
      <div class="histwrap"><canvas class="hist" id="histo" width="560" height="184"></canvas><div class="histmeta"><span>${esc(info.kind || '')}</span><span>${info.w ? info.w + ' × ' + info.h : ''}</span></div>${info.camera ? `<div class="histmeta"><span>${esc(info.camera)}</span><span>${esc(info.exif || '')}</span></div>` : ''}</div>
      <div class="dev-actions">
        <button class="btn" id="dAuto" title="Auto tone and white balance">Auto</button>
        <button class="btn" id="dReset" title="Reset all develop settings">Reset</button>
        <button class="btn" id="dCopy" title="Copy Settings (Ctrl+Shift+C)">Copy…</button>
        <button class="btn" id="dPaste" title="Paste Settings (Ctrl+Shift+V)" ${S.devClip ? '' : 'disabled'}>Paste</button>
        <button class="btn" id="dPasteS" title="Paste with strength and group choice (Ctrl+Alt+Shift+V)" ${S.devClip ? '' : 'disabled'}>Paste…</button>
        <button class="btn" id="dPrev" title="Apply all settings from the previous photo (Ctrl+Alt+V)">Previous</button>
        <button class="btn" id="dSync" title="Sync settings to other open photos">Sync…</button>
        <button class="btn ${Dev.before ? 'primary' : ''}" id="dBefore" title="Before / After (\\)">Before</button>
      </div>
      ${sec('presets', 'Presets', `
        <div class="presets">${groups.map(g => `<div class="pg">${esc(g)}</div>` + presets.map((p, i) => [p, i]).filter(([p]) => p.group === g).map(([p, i]) => `<div class="preset" role="button" tabindex="0" data-p="${i}"><span>${esc(p.name)}</span>${p.builtin ? '' : `<button class="del" data-del="${i}" title="Delete preset">✕</button>`}</div>`).join('')).join('')}</div>
        ${S.lastPreset && S.lastPreset.docId === doc.id ? `<div class="subhead">Amount · ${esc(S.lastPreset.name)}</div><div class="drow"><label>Amount</label><input type="range" id="presetAmt" min="0" max="200" value="${S.lastPreset.amount}"><input type="number" id="presetAmtN" min="0" max="200" value="${S.lastPreset.amount}"></div>` : ''}
        <div class="row-btns"><button class="btn" id="pSave">Save preset…</button><button class="btn" id="pImport">Import .xmp…</button><button class="btn" id="pExport">Export .xmp…</button></div>`)}
      ${sec('basic', 'Basic', `
        <div class="subhead">Treatment</div>
        <div class="seg" id="treat"><button data-v="0" class="${s.mono ? '' : 'on'}">Color</button><button data-v="1" class="${s.mono ? 'on' : ''}">Black &amp; White</button></div>
        <div class="subhead">White balance</div>
        ${row('Temp', 'temp', -100, 100, 1, 0, 'temp')}${row('Tint', 'tint', -100, 100)}
        <div class="subhead">Tone</div>
        ${row('Exposure', 'exposure', -5, 5, 0.05)}${row('Contrast', 'contrast', -100, 100)}${row('Highlights', 'highlights', -100, 100)}${row('Shadows', 'shadows', -100, 100)}${row('Whites', 'whites', -100, 100)}${row('Blacks', 'blacks', -100, 100)}
        <div class="subhead">Presence</div>
        ${row('Clarity', 'clarity', -100, 100)}${row('Dehaze', 'dehaze', -100, 100)}${row('Vibrance', 'vibrance', -100, 100)}${row('Saturation', 'saturation', -100, 100)}`, 'wb,tone,presence')}
      ${sec('curve', 'Tone Curve', `
        <div class="seg" id="curveCh">${['rgb', 'r', 'g', 'b'].map(c => `<button data-c="${c}" class="${curveCh === c ? 'on' : ''}">${c.toUpperCase()}</button>`).join('')}</div>
        <canvas class="curve" id="curveCv" width="520" height="520" aria-label="Tone curve editor"></canvas>
        <div class="note" style="font-size:11px">Click to add a point, drag to shape, double-click a point to remove it.</div>
        <div class="row-btns"><button class="btn" id="curveReset">Reset channel</button></div>`, 'curve')}
      ${sec('hsl', 'Color Mixer', `
        <div class="seg" id="hslMode">${['hue', 'sat', 'lum'].map(k => `<button data-k="${k}" class="${hslMode === k ? 'on' : ''}">${{ hue: 'Hue', sat: 'Saturation', lum: 'Luminance' }[k]}</button>`).join('')}</div>
        ${HSL_BANDS.map((b, i) => row(b, `hsl.${hslMode}.${i}`, -100, 100)).join('')}`, 'hsl')}
      ${sec('grade', 'Color Grading', `
        <div class="subhead">Shadows</div>${row('Hue', 'grade.shadowHue', 0, 360, 1, 220)}${row('Saturation', 'grade.shadowSat', 0, 100)}
        <div class="subhead">Midtones</div>${row('Hue', 'grade.midHue', 0, 360, 1, 30)}${row('Saturation', 'grade.midSat', 0, 100)}
        <div class="subhead">Highlights</div>${row('Hue', 'grade.highHue', 0, 360, 1, 40)}${row('Saturation', 'grade.highSat', 0, 100)}
        <div class="subhead">Mix</div>${row('Blending', 'grade.blending', 0, 100, 1, 50)}${row('Balance', 'grade.balance', -100, 100)}`, 'grade')}
      ${sec('detail', 'Detail', `${row('Sharpening', 'sharpen', 0, 150)}${row('Radius', 'sharpenRadius', 0.5, 3, 0.1, 1)}${row('Noise reduction', 'noise', 0, 100)}`, 'detail')}
      ${sec('effects', 'Effects', `${row('Vignette', 'vignette', -100, 100)}${row('Midpoint', 'vignetteMid', 0, 100, 1, 50)}${row('Grain', 'grain', 0, 100)}${row('Grain size', 'grainSize', 0, 100, 1, 25)}`, 'effects')}
      ${sec('match', 'Match Look', `
        <div class="note" style="font-size:11.5px;line-height:1.5">Copy the tones and colors of any photo (JPEG, PNG, TIFF, RAW…) onto this one, then adjust how strongly it applies.</div>
        ${m ? `<div class="matchref">${m.ref.thumb ? `<img src="${m.ref.thumb}" alt="Reference" style="width:64px;height:48px;object-fit:cover;border-radius:3px;box-shadow:0 0 0 1px #000">` : '<canvas></canvas>'}<div><div>${esc(m.ref.name || 'Reference')}</div><div class="note" style="font-size:11px">Reference look applied</div></div></div>
          ${row('Amount', 'match.amount', 0, 100, 1, 100)}${row('Tone', 'match.tone', 0, 100, 1, 80)}${row('Color', 'match.color', 0, 100, 1, 100)}${row('Saturation', 'match.saturation', 0, 200, 1, 100)}${row('Neutralize', 'match.neutralize', 0, 100)}` : ''}
        <div class="row-btns"><button class="btn" id="mFile">Choose photo…</button><button class="btn" id="mDoc">From open doc…</button><button class="btn" id="mClip">From clipboard</button>${m ? '<button class="btn" id="mRemove">Remove</button>' : ''}</div>`, 'match')}
    `;
    wire(); drawCurve(); drawHist(); markMods();
  }
  function markMods() {
    const l = L(); if (!l) return; const ch = devChangedGroups(l.dev.settings);
    host.querySelectorAll('[data-mod]').forEach(el => { el.hidden = !el.dataset.mod.split(',').some(g => ch.includes(g)); });
  }
  function wire() {
    host.querySelectorAll('details.dsec').forEach(d => d.addEventListener('toggle', () => { d.open ? openSecs.add(d.dataset.sec) : openSecs.delete(d.dataset.sec); if (d.dataset.sec === 'curve' && d.open) drawCurve(); }));
    host.querySelectorAll('.drow[data-path]').forEach(r => {
      const [rg, nb] = r.querySelectorAll('input'), path = r.dataset.path, name = r.querySelector('label').textContent;
      rg.addEventListener('input', () => { nb.value = rg.value; set(path, +rg.value); if (path.startsWith('curve')) drawCurve(); });
      rg.addEventListener('change', () => set(path, +rg.value, name));
      nb.addEventListener('change', () => { const v = Math.min(+r.dataset.max, Math.max(+r.dataset.min, +nb.value || 0)); nb.value = v; rg.value = v; set(path, v, name); });
      r.querySelector('label').addEventListener('dblclick', () => { const v = +r.dataset.def; rg.value = v; nb.value = v; set(path, v, name + ' reset'); });
    });
    $('#dAuto').onclick = autoDevelop; $('#dReset').onclick = resetDevelop; $('#dCopy').onclick = copySettingsDialog; $('#dPaste').onclick = () => pasteSettings(); $('#dPasteS').onclick = pasteSettingsSpecial;
    $('#dPrev').onclick = pastePrevious; $('#dSync').onclick = syncDialog; $('#dBefore').onclick = toggleBefore;
    $('#treat').onclick = e => { const b = e.target.closest('button'); if (!b) return; set('mono', b.dataset.v === '1', b.dataset.v === '1' ? 'Black & White' : 'Color'); build(); };
    $('#curveCh').onclick = e => { const b = e.target.closest('button'); if (!b) return; curveCh = b.dataset.c; build(); };
    $('#hslMode').onclick = e => { const b = e.target.closest('button'); if (!b) return; hslMode = b.dataset.k; build(); };
    $('#curveReset').onclick = () => { L().dev.settings.curve[curveCh] = [[0, 0], [1, 1]]; set('curve.' + curveCh, [[0, 0], [1, 1]], 'Curve reset'); drawCurve(); };
    host.querySelectorAll('.preset').forEach(el => { const go = () => applyPreset(Presets.all()[+el.dataset.p]); el.onclick = e => { if (e.target.closest('.del')) return; go(); }; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    host.querySelectorAll('.del').forEach(b => b.onclick = async e => { e.stopPropagation(); const ui = +b.dataset.del - BUILTIN_PRESETS.length, p = Presets.user[ui]; if (!p) return; Presets.user.splice(ui, 1); await Presets.save(); build(); toast(`Deleted preset “${p.name}”`); });
    const pa = $('#presetAmt'); if (pa) { const pn = $('#presetAmtN'); pa.oninput = () => { pn.value = pa.value; presetAmount(+pa.value); }; pa.onchange = () => { snapshot('Preset Amount'); Dev.requestRender(L(), 'proxy'); }; pn.onchange = () => { pa.value = pn.value; presetAmount(+pn.value); snapshot('Preset Amount'); }; }
    $('#pSave').onclick = savePresetDialog; $('#pImport').onclick = importXmpDialog; $('#pExport').onclick = exportXmp;
    $('#mFile').onclick = matchFromFile; $('#mDoc').onclick = matchFromDoc; $('#mClip').onclick = matchFromClipboard;
    const mr = $('#mRemove'); if (mr) mr.onclick = () => { L().dev.settings.match = null; snapshot('Remove Match Look'); Dev.requestRender(L(), 'proxy'); build(); };
    wireCurve();
  }
  function hist(h) { histData = h; drawHist(); }
  function drawHist() {
    const cv = $('#histo'); if (!cv) return; const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.clearRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.06)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(W * i / 4, 0); c.lineTo(W * i / 4, H); c.stroke(); }
    if (!histData) return; let mx = 1; for (let i = 3; i < 765; i++) if (i % 256 > 2 && i % 256 < 253) mx = Math.max(mx, histData[i]);
    c.globalCompositeOperation = 'lighter';
    [['rgba(230,70,70,.75)', 0], ['rgba(70,200,90,.75)', 256], ['rgba(70,120,255,.8)', 512]].forEach(([col, off]) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
      for (let i = 0; i < 256; i++) { const v = Math.min(1, histData[off + i] / mx); c.lineTo(i / 255 * W, H - Math.sqrt(v) * (H - 4)); }
      c.lineTo(W, H); c.closePath(); c.fill();
    });
    c.globalCompositeOperation = 'source-over';
  }
  function drawCurve() {
    const cv = $('#curveCv'); if (!cv || !L()) return; const c = cv.getContext('2d'), W = cv.width, H = cv.height, pts = L().dev.settings.curve[curveCh];
    c.clearRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(W * i / 4, 0); c.lineTo(W * i / 4, H); c.moveTo(0, H * i / 4); c.lineTo(W, H * i / 4); c.stroke(); }
    if (histData) { const off = { rgb: -1, r: 0, g: 256, b: 512 }[curveCh]; let mx = 1; const val = i => off < 0 ? (histData[i] + histData[256 + i] + histData[512 + i]) : histData[off + i]; for (let i = 3; i < 253; i++) mx = Math.max(mx, val(i)); c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(0, H); for (let i = 0; i < 256; i++) c.lineTo(i / 255 * W, H - Math.sqrt(Math.min(1, val(i) / mx)) * H * .9); c.lineTo(W, H); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(0, H); c.lineTo(W, 0); c.stroke(); c.setLineDash([]);
    const col = { rgb: '#e1e4ea', r: '#ff6b6b', g: '#5fd47a', b: '#6f9bff' }[curveCh];
    const lut = curveLUTm(pts, 256); c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); for (let i = 0; i < 256; i++) { const x = i / 255 * W, y = H - lut[i] * H; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    pts.forEach(([x, y]) => { c.fillStyle = '#1c1e23'; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x * W, H - y * H, 7, 0, 7); c.fill(); c.stroke(); });
  }
  function wireCurve() {
    const cv = $('#curveCv'); if (!cv) return; let drag = -1;
    const pos = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))]; };
    const pts = () => L().dev.settings.curve[curveCh];
    cv.onpointerdown = e => {
      const [x, y] = pos(e), p = pts(), r = cv.getBoundingClientRect(), tol = 10 / r.width;
      drag = p.findIndex(q => Math.abs(q[0] - x) < tol * 1.5 && Math.abs(q[1] - y) < tol * 1.5);
      if (drag < 0) { const np = p.concat([[x, y]]).sort((a, b) => a[0] - b[0]); L().dev.settings.curve[curveCh] = np; drag = np.findIndex(q => q[0] === x && q[1] === y); }
      cv.setPointerCapture(e.pointerId); drawCurve(); Dev.requestRender(L(), 'quick');
    };
    cv.onpointermove = e => {
      if (drag < 0) return; const [x, y] = pos(e), p = pts();
      const lo = drag > 0 ? p[drag - 1][0] + 0.01 : 0, hi = drag < p.length - 1 ? p[drag + 1][0] - 0.01 : 1;
      p[drag] = [Math.max(lo, Math.min(hi, x)), y]; drawCurve(); Dev.requestRender(L(), 'quick');
    };
    cv.onpointerup = () => { if (drag >= 0) { drag = -1; snapshot('Develop: Tone Curve'); Dev.requestRender(L(), 'proxy'); markMods(); } };
    cv.ondblclick = e => { const [x, y] = pos(e), p = pts(), r = cv.getBoundingClientRect(), tol = 12 / r.width; const i = p.findIndex(q => Math.abs(q[0] - x) < tol && Math.abs(q[1] - y) < tol); if (i > 0 && i < p.length - 1) { p.splice(i, 1); snapshot('Develop: Remove Curve Point'); Dev.requestRender(L(), 'proxy'); drawCurve(); } };
  }
  return { build, hist, drawCurve };
})();
function toggleBefore() { Dev.setBefore(!Dev.before); toast(Dev.before ? 'Showing Before (original)' : 'Showing After'); Panel.build(); }
function importXmpDialog() { pickFiles(true, 'Import Lightroom presets', [{ name: 'Lightroom preset / sidecar', extensions: ['xmp'] }]).then(async fs => { for (const f of fs) { try { await importXmpText(new TextDecoder().decode(f.data), f.name); } catch (e) { toast(`${f.name}: ${e.message}`); } } }); }

hooks.docChanged.push(() => Panel.build());
hooks.afterRestore.push(() => { if (doc) Dev.renderAll(doc, 'proxy'); Panel.build(); });
let lastActiveLayerId = null;
hooks.layerChanged.push(() => { const L = layer(); const id = L ? L.id + ':' + !!L.dev : null; if (id !== lastActiveLayerId) { lastActiveLayerId = id; Panel.build(); } });

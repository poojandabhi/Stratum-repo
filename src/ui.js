/* UI shell: menus, panels, tabs, filmstrip, keyboard, dialogs, boot. */
function numField(label, val, id, attrs = '') { const f = document.createElement('label'); f.className = 'field'; f.innerHTML = `<span>${label}</span><input type="number" id="${id}" value="${val}" ${attrs}>`; return f; }
function cmdNew() {
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px';
  body.innerHTML = `<label class="field"><span>Name</span><input type="text" id="nName" value="Untitled-${docSeq}"></label>
  <label class="field"><span>Preset</span><select id="nPreset"><option value="">Custom</option><option value="1080x1080">Square post · 1080 × 1080</option><option value="1920x1080">HD landscape · 1920 × 1080</option><option value="3840x2160">4K UHD · 3840 × 2160</option><option value="1080x1920">Story · 1080 × 1920</option><option value="2480x3508">A4 at 300 ppi · 2480 × 3508</option><option value="1500x500">Banner · 1500 × 500</option></select></label>
  <div class="two"><label class="field"><span>Width (px)</span><input type="number" id="nW" value="1920" min="1" max="16000"></label><label class="field"><span>Height (px)</span><input type="number" id="nH" value="1080" min="1" max="16000"></label></div>
  <label class="field"><span>Background contents</span><select id="nBg"><option value="#ffffff">White</option><option value="#000000">Black</option><option value="bg">Background color</option><option value="">Transparent</option></select></label>`;
  body.querySelector('#nPreset').onchange = e => { if (!e.target.value) return; const [w, h] = e.target.value.split('x'); body.querySelector('#nW').value = w; body.querySelector('#nH').value = h; };
  modal({ title: 'New Document', body, ok: 'Create', onOk: () => {
    const w = Math.min(16000, Math.max(1, +$('#nW').value || 1)), h = Math.min(16000, Math.max(1, +$('#nH').value || 1)); let bg = $('#nBg').value; if (bg === 'bg') bg = S.bg;
    const d = makeDoc($('#nName').value.trim() || 'Untitled', w, h); const prev = doc; doc = d; const L = newLayer('Background'); doc = prev;
    if (bg) { const c = L.canvas.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, w, h); }
    d.layers = [L]; addDoc(d, 'New');
  } });
}
function cmdImageSize() {
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px'; const ratio = doc.w / doc.h;
  body.innerHTML = `<div class="two"><label class="field"><span>Width (px)</span><input type="number" id="isW" value="${doc.w}" min="1" max="16000"></label><label class="field"><span>Height (px)</span><input type="number" id="isH" value="${doc.h}" min="1" max="16000"></label></div><label class="opt"><input type="checkbox" id="isC" checked> Constrain proportions</label><label class="field"><span>Resampling</span><select id="isR"><option value="lanczos">Lanczos-3 (sharpest)</option><option value="bilinear">Bilinear (smoother)</option><option value="nearest">Nearest neighbor (hard edges)</option></select></label>`;
  const w = body.querySelector('#isW'), h = body.querySelector('#isH'), c = body.querySelector('#isC'); w.oninput = () => { if (c.checked) h.value = Math.max(1, Math.round(w.value / ratio)); }; h.oninput = () => { if (c.checked) w.value = Math.max(1, Math.round(h.value * ratio)); };
  modal({ title: 'Image Size', body, onOk: () => {
    const nw = Math.min(16000, Math.max(1, +w.value)), nh = Math.min(16000, Math.max(1, +h.value)), r = $('#isR').value; if (nw === doc.w && nh === doc.h) return;
    busy(true, 'Resampling…');
    transformAll(nw, nh, (x, s) => { x.imageSmoothingEnabled = r !== 'nearest'; x.drawImage(s, 0, 0, nw, nh); }, 'Image Size', r === 'lanczos' ? cv => Dev.resizeCanvas(cv, nw, nh) : null).finally(() => busy(false));
  } });
}
function cmdCanvasSize() {
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px';
  body.innerHTML = `<div class="two"><label class="field"><span>Width (px)</span><input type="number" id="csW" value="${doc.w}" min="1" max="16000"></label><label class="field"><span>Height (px)</span><input type="number" id="csH" value="${doc.h}" min="1" max="16000"></label></div><label class="field"><span>Anchor</span><select id="csA"><option value="c">Center</option><option value="tl">Top left</option><option value="t">Top</option><option value="b">Bottom</option><option value="br">Bottom right</option></select></label>`;
  modal({ title: 'Canvas Size', body, onOk: () => { const nw = Math.min(16000, Math.max(1, +$('#csW').value)), nh = Math.min(16000, Math.max(1, +$('#csH').value)), a = $('#csA').value, ow = doc.w, oh = doc.h; const ox = a === 'tl' ? 0 : a === 'br' ? nw - ow : Math.round((nw - ow) / 2), oy = a === 'tl' || a === 't' ? 0 : a === 'b' || a === 'br' ? nh - oh : Math.round((nh - oh) / 2); transformAll(nw, nh, (x, s) => x.drawImage(s, ox, oy), 'Canvas Size'); } });
}
function cmdPrefs() {
  const body = document.createElement('div'); body.style.display = 'grid'; body.style.gap = '12px';
  body.innerHTML = `<label class="field"><span>Default paste placement</span><select id="prPaste"><option value="fit">Fit inside canvas</option><option value="actual">Actual pixels</option><option value="fill">Fill canvas</option></select></label>
  <label class="field"><span>Default resampling</span><select id="prRes"><option value="lanczos">Lanczos-3</option><option value="bilinear">Bilinear</option><option value="nearest">Nearest neighbor</option></select></label>
  <label class="opt"><input type="checkbox" id="prHalf"> Open RAW files at half size (much faster, 1/4 the pixels)</label>
  <label class="opt"><input type="checkbox" id="prAuto"> Apply copied develop settings to newly opened photos</label>`;
  body.querySelector('#prPaste').value = S.prefs.pasteMode; body.querySelector('#prRes').value = S.prefs.resample; body.querySelector('#prHalf').checked = !!S.prefs.rawHalf; body.querySelector('#prAuto').checked = !!S.prefs.autoPasteOnOpen;
  modal({ title: 'Preferences', body, ok: 'Save', onOk: () => { S.prefs.pasteMode = $('#prPaste').value; S.prefs.resample = $('#prRes').value; S.prefs.rawHalf = $('#prHalf').checked; S.prefs.autoPasteOnOpen = $('#prAuto').checked; savePrefs(); toast('Preferences saved'); } });
}
function cmdHelp() {
  const body = document.createElement('div'); const rows = [
    ['Ctrl O / Ctrl N', 'Open / New'], ['Ctrl S / Ctrl Shift S', 'Save project / Save As'], ['Ctrl Shift E / Ctrl Alt E', 'Export / Export all photos'], ['Ctrl W', 'Close document'], ['Ctrl Tab', 'Next document'],
    ['Ctrl Shift C', 'Copy develop settings'], ['Ctrl Shift V', 'Paste develop settings'], ['Ctrl Alt Shift V', 'Paste settings with strength'], ['Ctrl Alt V', 'Previous (settings of last photo)'], ['Ctrl Alt S', 'Sync settings'], ['Ctrl Shift R', 'Auto tone'], ['\\', 'Before / After'],
    ['Ctrl V', 'Paste (full-quality files, images or selections)'], ['Ctrl Shift Alt P', 'Paste Special'],
    ['V M L C', 'Move, Marquee, Lasso, Crop'], ['I B S E', 'Eyedropper, Brush, Clone, Eraser'], ['G', 'Paint Bucket / Gradient'], ['T U H Z', 'Type, Shape, Hand, Zoom'], ['[  ]', 'Brush size'], ['X / D', 'Swap / default colors'], ['Space', 'Pan while held'],
    ['Ctrl Z / Ctrl Shift Z', 'Undo / Redo'], ['Ctrl A / Ctrl D', 'Select all / Deselect'], ['Shift F7', 'Inverse selection'], ['Ctrl J', 'Layer via copy'], ['Ctrl E', 'Merge down'], ['Ctrl 0 / Ctrl 1', 'Fit / 100%'], ['F11 / F12', 'Full screen / Developer tools']];
  body.className = 'keys'; body.innerHTML = rows.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('');
  modal({ title: 'Keyboard Shortcuts', body, ok: 'Done', hideCancel: true, wide: true });
}
function cmdAbout() {
  const body = document.createElement('div'); body.className = 'note';
  body.innerHTML = 'Stratum 2 — layered image editor with non-destructive, 16-bit develop.<br><br>RAW decoding by LibRaw (LGPL/CDDL) via libraw-wasm. TIFF via UTIF.js. Compression via pako. Fonts: IBM Plex, Anton, Caveat, Playfair Display (OFL).';
  modal({ title: 'About Stratum', body, ok: 'Close', hideCancel: true });
}

/* ---------- menus ---------- */
const need = f => () => { if (!doc) { toast('Open or create a document first.'); return; } return f(); };
const MENUS = {
  File: [['New…', 'Ctrl+N', cmdNew], ['Open…', 'Ctrl+O', openDialog], ['Place File as Layer…', '', async () => { const fs = await pickFiles(true, 'Place'); for (const f of fs) { const d = await decodeAny(f); if (d) await placeDecoded(d, { mode: 'fit' }); } }], '-',
    ['Save Project', 'Ctrl+S', need(() => saveProject(false))], ['Save Project As…', 'Ctrl+Shift+S', need(() => saveProject(true))], '-',
    ['Export…', 'Ctrl+Shift+E', need(cmdExport)], ['Export All Photos…', 'Ctrl+Alt+E', cmdExportAll], '-',
    ['Import Lightroom Preset (.xmp)…', '', importXmpDialog], ['Preferences…', 'Ctrl+K', cmdPrefs], '-', ['Close', 'Ctrl+W', () => closeDoc()], ['Load Sample Image', '', loadSample], ...(desktop ? [['Exit', 'Alt+F4', () => quitApp()]] : [])],
  Edit: [['Undo', 'Ctrl+Z', undo], ['Redo', 'Ctrl+Shift+Z', redo], '-', ['Cut', 'Ctrl+X', need(cut)], ['Copy', 'Ctrl+C', need(copy)], ['Paste', 'Ctrl+V', pasteSmart], ['Paste Special…', 'Ctrl+Shift+Alt+P', pasteSpecial], ['Clear', 'Delete', need(() => clearPx())], '-',
    ['Fill with Foreground', 'Alt+Del', need(() => fillSel('fg'))], ['Fill with Background', 'Ctrl+Del', need(() => fillSel('bg'))], '-', ['Keyboard Shortcuts', '?', cmdHelp]],
  Develop: [['Auto Tone', 'Ctrl+Shift+R', need(autoDevelop)], ['Reset Develop', '', need(resetDevelop)], ['Before / After', '\\', need(toggleBefore)], '-',
    ['Copy Settings…', 'Ctrl+Shift+C', need(copySettingsDialog)], ['Paste Settings', 'Ctrl+Shift+V', need(() => pasteSettings())], ['Paste Settings with Strength…', 'Ctrl+Alt+Shift+V', need(pasteSettingsSpecial)], ['Previous (last photo)', 'Ctrl+Alt+V', need(pastePrevious)], ['Sync Settings…', 'Ctrl+Alt+S', need(syncDialog)], '-',
    ['Match Look from File…', '', need(matchFromFile)], ['Match Look from Open Document…', '', need(matchFromDoc)], ['Match Look from Clipboard', '', need(matchFromClipboard)], '-',
    ['New Preset from Settings…', '', need(savePresetDialog)], ['Import Lightroom Preset (.xmp)…', '', importXmpDialog], ['Export Settings as .xmp…', '', need(exportXmp)], '-', ['Convert Layer to Photo Layer', '', need(async () => { await convertToPhoto(); Panel.build(); })]],
  Image: [['Brightness/Contrast…', '', need(() => openAdj('brightness'))], ['Levels…', '', need(() => openAdj('levels'))], ['Exposure…', '', need(() => openAdj('exposure'))], ['Hue/Saturation…', '', need(() => openAdj('hsl'))], ['Color Balance…', '', need(() => openAdj('temp'))], ['Auto Contrast', '', need(() => openAdj('auto'))], '-', ['Desaturate', '', need(() => openAdj('desat'))], ['Invert', '', need(() => openAdj('invert'))], ['Sepia', '', need(() => openAdj('sepia'))], ['Threshold…', '', need(() => openAdj('threshold'))], ['Posterize…', '', need(() => openAdj('posterize'))], '-',
    ['Image Size…', 'Ctrl+Alt+I', need(cmdImageSize)], ['Canvas Size…', 'Ctrl+Alt+C', need(cmdCanvasSize)], ['Rotate 90° Clockwise', '', need(() => rot(90))], ['Rotate 90° Counter Clockwise', '', need(() => rot(-90))], ['Rotate 180°', '', need(() => rot(180))], ['Flip Canvas Horizontal', '', need(() => flipCanvas(true))], ['Flip Canvas Vertical', '', need(() => flipCanvas(false))], ['Crop to Selection', '', need(cropToSel)]],
  Layer: [['New Layer', 'Ctrl+Shift+N', need(cmdNewLayer)], ['Duplicate Layer', '', need(cmdDup)], ['Layer via Copy', 'Ctrl+J', need(cmdViaCopy)], ['Delete Layer', '', need(cmdDel)], '-', ['Bring Forward', 'Ctrl+]', need(() => cmdArrange(1))], ['Send Backward', 'Ctrl+[', need(() => cmdArrange(-1))], '-', ['Merge Down', 'Ctrl+E', need(cmdMerge)], ['Flatten Image', '', need(cmdFlatten)], '-', ['Flip Layer Horizontal', '', need(() => flipLayer(true))], ['Flip Layer Vertical', '', need(() => flipLayer(false))]],
  Select: [['All', 'Ctrl+A', selectAll], ['Deselect', 'Ctrl+D', deselect], ['Inverse', 'Shift+F7', inverse]],
  Filter: [['Gaussian Blur…', '', need(() => openAdj('blur'))], ['Unsharp Mask…', '', need(() => openAdj('sharpen'))], ['Add Noise…', '', need(() => openAdj('noise'))], ['Mosaic…', '', need(() => openAdj('pixelate'))], ['Vignette…', '', need(() => openAdj('vignette'))], '-', ['Emboss', '', need(() => openAdj('emboss'))], ['Find Edges', '', need(() => openAdj('edges'))]],
  View: [['Zoom In', 'Ctrl++', () => setZoom(S.zoom * 1.25)], ['Zoom Out', 'Ctrl+-', () => setZoom(S.zoom / 1.25)], ['Fit on Screen', 'Ctrl+0', fit], ['Actual Pixels', 'Ctrl+1', () => setZoom(1)], '-', ['Show Filmstrip', 'F6', toggleFilm], ['Develop Panel', 'F7', () => dockTab('develop')], ['Layers Panel', 'F8', () => dockTab('layers')]],
  Help: [['Keyboard Shortcuts', '?', cmdHelp], ['About Stratum', '', cmdAbout]]
};
function buildMenus() {
  const host = $('#menus');
  Object.entries(MENUS).forEach(([name, items]) => {
    const m = document.createElement('div'); m.className = 'menu'; const b = document.createElement('button'); b.textContent = name; b.setAttribute('aria-haspopup', 'true'); const d = document.createElement('div'); d.className = 'drop'; d.hidden = true;
    items.forEach(it => { if (it === '-') { d.append(document.createElement('hr')); return; } const x = document.createElement('button'); x.innerHTML = `<span>${it[0]}</span>${it[1] ? `<kbd>${it[1]}</kbd>` : ''}`; x.onclick = () => { closeMenus(); commitText(); it[2](); }; d.append(x); });
    b.onclick = e => { e.stopPropagation(); const open = !d.hidden; closeMenus(); if (!open) { d.hidden = false; m.classList.add('open'); } };
    b.onmouseenter = () => { if (document.querySelector('.menu.open') && !m.classList.contains('open')) { closeMenus(); d.hidden = false; m.classList.add('open'); } };
    m.append(b, d); host.append(m);
  });
}
function closeMenus() { document.querySelectorAll('.menu').forEach(m => { m.classList.remove('open'); m.querySelector('.drop').hidden = true; }); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu')) closeMenus(); });

/* ---------- tools & options ---------- */
function buildTools() {
  const host = $('#tools');
  TOOLS.forEach(t => { if (t === '-') { host.append(Object.assign(document.createElement('div'), { className: 'sep' })); return; } const b = document.createElement('button'); b.className = 'tool'; b.dataset.tool = t[0]; b.title = `${t[1]} (${t[2]})`; b.setAttribute('aria-label', t[1]); b.innerHTML = svg(t[0]); b.onclick = () => setTool(t[0]); host.append(b); });
  const chips = document.createElement('div'); chips.className = 'chips'; chips.innerHTML = `<div class="chip fg" id="fgChip" title="Foreground color"><input type="color" aria-label="Foreground color" id="fgChipIn"></div><div class="chip bg" id="bgChip" title="Background color"><input type="color" aria-label="Background color" id="bgChipIn"></div>`; host.append(chips);
}
function setTool(t) {
  if (S.tool !== t) { commitText(); if (S.tool === 'crop' && t !== 'crop') S.crop = null; }
  S.tool = t; document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  vp.style.cursor = { move: 'move', hand: 'grab', zoom: 'zoom-in', text: 'text', eyedropper: 'crosshair' }[t] || 'crosshair';
  buildOptions(); drawOverlay(); updateStatus();
}
function buildOptions() {
  const o = $('#options'), t = TOOLS.find(x => x[0] === S.tool); o.innerHTML = '';
  const head = document.createElement('div'); head.className = 'opt-tool'; head.innerHTML = svg(S.tool) + t[1]; o.append(head);
  const add = el => o.append(el);
  const range = (label, key, min, max, unit = '') => { const w = document.createElement('label'); w.className = 'opt'; w.innerHTML = `${label} <input type="range" id="o_${key}" min="${min}" max="${max}" value="${S.o[key]}"><input type="number" min="${min}" max="${max}" value="${S.o[key]}" aria-label="${label}">${unit}`; const [r, n] = w.querySelectorAll('input'); r.oninput = () => { S.o[key] = +r.value; n.value = r.value; drawOverlay(); if (S.textEd) positionText(); }; n.onchange = () => { const v = Math.min(max, Math.max(min, +n.value || min)); S.o[key] = v; r.value = n.value = v; drawOverlay(); if (S.textEd) positionText(); }; add(w); };
  const select = (label, key, opts) => { const w = document.createElement('label'); w.className = 'opt'; w.innerHTML = `${label} <select id="o_${key}">${opts.map(([v, l]) => `<option value="${v}" ${S.o[key] == v ? 'selected' : ''}>${l}</option>`).join('')}</select>`; w.querySelector('select').onchange = e => { S.o[key] = e.target.value; if (S.textEd) positionText(); }; add(w); };
  const check = (label, key) => { const w = document.createElement('label'); w.className = 'opt'; w.innerHTML = `<input type="checkbox" id="o_${key}" ${S.o[key] ? 'checked' : ''}> ${label}`; w.querySelector('input').onchange = e => { S.o[key] = e.target.checked; if (S.textEd) positionText(); }; add(w); };
  const btn = (label, fn, primary) => { const b = document.createElement('button'); b.className = 'btn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = fn; add(b); };
  const hint = txt => add(Object.assign(document.createElement('span'), { className: 'hint', textContent: txt }));
  switch (S.tool) {
    case 'brush': case 'eraser': range('Size', 'size', 1, 800, 'px'); range('Hardness', 'hardness', 0, 100, '%'); range('Opacity', 'opacity', 1, 100, '%'); break;
    case 'clone': range('Size', 'size', 1, 800, 'px'); range('Hardness', 'hardness', 0, 100, '%'); range('Opacity', 'opacity', 1, 100, '%'); check('Aligned', 'aligned'); hint(S.cloneSrc ? 'Source set. Alt-click to change it.' : 'Alt-click to set a source point.'); break;
    case 'fill': range('Tolerance', 'tolerance', 0, 255); range('Opacity', 'opacity', 1, 100, '%'); check('Contiguous', 'contiguous'); break;
    case 'gradient': select('Type', 'gradType', [['linear', 'Linear'], ['radial', 'Radial']]); select('Colors', 'gradColors', [['fgbg', 'Foreground to Background'], ['fgt', 'Foreground to Transparent']]); range('Opacity', 'opacity', 1, 100, '%'); break;
    case 'shape': select('Shape', 'shape', [['rect', 'Rectangle'], ['round', 'Rounded Rectangle'], ['ellipse', 'Ellipse'], ['line', 'Line']]); select('Mode', 'shapeMode', [['fill', 'Fill'], ['stroke', 'Stroke']]); range('Stroke', 'strokeW', 1, 200, 'px'); range('Opacity', 'opacity', 1, 100, '%'); break;
    case 'text': select('Font', 'font', FONTS.map(f => [f, f])); range('Size', 'fontSize', 6, 600, 'px'); check('Bold', 'bold'); hint('Color uses the foreground swatch.'); break;
    case 'marquee': select('Shape', 'marquee', [['rect', 'Rectangle'], ['ellipse', 'Ellipse']]); btn('Select All', selectAll); btn('Deselect', deselect); btn('Inverse', inverse); break;
    case 'lasso': btn('Deselect', deselect); btn('Inverse', inverse); hint(t[3]); break;
    case 'crop': if (S.crop) { hint(`${S.crop.w} × ${S.crop.h} px`); btn('Cancel', () => { S.crop = null; buildOptions(); drawOverlay(); }); btn('Apply crop', () => applyCrop(S.crop), true); } else hint(t[3]); break;
    case 'zoom': case 'hand': btn('Fit on Screen', fit); btn('100%', () => setZoom(1)); btn('Zoom In', () => setZoom(S.zoom * 1.25)); btn('Zoom Out', () => setZoom(S.zoom / 1.25)); break;
    default: hint(t[3]);
  }
  const L = layer();
  if (L && L.dev && ['brush', 'eraser', 'clone', 'fill', 'gradient', 'shape', 'move'].includes(S.tool)) hint('Editing pixels rasterizes the photo layer. Add a new layer to keep Develop editable.');
}

/* ---------- color ---------- */
function setColor(which, hex) {
  hex = hex.toLowerCase(); S[which] = hex;
  $('#fgBig').style.background = S.fg; $('#bgBig').style.background = S.bg; $('#fgChip').style.background = S.fg; $('#bgChip').style.background = S.bg;
  $('#fgPick').value = $('#fgChipIn').value = S.fg; $('#bgPick').value = $('#bgChipIn').value = S.bg;
  if (document.activeElement !== $('#fgHex')) $('#fgHex').value = S.fg; if (document.activeElement !== $('#bgHex')) $('#bgHex').value = S.bg; if (S.textEd) positionText();
}
function wireColor() {
  ['fg', 'bg'].forEach(w => {
    [$(`#${w}Pick`), $(`#${w}ChipIn`)].forEach(i => i.addEventListener('input', e => setColor(w, e.target.value)));
    $(`#${w}Hex`).addEventListener('change', e => { let v = e.target.value.trim(); if (!v.startsWith('#')) v = '#' + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map(c => c + c).join(''); if (/^#[0-9a-f]{6}$/i.test(v)) setColor(w, v); else { toast('Use a hex color like #3e63dd.'); setColor(w, S[w]); } });
  });
  const sw = $('#swatches'); SWATCHES.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.title = `${c} — click for foreground, Alt-click for background`; b.setAttribute('aria-label', 'Swatch ' + c); b.onclick = e => setColor(e.altKey ? 'bg' : 'fg', c); sw.append(b); });
  $('#swapBtn').onclick = swap; $('#resetBtn').onclick = () => { setColor('fg', '#000000'); setColor('bg', '#ffffff'); };
}
const swap = () => { const f = S.fg; setColor('fg', S.bg); setColor('bg', f); };

/* ---------- layers panel ---------- */
function renderLayers() {
  const list = $('#layers'); list.innerHTML = ''; $('#layerCount').textContent = doc ? doc.layers.length : '';
  if (!doc) return;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const L = doc.layers[i], row = document.createElement('div'); row.className = 'layer' + (i === doc.active ? ' on' : ''); row.draggable = true; row.dataset.i = i;
    row.innerHTML = `<button class="eye" aria-label="Toggle visibility of ${esc(L.name)}" aria-pressed="${L.visible}">${svg('eye')}</button><canvas class="thumb" width="92" height="68"></canvas><span class="lname" title="Double-click to rename"></span><span class="lmeta">${L.dev ? '<span title="Photo layer (Develop)" style="color:var(--accent)">DEV</span> ' : ''}${L.blend !== 'source-over' ? BLENDS.find(b => b[0] === L.blend)[1].slice(0, 4) + ' ' : ''}${L.opacity < 1 ? Math.round(L.opacity * 100) + '%' : ''}</span>`;
    row.querySelector('.lname').textContent = L.name;
    const th = row.querySelector('canvas'), c = th.getContext('2d'), s = Math.min(92 / doc.w, 68 / doc.h), w = doc.w * s, h = doc.h * s; c.drawImage(L.canvas, (92 - w) / 2, (68 - h) / 2, w, h);
    list.append(row);
  }
  const L = layer(); if (!L) return; $('#blend').value = L.blend; $('#opNum').value = Math.round(L.opacity * 100); $('#opRange').value = Math.round(L.opacity * 100);
}
function wireLayers() {
  const list = $('#layers');
  list.addEventListener('click', e => { const row = e.target.closest('.layer'); if (!row) return; const i = +row.dataset.i; if (e.target.closest('.eye')) { doc.layers[i].visible = !doc.layers[i].visible; snapshot(doc.layers[i].visible ? 'Show Layer' : 'Hide Layer'); return; } if (doc.active !== i) { commitText(); doc.active = i; renderLayers(); updateStatus(); buildOptions(); emit('layerChanged'); } });
  list.addEventListener('dblclick', e => { const n = e.target.closest('.lname'); if (!n) return; const i = +n.closest('.layer').dataset.i, L = doc.layers[i]; const inp = document.createElement('input'); inp.value = L.name; inp.id = 'renameLayer'; n.textContent = ''; n.append(inp); inp.focus(); inp.select(); let done = false; const fin = ok => { if (done) return; done = true; if (ok && inp.value.trim() && inp.value.trim() !== L.name) { L.name = inp.value.trim().slice(0, 40); snapshot('Rename Layer'); } else renderLayers(); }; inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') fin(true); if (ev.key === 'Escape') fin(false); }; inp.onblur = () => fin(true); });
  let dragI = null;
  list.addEventListener('dragstart', e => { const r = e.target.closest('.layer'); if (!r) return; dragI = +r.dataset.i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'layer'); });
  list.addEventListener('dragover', e => { if (dragI == null) return; const r = e.target.closest('.layer'); if (!r) return; e.preventDefault(); list.querySelectorAll('.layer').forEach(x => x.classList.remove('drop-above', 'drop-below')); const b = r.getBoundingClientRect(); r.classList.add(e.clientY < b.top + b.height / 2 ? 'drop-above' : 'drop-below'); });
  list.addEventListener('drop', e => { if (dragI == null) return; e.preventDefault(); const r = e.target.closest('.layer'); if (!r) return; const b = r.getBoundingClientRect(), above = e.clientY < b.top + b.height / 2; let to = +r.dataset.i + (above ? 1 : 0); const L = doc.layers.splice(dragI, 1)[0]; if (dragI < to) to--; doc.layers.splice(to, 0, L); doc.active = to; dragI = null; snapshot('Reorder Layers'); });
  list.addEventListener('dragend', () => { dragI = null; list.querySelectorAll('.layer').forEach(x => x.classList.remove('drop-above', 'drop-below')); });
  const bs = $('#blend'); bs.innerHTML = BLENDS.map(([v, l]) => `<option value="${v}">${l}</option>`).join(''); bs.onchange = () => { if (!doc) return; layer().blend = bs.value; snapshot('Blending Change'); };
  const setOp = (v, commit) => { if (!doc) return; v = Math.min(100, Math.max(0, +v || 0)); layer().opacity = v / 100; $('#opNum').value = v; $('#opRange').value = v; render(); if (commit) snapshot('Opacity Change'); };
  $('#opRange').oninput = e => setOp(e.target.value); $('#opRange').onchange = e => setOp(e.target.value, true); $('#opNum').onchange = e => setOp(e.target.value, true);
  [['lUp', 'up', () => cmdArrange(1)], ['lDown', 'down', () => cmdArrange(-1)], ['lMerge', 'merge', cmdMerge], ['lDup', 'dup', cmdDup], ['lNew', 'plus', cmdNewLayer], ['lDel', 'trash', cmdDel]].forEach(([id, ic, fn]) => { const b = $('#' + id); b.innerHTML = svg(ic); b.setAttribute('aria-label', b.title); b.onclick = () => { if (!doc) return; commitText(); fn(); }; });
}
function renderHistory() {
  const h = $('#history'); h.innerHTML = ''; if (!doc) { $('#histCount').textContent = ''; return; }
  $('#histCount').textContent = `${doc.hi + 1}/${doc.hist.length}`;
  doc.hist.forEach((st, i) => { const b = document.createElement('button'); b.className = i === doc.hi ? 'on' : i > doc.hi ? 'future' : ''; b.innerHTML = `<span></span><small>${st.t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`; b.firstChild.textContent = st.label; b.onclick = () => restore(i); h.append(b); });
  const on = h.querySelector('.on'); on && on.scrollIntoView({ block: 'nearest' });
}

/* ---------- status, tabs, filmstrip ---------- */
function updateStatus() {
  if (!doc) { $('#stSize').textContent = ''; $('#docsize').textContent = ''; $('#stSel').textContent = ''; $('#zoomBox').value = ''; $('#wintitle').textContent = ''; return; }
  const z = S.zoom * 100, zs = (z >= 10 ? z.toFixed(z % 1 ? 1 : 0) : z.toFixed(1)) + '%'; if (document.activeElement !== $('#zoomBox')) $('#zoomBox').value = zs;
  $('#stSize').textContent = `${doc.w} × ${doc.h} px`; $('#docsize').textContent = `${(doc.w * doc.h / 1e6).toFixed(1)} MP · ${doc.layers.length} layer${doc.layers.length === 1 ? '' : 's'}`;
  const b = doc.sel ? selBounds() : null; $('#stSel').textContent = S.crop ? `Crop ${S.crop.w} × ${S.crop.h}` : b ? `Sel ${b.w} × ${b.h}${doc.sel.inv ? ' (inverted)' : ''}` : '';
  const L = layer(); const title = `${doc.name}${doc.dirty ? ' •' : ''} @ ${zs} (${L ? L.name : '—'}, ${L && L.dev ? '16-bit develop' : 'RGB/8'})`;
  $('#wintitle').textContent = title; if (desktop) desktop.setTitle(`${doc.name}${doc.dirty ? ' •' : ''} — Stratum`);
  const t = TOOLS.find(x => x[0] === S.tool); $('#stHint').textContent = t ? t[3] : '';
}
$('#zoomBox').addEventListener('change', e => { const v = parseFloat(e.target.value); if (v > 0) setZoom(v / 100); else updateStatus(); e.target.blur(); });
function renderTabs() {
  const host = $('#doctabs'); host.innerHTML = '';
  docs.forEach(d => {
    const t = document.createElement('div'); t.className = 'dtab' + (d === doc ? ' on' : ''); t.setAttribute('role', 'tab'); t.title = d.path || d.meta.srcPath || d.name;
    t.innerHTML = `<span></span>${d.dirty ? '<i class="dot" aria-label="Unsaved changes"></i>' : ''}<button class="x" aria-label="Close ${esc(d.name)}">×</button>`;
    t.querySelector('span').textContent = d.name;
    t.onclick = e => { if (e.target.closest('.x')) { closeDoc(d); return; } switchDoc(d); };
    t.onauxclick = e => { if (e.button === 1) closeDoc(d); };
    host.append(t);
  });
  renderFilm();
}
let filmOn = true;
function toggleFilm() { filmOn = !filmOn; $('#film').hidden = !filmOn; }
function renderFilm() {
  const host = $('#film'); if (!host) return; host.innerHTML = '';
  if (!docs.length) { host.innerHTML = '<span class="fempty">Open photos appear here. Ctrl-click or Shift-click to select several, then paste or sync settings to all of them.</span>'; return; }
  docs.forEach((d, idx) => {
    const b = document.createElement('button'); b.className = 'fitem' + (d === doc ? ' on' : '') + (d.filmSel ? ' sel' : ''); b.title = `${d.name} — ${d.w} × ${d.h}`;
    const L = photoLayer(d), mod = L && !devIsDefault(L.dev.settings);
    b.innerHTML = `<canvas width="184" height="112"></canvas><span></span>${mod ? '<i class="badge" title="Has develop settings">● edited</i>' : ''}`; b.querySelector('span').textContent = d.name;
    const c = b.querySelector('canvas').getContext('2d'), s = Math.min(184 / d.w, 112 / d.h), w = d.w * s, h = d.h * s;
    d.layers.forEach(Lr => { if (!Lr.visible) return; c.globalAlpha = Lr.opacity; c.globalCompositeOperation = Lr.blend; c.drawImage(Lr.canvas, (184 - w) / 2, (112 - h) / 2, w, h); });
    b.onclick = e => {
      if (e.ctrlKey || e.metaKey) { d.filmSel = !d.filmSel; if (doc && !docs.some(x => x.filmSel && x !== d) && d !== doc) doc.filmSel = true; }
      else if (e.shiftKey && doc) { const a = docs.indexOf(doc), z = idx; docs.forEach((x, k) => x.filmSel = k >= Math.min(a, z) && k <= Math.max(a, z)); }
      else { docs.forEach(x => x.filmSel = false); switchDoc(d); }
      renderFilm();
      const n = docs.filter(x => x.filmSel).length; if (n > 1) toast(`${n} photos selected. Paste Settings, presets and Export All apply to all of them.`);
    };
    host.append(b);
  });
}
function dockTab(which) { $('#tabDevelop').classList.toggle('on', which === 'develop'); $('#tabLayers').classList.toggle('on', which === 'layers'); $('#paneDevelop').hidden = which !== 'develop'; $('#paneLayers').hidden = which !== 'layers'; }
$('#tabDevelop').onclick = () => dockTab('develop'); $('#tabLayers').onclick = () => dockTab('layers');

/* ---------- keyboard ---------- */
const KEYTOOL = { v: 'move', m: 'marquee', l: 'lasso', c: 'crop', i: 'eyedropper', b: 'brush', s: 'clone', e: 'eraser', t: 'text', u: 'shape', h: 'hand', z: 'zoom' };
document.addEventListener('keydown', e => {
  if (S.modal) { if (e.key === 'Escape') { e.preventDefault(); closeModal(false); } else if (e.key === 'Enter' && !['SELECT', 'BUTTON', 'TEXTAREA'].includes(e.target.tagName)) { e.preventDefault(); closeModal(true); } return; }
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && (!mod || e.target.type !== 'range')) return;
  if (e.key === 'F6') { e.preventDefault(); toggleFilm(); return; }
  if (e.key === 'F7' && !e.shiftKey) { e.preventDefault(); dockTab('develop'); return; }
  if (e.key === 'F8') { e.preventDefault(); dockTab('layers'); return; }
  if (mod) {
    const sh = e.shiftKey, al = e.altKey;
    const map = {
      z: () => sh ? redo() : undo(), y: redo, n: () => sh ? need(cmdNewLayer)() : cmdNew(), o: openDialog, w: () => closeDoc(), k: cmdPrefs,
      s: () => al ? need(syncDialog)() : need(() => saveProject(sh))(),
      e: () => al ? cmdExportAll() : sh ? need(cmdExport)() : need(cmdMerge)(),
      c: () => sh ? need(copySettingsDialog)() : al ? need(cmdCanvasSize)() : need(copy)(),
      x: () => need(cut)(),
      v: () => sh && al ? need(pasteSettingsSpecial)() : sh ? need(() => pasteSettings())() : al ? need(pastePrevious)() : pasteSmart(),
      p: () => sh && al ? pasteSpecial() : null,
      r: () => sh ? need(autoDevelop)() : null,
      i: () => al ? need(cmdImageSize)() : null,
      a: selectAll, d: deselect, j: need(cmdViaCopy), '0': fit, '1': () => setZoom(1), '=': () => setZoom(S.zoom * 1.25), '+': () => setZoom(S.zoom * 1.25), '-': () => setZoom(S.zoom / 1.25),
      ']': need(() => cmdArrange(1)), '[': need(() => cmdArrange(-1)), backspace: need(() => fillSel('bg')), delete: need(() => fillSel('bg')),
      tab: () => { if (docs.length > 1) switchDoc(docs[(docs.indexOf(doc) + (sh ? docs.length - 1 : 1)) % docs.length]); }
    };
    if (map[k]) { e.preventDefault(); commitText(); map[k](); }
    return;
  }
  if (!doc) return;
  if (e.key === 'F7' && e.shiftKey) { e.preventDefault(); inverse(); return; }
  if (k === ' ') { e.preventDefault(); if (!S.space) { S.space = true; vp.classList.add('panning'); drawOverlay(); } return; }
  if (k === 'escape') { closeMenus(); if (S.crop) { S.crop = null; buildOptions(); drawOverlay(); } else if (doc.sel) deselect(); return; }
  if (k === 'enter' && S.crop) { applyCrop(S.crop); return; }
  if (k === 'backspace' || k === 'delete') { e.preventDefault(); e.altKey ? fillSel('fg') : clearPx(); return; }
  if (e.key.startsWith('Arrow') && S.tool === 'move') { e.preventDefault(); const n = e.shiftKey ? 10 : 1; nudge(k === 'arrowleft' ? -n : k === 'arrowright' ? n : 0, k === 'arrowup' ? -n : k === 'arrowdown' ? n : 0); return; }
  if (e.key === '\\') { toggleBefore(); return; }
  if (k === 'g') { setTool(S.tool === 'fill' ? 'gradient' : 'fill'); return; }
  if (KEYTOOL[k] && !e.altKey) { setTool(KEYTOOL[k]); return; }
  if (k === 'x') { swap(); return; } if (k === 'd') { setColor('fg', '#000000'); setColor('bg', '#ffffff'); return; }
  if (k === '[' || k === ']') { const s = S.o.size, st = s < 10 ? 1 : s < 50 ? 5 : s < 100 ? 10 : 25; S.o.size = Math.min(800, Math.max(1, s + (k === ']' ? st : -st))); buildOptions(); drawOverlay(); return; }
  if (/^[0-9]$/.test(k)) { S.o.opacity = k === '0' ? 100 : +k * 10; buildOptions(); toast(`Opacity ${S.o.opacity}%`); return; }
  if (e.key === '?') cmdHelp();
});
document.addEventListener('keyup', e => { if (e.key === ' ') { S.space = false; vp.classList.remove('panning'); drawOverlay(); } });
window.addEventListener('blur', () => { S.space = false; vp.classList.remove('panning'); });
if (!desktop) {
  document.addEventListener('paste', async e => { if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return; const f = [...(e.clipboardData?.files || [])]; e.preventDefault(); if (f.length) { for (const x of f) { const d = await decodeAny({ name: x.name || 'Pasted.png', data: new Uint8Array(await x.arrayBuffer()) }); if (d) await placeDecoded(d); } } else pasteInternal(); });
}

/* ---------- drag & drop ---------- */
document.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); $('#drophint').hidden = false; } });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) $('#drophint').hidden = true; });
document.addEventListener('drop', async e => {
  if (![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); $('#drophint').hidden = true;
  const files = [...e.dataTransfer.files]; const entries = await Promise.all(files.map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
  if (doc && e.altKey) { for (const en of entries) { const d = await decodeAny(en); if (d) await placeDecoded(d); } }
  else await openEntries(entries);
});

/* ---------- sample ---------- */
async function loadSample() {
  const W = 1600, H = 1066, cv = mk(W, H), c = cv.getContext('2d'); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b2344'); g.addColorStop(.42, '#4a3f6e'); g.addColorStop(.7, '#b56a7c'); g.addColorStop(.86, '#e89d6a'); g.addColorStop(1, '#f2c888'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(255,255,255,${.2 + rnd() * .6})`; c.beginPath(); c.arc(rnd() * W, rnd() * H * .42, rnd() * 1.4 + .2, 0, 7); c.fill(); }
  const sg = c.createRadialGradient(1050, 750, 50, 1050, 750, 440); sg.addColorStop(0, 'rgba(255,224,160,.95)'); sg.addColorStop(.25, 'rgba(255,170,110,.45)'); sg.addColorStop(1, 'rgba(255,140,90,0)'); c.globalCompositeOperation = 'screen'; c.fillStyle = sg; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#ffe2a8'; c.beginPath(); c.arc(1050, 750, 82, 0, 7); c.fill();
  const ridge = (base, amp, f1, f2, col, ph) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W + 6; x += 6) c.lineTo(x, base - Math.sin(x * f1 + ph) * amp - Math.sin(x * f2 + ph * 2) * amp * .45); c.lineTo(W, H); c.closePath(); c.fill(); };
  ridge(800, 60, .0039, .0098, '#5a4575', .6); ridge(866, 45, .0053, .014, '#3a2e55', 2.1); ridge(940, 32, .0068, .019, '#1f1a33', 4.2);
  const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  await openDecoded({ name: 'harbor-dusk-sample', canvas: cv, preview: cv, src: rgba8ToSource(d, W, H), info: { kind: 'Sample · 8-bit', w: W, h: H } });
}

/* ---------- quit ---------- */
async function quitApp() {
  for (const d of docs.slice()) { if (!(await closeDoc(d))) return; }
  if (desktop) desktop.quit();
}

/* ---------- boot ---------- */
(async function boot() {
  if (desktop) document.body.classList.add('desktop');
  buildMenus(); buildTools(); wireColor(); wireLayers(); setColor('fg', S.fg); setColor('bg', S.bg);
  await Promise.all([loadPrefs(), Presets.load()]);
  setTool('brush'); $('#welcome').hidden = false; stage.parentElement.hidden = true; refresh(); renderFilm(); Panel.build();
  $('#wOpen').onclick = openDialog; $('#wNew').onclick = cmdNew; $('#wSample').onclick = loadSample;
  window.addEventListener('resize', () => { if (S.textEd) positionText(); });
  if (desktop) {
    desktop.onOpenPaths(p => openPaths(p));
    desktop.onCloseRequest(() => quitApp());
    const start = await desktop.startupPaths(); if (start && start.length) await openPaths(start);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());
})();

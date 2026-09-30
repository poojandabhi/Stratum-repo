/* Shared develop settings model: used by the page and the develop worker. */
(function (G) {
  const ID = [[0, 0], [1, 1]];
  const DEV_DEFAULTS = {
    temp: 0, tint: 0,
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
    curve: { rgb: ID, r: ID, g: ID, b: ID },
    clarity: 0, dehaze: 0, vibrance: 0, saturation: 0, mono: false,
    hsl: { hue: [0, 0, 0, 0, 0, 0, 0, 0], sat: [0, 0, 0, 0, 0, 0, 0, 0], lum: [0, 0, 0, 0, 0, 0, 0, 0] },
    grade: { shadowHue: 220, shadowSat: 0, midHue: 30, midSat: 0, highHue: 40, highSat: 0, balance: 0, blending: 50 },
    sharpen: 0, sharpenRadius: 1, noise: 0,
    vignette: 0, vignetteMid: 50, grain: 0, grainSize: 25,
    match: null
  };
  const DEV_GROUPS = [
    ['wb', 'White Balance', ['temp', 'tint']],
    ['tone', 'Tone (Exposure, Contrast, Highlights, Shadows, Whites, Blacks)', ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']],
    ['curve', 'Tone Curve', ['curve']],
    ['presence', 'Presence (Clarity, Dehaze, Vibrance, Saturation, B&W)', ['clarity', 'dehaze', 'vibrance', 'saturation', 'mono']],
    ['hsl', 'Color Mixer (HSL)', ['hsl']],
    ['grade', 'Color Grading', ['grade']],
    ['detail', 'Detail (Sharpening, Noise Reduction)', ['sharpen', 'sharpenRadius', 'noise']],
    ['effects', 'Effects (Vignette, Grain)', ['vignette', 'vignetteMid', 'grain', 'grainSize']],
    ['match', 'Match Look (reference photo)', ['match']]
  ];
  const HSL_BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
  const HSL_CENTERS = [0, 30, 60, 120, 180, 240, 270, 300];

  const clone = o => JSON.parse(JSON.stringify(o));
  const devDefaults = () => clone(DEV_DEFAULTS);

  function devPick(settings, groups) {
    const out = {};
    DEV_GROUPS.forEach(([k, , keys]) => { if (groups.includes(k)) keys.forEach(key => { out[key] = clone(settings[key] === undefined ? DEV_DEFAULTS[key] : settings[key]); }); });
    return out;
  }
  function devMerge(base, patch) {
    const s = clone(base);
    Object.keys(patch || {}).forEach(k => {
      if (!(k in DEV_DEFAULTS)) return;
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'match' && s[k] && typeof s[k] === 'object') s[k] = Object.assign(clone(DEV_DEFAULTS[k]), s[k], clone(v));
      else s[k] = clone(v);
    });
    return s;
  }
  function devGroupsIn(patch) { return DEV_GROUPS.filter(([, , keys]) => keys.some(k => k in (patch || {}))).map(g => g[0]); }
  function devIsDefault(s) { return JSON.stringify(s) === JSON.stringify(DEV_DEFAULTS); }
  function devChangedGroups(s) { return DEV_GROUPS.filter(([, , keys]) => keys.some(k => JSON.stringify(s[k]) !== JSON.stringify(DEV_DEFAULTS[k]))).map(g => g[0]); }

  const BUILTIN_PRESETS = [
    { name: 'Clean Pop', group: 'Color', s: { contrast: 15, whites: 10, blacks: -8, clarity: 12, vibrance: 25 } },
    { name: 'Vivid Landscape', group: 'Color', s: { highlights: -35, shadows: 25, clarity: 20, dehaze: 18, vibrance: 30, hsl: { hue: [0, 0, 0, 0, 0, 0, 0, 0], sat: [0, 0, 5, 10, 10, 15, 0, 0], lum: [0, 0, 0, -5, 0, -10, 0, 0] } } },
    { name: 'Golden Hour', group: 'Color', s: { temp: 25, tint: 6, exposure: 0.15, highlights: -25, shadows: 20, vibrance: 20, vignette: -15, grade: { shadowHue: 220, shadowSat: 0, midHue: 30, midSat: 0, highHue: 40, highSat: 15, balance: 0, blending: 50 } } },
    { name: 'Teal & Orange', group: 'Cinematic', s: { contrast: 20, vibrance: 10, hsl: { hue: [0, 0, -10, -20, -15, -10, 0, 0], sat: [0, 15, 0, -20, 10, 10, 0, 0], lum: [0, 5, 0, -10, 0, -5, 0, 0] }, grade: { shadowHue: 195, shadowSat: 35, midHue: 30, midSat: 0, highHue: 35, highSat: 28, balance: 0, blending: 60 } } },
    { name: 'Moody Forest', group: 'Cinematic', s: { exposure: -0.2, contrast: 10, highlights: -20, vignette: -25, hsl: { hue: [0, 0, -10, -20, 0, 0, 0, 0], sat: [0, -5, -20, -30, -10, 0, 0, 0], lum: [0, 0, -10, -20, 0, 0, 0, 0] }, grade: { shadowHue: 185, shadowSat: 18, midHue: 30, midSat: 0, highHue: 45, highSat: 8, balance: -10, blending: 50 } } },
    { name: 'Warm Film', group: 'Film', s: { temp: 16, tint: 4, contrast: -8, highlights: -20, blacks: 12, grain: 22, grainSize: 30, curve: { rgb: [[0, 0.06], [0.25, 0.24], [0.75, 0.78], [1, 0.96]], r: ID, g: ID, b: ID }, grade: { shadowHue: 210, shadowSat: 12, midHue: 30, midSat: 0, highHue: 40, highSat: 16, balance: 0, blending: 50 } } },
    { name: 'Cool Matte', group: 'Film', s: { temp: -12, contrast: -15, saturation: -15, curve: { rgb: [[0, 0.1], [0.3, 0.3], [1, 0.95]], r: ID, g: ID, b: ID } } },
    { name: 'Faded Pastel', group: 'Film', s: { exposure: 0.2, contrast: -20, highlights: -30, shadows: 30, saturation: -10, vibrance: 15, curve: { rgb: [[0, 0.12], [0.5, 0.55], [1, 0.97]], r: ID, g: ID, b: ID } } },
    { name: 'Portrait Glow', group: 'Portrait', s: { highlights: -10, shadows: 15, clarity: -15, vibrance: 10, sharpen: 20, hsl: { hue: [0, 0, 0, 0, 0, 0, 0, 0], sat: [0, -5, 0, 0, 0, 0, 0, 0], lum: [5, 10, 0, 0, 0, 0, 0, 0] } } },
    { name: 'B&W High Contrast', group: 'Black & White', s: { mono: true, contrast: 35, clarity: 20, whites: 15, blacks: -20, grain: 15 } },
    { name: 'B&W Soft Silver', group: 'Black & White', s: { mono: true, contrast: -5, highlights: -20, shadows: 20, grade: { shadowHue: 220, shadowSat: 8, midHue: 30, midSat: 0, highHue: 45, highSat: 8, balance: 0, blending: 50 } } }
  ];

  /* ---- Lightroom / Camera Raw XMP ---- */
  const CRS = 'http://ns.adobe.com/camera-raw-settings/1.0/';
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  function parseXmp(text) {
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('This file is not valid XMP.');
    const kv = {};
    xml.querySelectorAll('*').forEach(el => {
      for (const a of el.attributes) if (a.namespaceURI === CRS) kv[a.localName] = a.value;
      if (el.namespaceURI === CRS) {
        const lis = el.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'li');
        if (lis.length) kv[el.localName] = [...lis].map(li => li.textContent.trim());
        else if (el.textContent.trim()) kv[el.localName] = el.textContent.trim();
      }
    });
    if (!Object.keys(kv).length) throw new Error('No Lightroom / Camera Raw settings were found in this file.');
    const n = k => (kv[k] === undefined ? undefined : parseFloat(kv[k]));
    const p = {};
    const set = (key, v) => { if (v !== undefined && !isNaN(v)) p[key] = v; };
    set('exposure', n('Exposure2012'));
    set('contrast', n('Contrast2012')); set('highlights', n('Highlights2012')); set('shadows', n('Shadows2012'));
    set('whites', n('Whites2012')); set('blacks', n('Blacks2012'));
    if (n('IncrementalTemperature') !== undefined) set('temp', cl(n('IncrementalTemperature'), -100, 100));
    else if (n('Temperature') !== undefined) set('temp', cl(Math.round(Math.log2(n('Temperature') / 5500) * 70), -100, 100));
    if (n('IncrementalTint') !== undefined) set('tint', cl(n('IncrementalTint'), -100, 100));
    else if (n('Tint') !== undefined) set('tint', cl(Math.round(n('Tint') / 1.5), -100, 100));
    set('clarity', n('Clarity2012')); set('dehaze', n('Dehaze')); set('vibrance', n('Vibrance')); set('saturation', n('Saturation'));
    if (/true/i.test(kv.ConvertToGrayscale || '')) p.mono = true; else if (kv.ConvertToGrayscale) p.mono = false;
    if (HSL_BANDS.some(b => kv['HueAdjustment' + b] !== undefined || kv['SaturationAdjustment' + b] !== undefined || kv['LuminanceAdjustment' + b] !== undefined)) {
      p.hsl = { hue: HSL_BANDS.map(b => n('HueAdjustment' + b) || 0), sat: HSL_BANDS.map(b => n('SaturationAdjustment' + b) || 0), lum: HSL_BANDS.map(b => n('LuminanceAdjustment' + b) || 0) };
    }
    const g = clone(DEV_DEFAULTS.grade); let hasG = false;
    const gset = (key, src) => { if (n(src) !== undefined) { g[key] = n(src); hasG = true; } };
    gset('shadowHue', 'SplitToningShadowHue'); gset('shadowSat', 'SplitToningShadowSaturation');
    gset('highHue', 'SplitToningHighlightHue'); gset('highSat', 'SplitToningHighlightSaturation'); gset('balance', 'SplitToningBalance');
    gset('shadowHue', 'ColorGradeShadowHue'); gset('shadowSat', 'ColorGradeShadowSat'); gset('midHue', 'ColorGradeMidtoneHue'); gset('midSat', 'ColorGradeMidtoneSat');
    gset('highHue', 'ColorGradeHighlightHue'); gset('highSat', 'ColorGradeHighlightSat'); gset('balance', 'ColorGradeBalance'); gset('blending', 'ColorGradeBlending');
    if (hasG) p.grade = g;
    const curve = k => Array.isArray(kv[k]) && kv[k].length >= 2 ? kv[k].map(s => s.split(',').map(v => cl(parseFloat(v) / 255, 0, 1))).filter(a => a.length === 2 && !isNaN(a[0]) && !isNaN(a[1])).sort((a, b) => a[0] - b[0]) : null;
    const cr = curve('ToneCurvePV2012'), crr = curve('ToneCurvePV2012Red'), crg = curve('ToneCurvePV2012Green'), crb = curve('ToneCurvePV2012Blue');
    if (cr || crr || crg || crb) p.curve = { rgb: cr || ID, r: crr || ID, g: crg || ID, b: crb || ID };
    set('sharpen', n('Sharpness')); set('sharpenRadius', n('SharpenRadius')); set('noise', n('LuminanceSmoothing'));
    set('vignette', n('PostCropVignetteAmount')); set('vignetteMid', n('PostCropVignetteMidpoint'));
    set('grain', n('GrainAmount')); set('grainSize', n('GrainSize'));
    let name = null;
    if (Array.isArray(kv.Name)) name = kv.Name[0]; else if (typeof kv.Name === 'string') name = kv.Name;
    return { name, patch: p };
  }
  function toXmp(s, name, groups) {
    const g = groups || DEV_GROUPS.map(x => x[0]);
    const a = []; const sg = v => (v > 0 ? '+' : '') + v;
    const has = k => g.includes(k);
    const fmt = (v, d = 0) => sg(+(+v).toFixed(d));
    if (has('wb')) { a.push(`crs:IncrementalTemperature="${fmt(s.temp)}"`, `crs:IncrementalTint="${fmt(s.tint)}"`); }
    if (has('tone')) { a.push(`crs:Exposure2012="${fmt(s.exposure, 2)}"`, `crs:Contrast2012="${fmt(s.contrast)}"`, `crs:Highlights2012="${fmt(s.highlights)}"`, `crs:Shadows2012="${fmt(s.shadows)}"`, `crs:Whites2012="${fmt(s.whites)}"`, `crs:Blacks2012="${fmt(s.blacks)}"`); }
    if (has('presence')) { a.push(`crs:Clarity2012="${fmt(s.clarity)}"`, `crs:Dehaze="${fmt(s.dehaze)}"`, `crs:Vibrance="${fmt(s.vibrance)}"`, `crs:Saturation="${fmt(s.saturation)}"`, `crs:ConvertToGrayscale="${s.mono ? 'True' : 'False'}"`); }
    if (has('hsl')) HSL_BANDS.forEach((b, i) => a.push(`crs:HueAdjustment${b}="${fmt(s.hsl.hue[i])}"`, `crs:SaturationAdjustment${b}="${fmt(s.hsl.sat[i])}"`, `crs:LuminanceAdjustment${b}="${fmt(s.hsl.lum[i])}"`));
    if (has('grade')) { const q = s.grade; a.push(`crs:ColorGradeShadowHue="${Math.round(q.shadowHue)}"`, `crs:ColorGradeShadowSat="${Math.round(q.shadowSat)}"`, `crs:ColorGradeMidtoneHue="${Math.round(q.midHue)}"`, `crs:ColorGradeMidtoneSat="${Math.round(q.midSat)}"`, `crs:ColorGradeHighlightHue="${Math.round(q.highHue)}"`, `crs:ColorGradeHighlightSat="${Math.round(q.highSat)}"`, `crs:ColorGradeBalance="${fmt(q.balance)}"`, `crs:ColorGradeBlending="${Math.round(q.blending)}"`, `crs:SplitToningShadowHue="${Math.round(q.shadowHue)}"`, `crs:SplitToningShadowSaturation="${Math.round(q.shadowSat)}"`, `crs:SplitToningHighlightHue="${Math.round(q.highHue)}"`, `crs:SplitToningHighlightSaturation="${Math.round(q.highSat)}"`); }
    if (has('detail')) a.push(`crs:Sharpness="${Math.round(s.sharpen)}"`, `crs:SharpenRadius="${fmt(s.sharpenRadius, 1)}"`, `crs:LuminanceSmoothing="${Math.round(s.noise)}"`);
    if (has('effects')) a.push(`crs:PostCropVignetteAmount="${fmt(s.vignette)}"`, `crs:PostCropVignetteMidpoint="${Math.round(s.vignetteMid)}"`, `crs:GrainAmount="${Math.round(s.grain)}"`, `crs:GrainSize="${Math.round(s.grainSize)}"`);
    const seq = (tag, pts) => `   <crs:${tag}><rdf:Seq>${pts.map(p => `<rdf:li>${Math.round(p[0] * 255)}, ${Math.round(p[1] * 255)}</rdf:li>`).join('')}</rdf:Seq></crs:${tag}>\n`;
    const esc = t => String(t).replace(/[<&"]/g, c => ({ '<': '&lt;', '&': '&amp;', '"': '&quot;' }[c]));
    return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Stratum 2.0">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    crs:PresetType="Normal" crs:Version="15.0" crs:ProcessVersion="11.0" crs:SupportsAmount="False" crs:SupportsColor="True" crs:SupportsMonochrome="True"
    ${a.join('\n    ')}>
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">${esc(name || 'Stratum preset')}</rdf:li></rdf:Alt></crs:Name>
${has('curve') ? seq('ToneCurvePV2012', s.curve.rgb) + seq('ToneCurvePV2012Red', s.curve.r) + seq('ToneCurvePV2012Green', s.curve.g) + seq('ToneCurvePV2012Blue', s.curve.b) : ''}  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
  }

  Object.assign(G, { DEV_DEFAULTS, DEV_GROUPS, HSL_BANDS, HSL_CENTERS, BUILTIN_PRESETS, devDefaults, devPick, devMerge, devGroupsIn, devIsDefault, devChangedGroups, parseXmp, toXmp, devClone: clone });
})(typeof self !== 'undefined' ? self : this);

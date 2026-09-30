/* Develop engine: non-destructive, 16-bit source, runs off the UI thread. */
importScripts('dev-shared.js');

const SRC = new Map();
const LIN = new Float32Array(65536);
for (let i = 0; i < 65536; i++) { const v = i / 65535; LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const GL = new Float32Array(4097);
for (let i = 0; i <= 4096; i++) { const x = i / 4096; GL[i] = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055; }
function toG(x) { if (x <= 0) return 0; if (x >= 1) return 1.055 * Math.pow(x, 1 / 2.4) - 0.055; const f = x * 4096, i = f | 0, t = f - i; return GL[i] + (GL[i + 1] - GL[i]) * t; }
function toL(v) { if (v <= 0) return 0; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------- Lab ---------- */
const fLab = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
const fInv = t => { const c = t * t * t; return c > 0.008856 ? c : (t - 16 / 116) / 7.787; };
const LAB = new Float32Array(3), RGBO = new Float32Array(3);
function lin2lab(r, g, b) {
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const fx = fLab(X / 0.95047), fy = fLab(Y), fz = fLab(Z / 1.08883);
  LAB[0] = 116 * fy - 16; LAB[1] = 500 * (fx - fy); LAB[2] = 200 * (fy - fz);
}
function lab2lin(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const X = 0.95047 * fInv(fx), Y = fInv(fy), Z = 1.08883 * fInv(fz);
  RGBO[0] = 3.2406 * X - 1.5372 * Y - 0.4986 * Z; RGBO[1] = -0.9689 * X + 1.8758 * Y + 0.0415 * Z; RGBO[2] = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
}

/* ---------- resampling ---------- */
function boxDown(rgb, alpha, w, h, maxEdge) {
  const s = Math.max(w, h) / maxEdge;
  if (s <= 1) return { w, h, rgb, alpha };
  const nw = Math.max(1, Math.round(w / s)), nh = Math.max(1, Math.round(h / s));
  const out = new Uint16Array(nw * nh * 3), oa = alpha ? new Uint8Array(nw * nh) : null;
  const acc = new Float64Array(nw * 4), cnt = new Uint32Array(nw);
  const xmap = new Int32Array(w); for (let x = 0; x < w; x++) xmap[x] = Math.min(nw - 1, Math.floor(x * nw / w));
  let oy = 0;
  for (let y = 0; y < h; y++) {
    const ty = Math.min(nh - 1, Math.floor(y * nh / h));
    if (ty !== oy) { flush(oy); oy = ty; }
    let k = y * w * 3;
    for (let x = 0; x < w; x++, k += 3) { const t = xmap[x], j = t * 4; acc[j] += rgb[k]; acc[j + 1] += rgb[k + 1]; acc[j + 2] += rgb[k + 2]; if (alpha) acc[j + 3] += alpha[y * w + x]; cnt[t]++; }
  }
  flush(oy);
  function flush(row) {
    for (let x = 0; x < nw; x++) { const c = cnt[x] || 1, j = x * 4, o = (row * nw + x) * 3; out[o] = acc[j] / c; out[o + 1] = acc[j + 1] / c; out[o + 2] = acc[j + 2] / c; if (oa) oa[row * nw + x] = acc[j + 3] / c; }
    acc.fill(0); cnt.fill(0);
  }
  return { w: nw, h: nh, rgb: out, alpha: oa };
}
function lanczosWeights(inN, outN) {
  const a = 3, scale = inN / outN, sup = a * Math.max(scale, 1), fs = Math.max(scale, 1);
  const idx = [], wts = [];
  for (let i = 0; i < outN; i++) {
    const c = (i + 0.5) * scale - 0.5, l = Math.ceil(c - sup), r = Math.floor(c + sup);
    const ii = [], ww = []; let sum = 0;
    for (let j = l; j <= r; j++) {
      const x = (j - c) / fs; let wv;
      if (x === 0) wv = 1; else if (Math.abs(x) >= a) wv = 0; else { const px = Math.PI * x; wv = a * Math.sin(px) * Math.sin(px / a) / (px * px); }
      if (wv === 0) continue; ii.push(Math.min(inN - 1, Math.max(0, j))); ww.push(wv); sum += wv;
    }
    idx.push(Int32Array.from(ii)); wts.push(Float32Array.from(ww.map(v => v / sum)));
  }
  return { idx, wts };
}
function lanczosRGBA(src, w, h, nw, nh) {
  const pm = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const k = i * 4, a = src[k + 3] / 255; pm[k] = src[k] * a; pm[k + 1] = src[k + 1] * a; pm[k + 2] = src[k + 2] * a; pm[k + 3] = src[k + 3]; }
  const H = lanczosWeights(w, nw), V = lanczosWeights(h, nh);
  const tmp = new Float32Array(nw * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < nw; x++) {
    const ii = H.idx[x], ww = H.wts[x]; let r = 0, g = 0, b = 0, a = 0;
    for (let t = 0; t < ii.length; t++) { const k = (y * w + ii[t]) * 4, f = ww[t]; r += pm[k] * f; g += pm[k + 1] * f; b += pm[k + 2] * f; a += pm[k + 3] * f; }
    const o = (y * nw + x) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
  }
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    const ii = V.idx[y], ww = V.wts[y];
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let t = 0; t < ii.length; t++) { const k = (ii[t] * nw + x) * 4, f = ww[t]; r += tmp[k] * f; g += tmp[k + 1] * f; b += tmp[k + 2] * f; a += tmp[k + 3] * f; }
      const o = (y * nw + x) * 4, al = a > 0 ? 255 / a : 0; out[o] = r * al; out[o + 1] = g * al; out[o + 2] = b * al; out[o + 3] = a;
    }
  }
  return out;
}

/* ---------- blur (Float32, single channel) ---------- */
function blurPass(src, dst, W, H, r, horiz) {
  const iarr = 1 / (r + r + 1), outer = horiz ? H : W, inner = horiz ? W : H, so = horiz ? W : 1, si = horiz ? 1 : W, last = inner - 1;
  for (let o = 0; o < outer; o++) {
    const base = o * so, first = src[base], lastv = src[base + last * si];
    let val = (r + 2) * first;
    for (let j = 1; j < r; j++) val += src[base + Math.min(j, last) * si];
    for (let x = 0; x < inner; x++) {
      const ai = x + r, bi = x - r - 1;
      val += (ai > last ? lastv : src[base + ai * si]) - (bi < 0 ? first : src[base + bi * si]);
      dst[base + x * si] = val * iarr;
    }
  }
}
function gauss1(a, W, H, rad) {
  if (rad < 0.4) return a;
  const r = Math.max(1, Math.round(rad * 0.8)), tmp = new Float32Array(a.length), b = Float32Array.from(a);
  for (let k = 0; k < 3; k++) { blurPass(b, tmp, W, H, r, true); blurPass(tmp, b, W, H, r, false); }
  return b;
}

/* ---------- curves & LUTs ---------- */
function curveLUT(pts, n = 1024) {
  const lut = new Float32Array(n);
  const p = (pts && pts.length >= 2 ? pts : [[0, 0], [1, 1]]).slice().sort((a, b) => a[0] - b[0]);
  const xs = p.map(q => q[0]), ys = p.map(q => q[1]), m = xs.length;
  const d = [], ms = new Array(m);
  for (let i = 0; i < m - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  ms[0] = d[0]; ms[m - 1] = d[m - 2];
  for (let i = 1; i < m - 1; i++) ms[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < m - 1; i++) { if (d[i] === 0) { ms[i] = ms[i + 1] = 0; continue; } const a = ms[i] / d[i], b = ms[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); ms[i] = t * a * d[i]; ms[i + 1] = t * b * d[i]; } }
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1);
    if (x <= xs[0]) { lut[k] = ys[0]; continue; }
    if (x >= xs[m - 1]) { lut[k] = ys[m - 1]; continue; }
    while (seg < m - 2 && x > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg], t = (x - xs[seg]) / h, t2 = t * t, t3 = t2 * t;
    lut[k] = clamp01((2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * ms[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * ms[seg + 1]);
  }
  return lut;
}
const isIdCurve = c => !c || (c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1);
function toneLUT(s) {
  const N = 4096, lut = new Float32Array(N);
  const c = s.contrast / 100, hl = s.highlights / 100, sh = s.shadows / 100, wh = s.whites / 100, bl = s.blacks / 100;
  for (let i = 0; i < N; i++) {
    let x = i / (N - 1) * 1.5;
    if (bl) x += bl * 0.1 * (1 - sstep(0, 0.5, x));
    if (wh) x *= 1 + wh * 0.25 * sstep(0.45, 1, x);
    if (sh) { const xc = clamp01(x); x += sh * 1.2 * xc * (1 - xc) * (1 - xc); }
    if (hl < 0) x += hl * 0.35 * sstep(0.45, 1.25, x) * x;
    else if (hl > 0) { const xc = clamp01(x); x += hl * 1.2 * xc * xc * (1 - xc); }
    if (c) { const xc = clamp01(x); x += c * 0.35 * 4 * (xc - 0.45) * xc * (1 - xc) * 1.4; }
    lut[i] = x;
  }
  return lut;
}
function hueRGB(hdeg) {
  const h = ((hdeg % 360) + 360) % 360 / 60, x = 1 - Math.abs(h % 2 - 1);
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return [r, g, b];
}
function gradeVec(hue, sat) { const [r, g, b] = hueRGB(hue), y = 0.2126 * r + 0.7152 * g + 0.0722 * b, k = sat / 100 * 0.28; return [(r - y) * k, (g - y) * k, (b - y) * k]; }

/* ---------- stats (Match Look + Auto) ---------- */
function computeStats(P) {
  const n = P.w * P.h, step = Math.max(1, Math.floor(n / 250000));
  const hist = new Float64Array(256), za = [0, 0, 0], zb = [0, 0, 0], zw = [0, 0, 0];
  let sa = 0, sb = 0, saa = 0, sbb = 0, cnt = 0, mr = 0, mg = 0, mb = 0;
  const yh = new Uint32Array(1024);
  for (let i = 0; i < n; i += step) {
    const k = i * 3; if (P.alpha && P.alpha[i] < 128) continue;
    const r = LIN[P.rgb[k]], g = LIN[P.rgb[k + 1]], b = LIN[P.rgb[k + 2]];
    mr += r; mg += g; mb += b;
    lin2lab(r, g, b); const L = LAB[0], a = LAB[1], bb = LAB[2];
    hist[Math.min(255, Math.max(0, Math.round(L / 100 * 255)))]++;
    const w0 = 1 - sstep(0, 50, L), w2 = sstep(50, 100, L), w1 = Math.max(0, 1 - w0 - w2);
    za[0] += a * w0; zb[0] += bb * w0; zw[0] += w0; za[1] += a * w1; zb[1] += bb * w1; zw[1] += w1; za[2] += a * w2; zb[2] += bb * w2; zw[2] += w2;
    sa += a; sb += bb; saa += a * a; sbb += bb * bb; cnt++;
    const yg = toG(0.2126 * r + 0.7152 * g + 0.0722 * b); yh[Math.min(1023, Math.round(clamp01(yg) * 1023))]++;
  }
  cnt = Math.max(1, cnt);
  const cdf = new Array(256); let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; cdf[i] = +(acc / cnt).toFixed(5); }
  const ma = sa / cnt, mbb = sb / cnt;
  const pct = q => { let a2 = 0; const t = q * cnt; for (let i = 0; i < 1024; i++) { a2 += yh[i]; if (a2 >= t) return i / 1023; } return 1; };
  return {
    cdf, ma: +ma.toFixed(3), mb: +mbb.toFixed(3), sa: +Math.sqrt(Math.max(1e-6, saa / cnt - ma * ma)).toFixed(3), sb: +Math.sqrt(Math.max(1e-6, sbb / cnt - mbb * mbb)).toFixed(3),
    zones: [0, 1, 2].map(z => ({ a: +(za[z] / Math.max(1e-6, zw[z])).toFixed(3), b: +(zb[z] / Math.max(1e-6, zw[z])).toFixed(3) })),
    mean: [mr / cnt, mg / cnt, mb / cnt], p01: pct(0.01), p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), p99: pct(0.99)
  };
}
function matchLUT(S, R) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = S.cdf[i]; let j = 0; while (j < 255 && R.cdf[j] < c) j++;
    const c0 = j ? R.cdf[j - 1] : 0, c1 = R.cdf[j], t = c1 > c0 ? (c - c0) / (c1 - c0) : 0;
    lut[i] = ((j - 1 + clamp01(t)) / 255) * 100;
  }
  const sm = new Float32Array(256);
  for (let i = 0; i < 256; i++) { let a = 0, n = 0; for (let d = -5; d <= 5; d++) { const q = i + d; if (q >= 0 && q < 256) { a += lut[q]; n++; } } sm[i] = a / n; }
  for (let i = 1; i < 256; i++) if (sm[i] < sm[i - 1]) sm[i] = sm[i - 1];
  sm[0] = Math.min(sm[0], 2); return sm;
}

/* ---------- render ---------- */
function render(src, s, level) {
  const full = level === 'full';
  const P = full ? src : level === 'quick' ? src.quick : src.proxy, W = P.w, H = P.h, n = W * H, rgb = P.rgb, alpha = P.alpha;
  const scale = W / (src.fullW || src.w);
  const out = new Uint8ClampedArray(n * 4);
  const tone = toneLUT(s), TN = tone.length - 1;
  const cr = s.curve || DEV_DEFAULTS.curve;
  const curveOn = !(isIdCurve(cr.rgb) && isIdCurve(cr.r) && isIdCurve(cr.g) && isIdCurve(cr.b));
  let CR, CG, CB;
  if (curveOn) { const m = curveLUT(cr.rgb), r = curveLUT(cr.r), g = curveLUT(cr.g), b = curveLUT(cr.b); CR = new Float32Array(1024); CG = new Float32Array(1024); CB = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const v = Math.round(m[i] * 1023); CR[i] = r[v]; CG[i] = g[v]; CB[i] = b[v]; } }
  const t = s.temp / 100, ti = s.tint / 100;
  let wr = Math.pow(2, 0.45 * t + 0.12 * ti), wg = Math.pow(2, -0.3 * ti), wb = Math.pow(2, -0.45 * t + 0.12 * ti);
  const wy = 0.2126 * wr + 0.7152 * wg + 0.0722 * wb; wr /= wy; wg /= wy; wb /= wy;
  const ek = Math.pow(2, s.exposure);
  const dh = s.dehaze / 100, clar = s.clarity / 100, sat = s.saturation / 100, vib = s.vibrance / 100;
  const hs = s.hsl || DEV_DEFAULTS.hsl, hslOn = [...hs.hue, ...hs.sat, ...hs.lum].some(v => v);
  const gd = s.grade || DEV_DEFAULTS.grade, gradeOn = gd.shadowSat || gd.midSat || gd.highSat;
  const gS = gradeVec(gd.shadowHue, gd.shadowSat), gM = gradeVec(gd.midHue, gd.midSat), gH = gradeVec(gd.highHue, gd.highSat);
  const pivot = 0.5 - gd.balance / 100 * 0.25, gexp = 1.5 - gd.blending / 100;

  let M = null;
  if (s.match && s.match.ref && src.stats) {
    const R = s.match.ref, S = src.stats;
    M = { lut: matchLUT(S, R), tone: s.match.tone / 100, color: s.match.color / 100, amt: s.match.amount / 100, neu: 1 - s.match.neutralize / 100,
      ka: Math.min(3, Math.max(0.3, R.sa / S.sa)), kb: Math.min(3, Math.max(0.3, R.sb / S.sb)), S, R, chroma: (s.match.saturation ?? 100) / 100 };
  }

  let tiny = null, TW = 0, TH = 0;
  if (clar) {
    const T = src.tiny; TW = T.w; TH = T.h; const ty = new Float32Array(TW * TH);
    for (let i = 0; i < TW * TH; i++) { const k = i * 3; ty[i] = stage1Y(T.rgb[k], T.rgb[k + 1], T.rgb[k + 2]); }
    tiny = gauss1(ty, TW, TH, Math.max(TW, TH) * 0.012 + 1);
  }
  function stage1Y(R0, G0, B0) {
    let r = LIN[R0] * wr * ek, g = LIN[G0] * wg * ek, b = LIN[B0] * wb * ek;
    r = tone[Math.min(TN, (toG(r) / 1.5 * TN) | 0)]; g = tone[Math.min(TN, (toG(g) / 1.5 * TN) | 0)]; b = tone[Math.min(TN, (toG(b) / 1.5 * TN) | 0)];
    return clamp01(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  const txs = (TW - 1) / Math.max(1, W - 1), tys = (TH - 1) / Math.max(1, H - 1);
  const HC = HSL_CENTERS;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x, k = i * 3;
      let r = LIN[rgb[k]], g = LIN[rgb[k + 1]], b = LIN[rgb[k + 2]];
      if (M) {
        lin2lab(r, g, b); const L = LAB[0], a = LAB[1], bb = LAB[2];
        const li = Math.min(255, Math.max(0, L / 100 * 255)), l0 = li | 0, lt = li - l0, lm = M.lut[l0] + (M.lut[Math.min(255, l0 + 1)] - M.lut[l0]) * lt;
        const L2 = L + (lm - L) * M.tone;
        const w0 = 1 - sstep(0, 50, L), w2 = sstep(50, 100, L), w1 = Math.max(0, 1 - w0 - w2);
        const sa = M.S.zones[0].a * w0 + M.S.zones[1].a * w1 + M.S.zones[2].a * w2, sb = M.S.zones[0].b * w0 + M.S.zones[1].b * w1 + M.S.zones[2].b * w2;
        const ra = (M.R.zones[0].a * w0 + M.R.zones[1].a * w1 + M.R.zones[2].a * w2) * M.neu, rb = (M.R.zones[0].b * w0 + M.R.zones[1].b * w1 + M.R.zones[2].b * w2) * M.neu;
        const a2 = a + (((a - sa) * M.ka * M.chroma + ra) - a) * M.color, b2 = bb + (((bb - sb) * M.kb * M.chroma + rb) - bb) * M.color;
        lab2lin(L2, a2, b2);
        r += (Math.max(0, RGBO[0]) - r) * M.amt; g += (Math.max(0, RGBO[1]) - g) * M.amt; b += (Math.max(0, RGBO[2]) - b) * M.amt;
      }
      r *= wr * ek; g *= wg * ek; b *= wb * ek;
      r = toG(r); g = toG(g); b = toG(b);
      if (dh > 0) { const kk = 0.12 * dh; r = (r - kk) / (1 - kk); g = (g - kk) / (1 - kk); b = (b - kk) / (1 - kk); }
      else if (dh < 0) { const kk = -0.25 * dh; r = r * (1 - kk) + kk * 0.8; g = g * (1 - kk) + kk * 0.8; b = b * (1 - kk) + kk * 0.8; }
      r = r <= 0 ? tone[0] : tone[Math.min(TN, (r / 1.5 * TN) | 0)];
      g = g <= 0 ? tone[0] : tone[Math.min(TN, (g / 1.5 * TN) | 0)];
      b = b <= 0 ? tone[0] : tone[Math.min(TN, (b / 1.5 * TN) | 0)];
      if (tiny) {
        const Y = clamp01(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const fx = x * txs, fy = y * tys, x0 = fx | 0, y0 = fy | 0, x1 = Math.min(TW - 1, x0 + 1), y1 = Math.min(TH - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
        const Yb = (tiny[y0 * TW + x0] * (1 - ax) + tiny[y0 * TW + x1] * ax) * (1 - ay) + (tiny[y1 * TW + x0] * (1 - ax) + tiny[y1 * TW + x1] * ax) * ay;
        const d = clar * 1.1 * (Y - Yb) * (0.35 + 2.6 * Y * (1 - Y));
        r += d; g += d; b += d;
      }
      let Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (s.mono) {
        if (hslOn) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
          if (c > 1e-4) { let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h = (h * 60 + 360) % 360; Y += bandMix(h, hs.lum) / 100 * 0.4 * c; }
        }
        r = g = b = Y;
      } else {
        if (hslOn) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
          if (c > 1e-4) {
            let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h = (h * 60 + 360) % 360;
            const dH = bandMix(h, hs.hue) * 0.3, dS = bandMix(h, hs.sat) / 100, dL = bandMix(h, hs.lum) / 100;
            const l = (mx + mn) / 2; let sl = c / (1 - Math.abs(2 * clamp01(l) - 1) + 1e-6); sl = Math.min(1, sl);
            const cw = Math.min(1, sl * 1.5);
            let nh = (h + dH + 360) % 360, ns = clamp01(sl * (1 + dS)), nl = l + dL * 0.35 * cw * (dL > 0 ? (1 - l) : l) * 2;
            const q = nl < 0.5 ? nl * (1 + ns) : nl + ns - nl * ns, p = 2 * nl - q, hh = nh / 360;
            r = h2r(p, q, hh + 1 / 3); g = h2r(p, q, hh); b = h2r(p, q, hh - 1 / 3);
            Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          }
        }
        if (sat || vib || dh) {
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sv = mx - mn;
          let kk = 1 + sat + dh * 0.3;
          if (vib) kk += vib > 0 ? vib * (1 - Math.min(1, sv * 1.4)) : vib;
          kk = Math.max(0, kk);
          r = Y + (r - Y) * kk; g = Y + (g - Y) * kk; b = Y + (b - Y) * kk;
        }
      }
      if (gradeOn) {
        const Yc = clamp01(Y);
        const ws = Math.pow(clamp01(1 - Yc / pivot), gexp), wh2 = Math.pow(clamp01((Yc - pivot) / (1 - pivot)), gexp), wm = clamp01(1 - ws - wh2);
        r += gS[0] * ws + gM[0] * wm + gH[0] * wh2; g += gS[1] * ws + gM[1] * wm + gH[1] * wh2; b += gS[2] * ws + gM[2] * wm + gH[2] * wh2;
      }
      r = clamp01(r); g = clamp01(g); b = clamp01(b);
      if (curveOn) { r = CR[(r * 1023) | 0]; g = CG[(g * 1023) | 0]; b = CB[(b * 1023) | 0]; }
      const o = i * 4; out[o] = r * 255 + 0.5; out[o + 1] = g * 255 + 0.5; out[o + 2] = b * 255 + 0.5; out[o + 3] = alpha ? alpha[i] : 255;
    }
  }

  if (s.noise > 0 || s.sharpen > 0) {
    const Yv = new Float32Array(n);
    for (let i = 0; i < n; i++) { const o = i * 4; Yv[i] = 0.2126 * out[o] + 0.7152 * out[o + 1] + 0.0722 * out[o + 2]; }
    let base = Yv;
    if (s.noise > 0) {
      const nb = gauss1(Yv, W, H, Math.max(0.6, 2.2 * scale * (0.5 + s.noise / 100))), kk = Math.min(1, s.noise / 100 * 1.1);
      base = new Float32Array(n);
      for (let i = 0; i < n; i++) { const d = (nb[i] - Yv[i]) * kk; base[i] = Yv[i] + d; const o = i * 4; out[o] += d; out[o + 1] += d; out[o + 2] += d; }
    }
    if (s.sharpen > 0) {
      const sb = gauss1(base, W, H, Math.max(0.5, s.sharpenRadius * Math.max(0.35, scale))), kk = s.sharpen / 100 * 1.6;
      for (let i = 0; i < n; i++) { const d = (base[i] - sb[i]) * kk; const o = i * 4; out[o] += d; out[o + 1] += d; out[o + 2] += d; }
    }
  }
  if (s.vignette || s.grain) {
    const cx = W / 2, cy = H / 2, m = s.vignetteMid / 100 * 0.8, va = s.vignette / 100, ga = s.grain / 100 * 38, gs = Math.max(1, (1 + s.grainSize / 30) * scale * 1.2);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      if (va) {
        const nd = Math.hypot((x - cx) / cx, (y - cy) / cy) / 1.4142, tt = sstep(m, 1, nd) * 0.9;
        if (va < 0) { const f = 1 + va * tt; out[o] *= f; out[o + 1] *= f; out[o + 2] *= f; }
        else { const f = va * tt; out[o] += (255 - out[o]) * f; out[o + 1] += (255 - out[o + 1]) * f; out[o + 2] += (255 - out[o + 2]) * f; }
      }
      if (ga) {
        const gx = (x / gs) | 0, gy = (y / gs) | 0; let hsh = (gx * 374761393 + gy * 668265263) ^ 0x5bd1e995; hsh = Math.imul(hsh ^ (hsh >>> 13), 1274126177); hsh ^= hsh >>> 16;
        const nz = ((hsh & 0xffff) / 65535 - 0.5) * ga, Y2 = (out[o] + out[o + 1] + out[o + 2]) / 765, wgt = 0.25 + 3 * Y2 * (1 - Y2);
        out[o] += nz * wgt; out[o + 1] += nz * wgt; out[o + 2] += nz * wgt;
      }
    }
  }
  const hist = new Uint32Array(768), step = Math.max(1, Math.floor(n / 200000));
  for (let i = 0; i < n; i += step) { const o = i * 4; hist[out[o]]++; hist[256 + out[o + 1]]++; hist[512 + out[o + 2]]++; }
  return { w: W, h: H, data: out, hist };
}
function h2r(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
function bandMix(h, arr) {
  const C = HSL_CENTERS;
  for (let i = 0; i < 8; i++) {
    const a = C[i], b = i === 7 ? 360 : C[i + 1];
    if (h >= a && h < b) { const t = (h - a) / (b - a); return arr[i] * (1 - t) + arr[(i + 1) % 8] * t; }
  }
  return arr[0];
}

function autoSettings(st) {
  const lin = v => toL(v);
  const ev = Math.max(-1.5, Math.min(1.5, Math.log2(lin(0.46) / Math.max(1e-4, lin(Math.max(0.02, st.p50)))) * 0.7));
  const [mr, mg, mb] = st.mean, avgRB = (mr + mb) / 2;
  const temp = Math.round(Math.max(-25, Math.min(25, Math.log2(mb / Math.max(1e-5, mr)) * 30)));
  const tint = Math.round(Math.max(-20, Math.min(20, Math.log2(mg / Math.max(1e-5, avgRB)) * 40)));
  const spread = st.p90 - st.p10;
  return {
    temp, tint, exposure: +ev.toFixed(2),
    contrast: Math.round(Math.max(-20, Math.min(30, (0.62 - spread) * 70))),
    highlights: st.p99 > 0.96 ? -25 : -5, shadows: st.p10 < 0.12 ? 20 : 5,
    whites: Math.round(Math.max(-30, Math.min(40, (0.97 - st.p99) * 140))),
    blacks: Math.round(Math.max(-40, Math.min(20, -(st.p01 - 0.02) * 180))),
    vibrance: 12
  };
}

self.onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'source') {
      const src = { w: m.w, h: m.h, rgb: m.rgb, alpha: m.alpha || null, fullW: m.fullW || m.w };
      src.proxy = boxDown(src.rgb, src.alpha, src.w, src.h, m.proxyEdge || 1600);
      src.tiny = boxDown(src.proxy.rgb, null, src.proxy.w, src.proxy.h, 256);
      src.quick = boxDown(src.proxy.rgb, src.proxy.alpha, src.proxy.w, src.proxy.h, 1000);
      src.stats = computeStats(src.proxy);
      SRC.set(m.id, src);
      const msg = { type: 'sourceReady', id: m.id, job: m.job, stats: src.stats };
      if (m.wantProxy) { msg.proxy = { w: src.proxy.w, h: src.proxy.h, rgb: src.proxy.rgb.slice(), alpha: src.proxy.alpha ? src.proxy.alpha.slice() : null }; }
      postMessage(msg);
    } else if (m.type === 'render') {
      const src = SRC.get(m.id); if (!src) throw new Error('Photo source is no longer loaded.');
      const level = m.level || (m.full ? 'full' : 'proxy');
      const r = render(src, m.settings, level);
      postMessage({ type: 'rendered', id: m.id, job: m.job, level, w: r.w, h: r.h, data: r.data, hist: r.hist }, [r.data.buffer]);
    } else if (m.type === 'refStats') {
      const P = boxDown(m.rgb, m.alpha || null, m.w, m.h, 1024);
      postMessage({ type: 'refStats', job: m.job, stats: computeStats(P) });
    } else if (m.type === 'auto') {
      const src = SRC.get(m.id); postMessage({ type: 'auto', job: m.job, patch: autoSettings(src.stats) });
    } else if (m.type === 'getSource') {
      const src = SRC.get(m.id); postMessage({ type: 'source', job: m.job, w: src.w, h: src.h, rgb: src.rgb.slice(), alpha: src.alpha ? src.alpha.slice() : null });
    } else if (m.type === 'drop') {
      SRC.delete(m.id); postMessage({ type: 'dropped', job: m.job });
    } else if (m.type === 'resize') {
      const out = lanczosRGBA(m.data, m.w, m.h, m.nw, m.nh);
      postMessage({ type: 'resized', job: m.job, data: out, w: m.nw, h: m.nh }, [out.buffer]);
    }
  } catch (err) { postMessage({ type: 'error', job: m.job, message: String(err && err.message || err) }); }
};

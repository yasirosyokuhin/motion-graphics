// Small math / random / color helpers shared by every module.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const fract = (v) => v - Math.floor(v);
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOutCubic = (t) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  t = clamp(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic PRNG so the same song + lyrics always produce the same MV.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (a, b) => a + rnd() * (b - a);
  rnd.int = (a, b) => Math.floor(a + rnd() * (b - a + 1));
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  rnd.weighted = (entries) => {
    // entries: [[item, weight], ...]
    let total = 0;
    for (const [, w] of entries) total += Math.max(0, w);
    let r = rnd() * total;
    for (const [item, w] of entries) {
      r -= Math.max(0, w);
      if (r <= 0) return item;
    }
    return entries[entries.length - 1][0];
  };
  return rnd;
}

// 3D value noise (smooth, cheap, good enough for flow fields and plasma).
export function makeNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rnd();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const s = (t) => t * t * (3 - 2 * t);
  const v = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  function noise3(x, y, z = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = s(xf), w = s(yf), q = s(zf);
    const x00 = lerp(v(xi, yi, zi), v(xi + 1, yi, zi), u);
    const x10 = lerp(v(xi, yi + 1, zi), v(xi + 1, yi + 1, zi), u);
    const x01 = lerp(v(xi, yi, zi + 1), v(xi + 1, yi, zi + 1), u);
    const x11 = lerp(v(xi, yi + 1, zi + 1), v(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x00, x10, w), lerp(x01, x11, w), q);
  }
  function fbm(x, y, z = 0, oct = 4) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += a * noise3(x * f, y * f, z * f);
      norm += a;
      a *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
  return { noise3, fbm };
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToCss([r, g, b], a = 1) {
  return a >= 1 ? `rgb(${r | 0},${g | 0},${b | 0})` : `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

export function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function luminance([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export const isCJK = (s) => /[぀-ヿ㐀-鿿ｦ-ﾟ가-힯]/.test(s);

export function fmtTime(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Splits text into lines that fit maxWidth with the current ctx font.
export function wrapText(g, text, maxWidth) {
  const cjk = isCJK(text);
  const tokens = cjk ? splitCJK(text) : text.split(/(\s+)/).filter((s) => s.length);
  const lines = [];
  let cur = '';
  for (const tok of tokens) {
    const next = cur + tok;
    if (g.measureText(next.trim()).width > maxWidth && cur.trim().length) {
      lines.push(cur.trim());
      cur = tok.trimStart();
    } else {
      cur = next;
    }
  }
  if (cur.trim().length) lines.push(cur.trim());
  return lines.length ? lines : [text];
}

// Breaks CJK text into small chunks while keeping latin words / spaces together.
function splitCJK(text) {
  const out = [];
  const re = /([A-Za-z0-9'’!?.,-]+|\s+|.)/gu;
  let m;
  while ((m = re.exec(text))) out.push(m[0]);
  return out;
}

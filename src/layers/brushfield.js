// Where the brushstrokes go. Strokes keep fixed places on a jittered grid (a
// painting does not reshuffle itself every frame). On land they follow the
// contours of the picture (the direction along its edges); in a Van Gogh sky
// they ride rolling currents and vortices and drift along them over time, so
// the sky flows the way his skies seem to. Colour is resampled every frame so
// moving things in the picture move through the paint.

import { clamp, makeNoise } from '../util.js';
import { STRIDE } from '../gl/strokes.js';

const TAU = Math.PI * 2;

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// Van Gogh's tube colours (hue): chrome yellow, orange, viridian, cobalt, ultramarine
const VG_HUES = [48, 28, 150, 205, 228];

export class BrushField {
  // style: 'vangogh' | 'monet' | 'dots'
  constructor(w, h, rnd, style) {
    this.w = w; this.h = h; this.rnd = rnd; this.style = style;
    this.noise = makeNoise(Math.floor(rnd() * 1e9));
    const m = Math.min(w, h);
    const layers = style === 'vangogh'
      ? [{ sp: m * 0.02, len: 2.6, wid: 1.0, edge: 0 }, { sp: m * 0.012, len: 2.1, wid: 0.8, edge: 0.18 }]
      : style === 'monet'
        ? [{ sp: m * 0.017, len: 1.5, wid: 0.85, edge: 0 }, { sp: m * 0.011, len: 1.3, wid: 0.7, edge: 0.22 }]
        : [{ sp: m * 0.0105, len: 1, wid: 1, edge: 0 }];
    const S = [];
    layers.forEach((L, li) => {
      for (let y = L.sp * 0.5; y < h + L.sp; y += L.sp) for (let x = L.sp * 0.5 * ((Math.round(y / L.sp)) % 2); x < w + L.sp; x += L.sp) {
        S.push({
          x: x + (rnd() - 0.5) * L.sp * 0.9, y: y + (rnd() - 0.5) * L.sp * 0.9, li, sp: L.sp,
          len: L.sp * L.len * (0.75 + rnd() * 0.5), wid: L.sp * L.wid * (0.8 + rnd() * 0.4), edge: L.edge,
          seed: rnd() * 100, lj: (rnd() - 0.5) * 0.14, hj: (rnd() - 0.5), fleck: rnd() < 0.03, bend: (rnd() - 0.5) * 0.5, ph: rnd(),
        });
      }
    });
    this.strokes = S;
    this.data = new Float32Array((S.length * 2 + 2000) * STRIDE);
    this.vortices = Array.from({ length: 2 + (rnd() < 0.5 ? 1 : 0) }, (_, i) => ({ x: (0.22 + i * 0.3 + (rnd() - 0.5) * 0.08) * w, y: (0.18 + rnd() * 0.16) * h, R: m * (0.11 + rnd() * 0.06), dir: rnd() < 0.7 ? 1 : -1 }));
    this.frame = 0;
  }

  // Edge tangent field of the composition (structure tensor, smoothed).
  analyse(comp) {
    const W = comp.cw, H = comp.ch, d = comp.data, n = W * H;
    if (!this.L || this.L.length !== n) {
      this.L = new Float32Array(n); this.a = new Float32Array(n); this.b = new Float32Array(n); this.c = new Float32Array(n);
      this.tmp = new Float32Array(n); this.ang = new Float32Array(n); this.mag = new Float32Array(n);
    }
    const { L, a, b, c, tmp } = this;
    for (let i = 0; i < n; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = (L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1]) - (L[i - W - 1] + 2 * L[i - 1] + L[i + W - 1]);
      const gy = (L[i + W - 1] + 2 * L[i + W] + L[i + W + 1]) - (L[i - W - 1] + 2 * L[i - W] + L[i - W + 1]);
      a[i] = gx * gx; b[i] = gx * gy; c[i] = gy * gy;
    }
    const blur = (arr) => {
      for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, k = 0; for (let j = -3; j <= 3; j++) { const xx = x + j; if (xx >= 0 && xx < W) { s += arr[y * W + xx]; k++; } } tmp[y * W + x] = s / k; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, k = 0; for (let j = -3; j <= 3; j++) { const yy = y + j; if (yy >= 0 && yy < H) { s += tmp[yy * W + x]; k++; } } arr[y * W + x] = s / k; }
      }
    };
    blur(a); blur(b); blur(c);
    for (let i = 0; i < n; i++) {
      this.ang[i] = 0.5 * Math.atan2(2 * b[i], a[i] - c[i]) + Math.PI / 2;
      this.mag[i] = Math.sqrt((a[i] - c[i]) ** 2 + 4 * b[i] * b[i]);
    }
    this.cw = W; this.ch = H;
  }

  at(arr, x, y) {
    const cx = clamp(Math.floor((x / this.w) * this.cw), 0, this.cw - 1), cy = clamp(Math.floor((y / this.h) * this.ch), 0, this.ch - 1);
    return arr[cy * this.cw + cx];
  }

  // The Van Gogh sky: a rolling current with vortices in it.
  sky(x, y, t, spin) {
    let vx = 1, vy = 0.35 * Math.sin(x / this.w * TAU * 1.3 + y / this.h * 4 + t * 0.15);
    for (const v of this.vortices) {
      const dx = x - v.x, dy = y - v.y, d2 = dx * dx + dy * dy;
      const k = 2.8 * Math.exp(-d2 / (v.R * v.R * 2.2)) * v.dir;
      const d = Math.sqrt(d2) + 1e-3;
      vx += (-dy / d) * k; vy += (dx / d) * k;
    }
    return Math.atan2(vy, vx) + spin;
  }

  colour(r, g, b, s) {
    let [h, sat, l] = rgb2hsl(r, g, b);
    if (this.style === 'vangogh') {
      let best = VG_HUES[0], bd = 999;
      for (const v of VG_HUES) { const dd = hueDist(h, v); if (dd < bd) { bd = dd; best = v; } }
      if (sat > 0.12) h = h + ((((best - h) % 360) + 540) % 360 - 180) * 0.35;
      sat = clamp(sat * 1.3 + 0.05);
      l = clamp(l + s.lj);
      if (s.fleck) { if (h > 180 && h < 260) { h = 200; l = clamp(l + 0.14); } else { h = 50; l = clamp(l + 0.12); sat = 0.8; } }
    } else if (this.style === 'monet') {
      h += s.hj * 28; sat = clamp(sat * 1.15 + 0.04); l = clamp(l + 0.03 + s.lj * 0.8);
    } else {
      h += s.hj * 50; sat = clamp(sat * 1.4 + 0.1); l = clamp(l + s.lj * 1.5);
    }
    return hsl2rgb(h, sat, l);
  }

  push(o, x, y, ang, len, wid, rgb, seed, bend, alpha, kind) {
    const D = this.data;
    if (o + STRIDE > D.length) return o;
    D[o] = x; D[o + 1] = y; D[o + 2] = ang; D[o + 3] = len;
    D[o + 4] = wid; D[o + 5] = rgb[0]; D[o + 6] = rgb[1]; D[o + 7] = rgb[2];
    D[o + 8] = seed; D[o + 9] = bend; D[o + 10] = alpha; D[o + 11] = kind;
    return o + STRIDE;
  }

  fill(f, comp) {
    if (this.frame++ % 2 === 0 || !this.ang) this.analyse(comp);
    const vg = this.style === 'vangogh', dots = this.style === 'dots';
    const horizon = (comp.horizon ?? 0.6) * this.h;
    this.spin = (this.spin || 0) + f.dt * 0.05 * (f.energy - 0.4);
    const flow = (f.mt * (0.12 + f.energy * 0.35));
    let o = 0;
    const contours = [];
    for (const s of this.strokes) {
      let x = s.x, y = s.y, alpha = 1;
      const mag = this.at(this.mag, x, y);
      if (s.edge && mag < s.edge) continue;
      let ang;
      const inSky = vg && y < horizon - s.sp * 0.5;
      if (inSky) {
        ang = this.sky(x, y, f.mt, this.spin);
        // strokes drift along the current and are repainted as they pass
        const ph = (s.ph + flow) % 1;
        const shift = (ph - 0.5) * s.len * 1.6;
        x += Math.cos(ang) * shift; y += Math.sin(ang) * shift;
        alpha = Math.sin(ph * Math.PI) * 0.85 + 0.15;
      } else if (mag > 0.04) {
        ang = this.at(this.ang, x, y);
      } else {
        // flat areas: calm, spatially coherent hatching
        // Van Gogh's fields: rhythmic, near-parallel strokes that bend slowly across the land
        ang = vg ? -0.3 + (this.noise.noise3(x * 0.003, y * 0.006, 0.5) - 0.5) * 0.9 : -0.5 + (this.noise.noise3(x * 0.004, y * 0.004, 0.5) - 0.5) * 2.4;
        if (!vg && y > horizon) { ang = (this.noise.noise3(x * 0.01, y * 0.002, 1) - 0.5) * 0.6; x += Math.sin(f.mt * 1.5 + s.seed) * s.len * 0.15; }
      }
      const [r, g, b] = comp.sample(x, y);
      const rgb = this.colour(r, g, b, s);
      const len = dots ? s.wid : s.len * (vg && mag > 0.2 ? 0.8 : 1);
      o = this.push(o, x, y, ang, len, s.wid * (dots ? 1 : 1 + f.pulse * 0.06), rgb, s.seed, vg ? s.bend + (inSky ? 0.25 : 0) : s.bend * 0.4, alpha, dots ? 2 : 0);
      if (vg && mag > 0.35 && s.li === 1 && s.seed % 3 < 1.2) contours.push([x, y, this.at(this.ang, x, y), s]);
    }
    // Van Gogh's dark blue outlines along strong edges
    for (const [x, y, ang, s] of contours) o = this.push(o, x, y, ang, s.len * 1.1, s.wid * 0.38, [0.1, 0.13, 0.3], s.seed, 0.1, 0.85, 1);
    // halos: loose rings of thick dabs around the lights (yellow, cream, pale blue),
    // never quite closed and never quite round, breathing with the beat
    if (vg && comp.lights) {
      const kx = this.w / comp.cw;
      const ky = this.h / comp.ch;
      const ringCols = [[0.99, 0.84, 0.3], [0.97, 0.93, 0.7], [0.62, 0.8, 0.9]];
      for (const [li, L] of comp.lights.entries()) {
        const cx = L.x * kx, cy = L.y * ky, r0 = Math.max(6, L.r * kx);
        const rings = r0 > 30 ? 3 : 2;
        for (let ring = 0; ring < rings; ring++) {
          const R = r0 * (1.25 + ring * 0.5) * (1 + f.pulse * 0.1);
          const len = r0 * (0.45 + ring * 0.08), wid = r0 * (0.32 - ring * 0.04);
          const n = Math.max(7, Math.round((TAU * R) / (len * 0.75)));
          for (let k = 0; k < n; k++) {
            const j = Math.sin(k * 12.9898 + li * 78.233 + ring * 3.7) * 43758.5453;
            const jr = j - Math.floor(j);
            if (jr < 0.12) continue; // gaps
            const a = (k / n) * TAU + f.mt * 0.25 * (ring % 2 ? 1 : -1) + (jr - 0.5) * 0.3;
            const rr = R * (0.92 + jr * 0.16);
            const c = ringCols[(ring + (jr > 0.8 ? 1 : 0)) % 3];
            o = this.push(o, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, a + Math.PI / 2 + (jr - 0.5) * 0.4, len, wid, c, k * 3.1 + ring, 0.35, 0.95, 0);
          }
        }
      }
    }
    return o / STRIDE;
  }
}

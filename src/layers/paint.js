// Painting styles beyond ink wash: impressionist oil (or pointillism), Van Gogh
// swirls, watercolour, ukiyo-e woodblock and pop art. Each paints a small
// animated composition (moon, sunset, sea wave, city...) chosen from the lyrics,
// and the music drives how fast and how boldly the paint goes on.

import { makeNoise, mulberry32, rgbToCss, hexToRgb, mixRgb } from '../util.js';
import { Composition, SUBJECTS } from './living.js';

const TAU = Math.PI * 2;

export { SUBJECTS };

const SUBJECT_WORDS = {
  night: ['moon', 'night', 'lake', '月', '夜', '湖', 'midnight'],
  sunset: ['sun', 'sunset', 'dawn', 'gold', '太陽', '夕', '朝', '光'],
  mountains: ['mountain', 'cloud', 'sky', 'far', '山', '雲', '空', '風'],
  flowers: ['flower', 'bloom', 'spring', 'love', 'rose', '花', '桜', '春', '咲', '愛'],
  city: ['city', 'street', 'neon', 'tonight', 'signal', 'rain', '街', '都会', 'ネオン', '信号', 'ビル', '雨'],
  wave: ['sea', 'ocean', 'wave', 'tide', 'water', '海', '波', '水', '溶け'],
  starry: ['star', 'dream', 'galaxy', 'space', 'fire', '星', '夢', '宇宙', '銀河', '燃'],
};

export function subjectFor(text, rnd) {
  const s = (text || '').toLowerCase();
  let best = null, bs = 0;
  for (const [k, words] of Object.entries(SUBJECT_WORDS)) {
    let n = 0;
    for (const w of words) if (s.includes(w)) n++;
    if (n > bs) { bs = n; best = k; }
  }
  return best || rnd.pick(SUBJECTS);
}

const C = (h) => hexToRgb(h);

// Canvas grain shared by the painters (one per size).
const grainCache = new Map();
function grain(w, h, kind = 'canvas') {
  const key = `${w}x${h}${kind}`;
  if (grainCache.has(key)) return grainCache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const rnd = mulberry32(7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let v = 128 + (rnd() - 0.5) * 40;
    if (kind === 'canvas') v += ((x % 4 < 2) !== (y % 4 < 2) ? 10 : -10);
    if (kind === 'wood') v += Math.sin(y * 0.15 + Math.sin(x * 0.01) * 6) * 18;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCache.set(key, c);
  return c;
}

function overlayGrain(g, f, kind, alpha) {
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = alpha;
  g.drawImage(grain(f.w, f.h, kind), 0, 0);
  g.restore();
}

class Painter {
  constructor(w, h, style, rnd, params = {}) {
    this.style = style;
    this.rnd = rnd;
    this.comp = new Composition(params.subject || rnd.pick(SUBJECTS), w, h, rnd, params.res || 320);
    this.noise = makeNoise(Math.floor(rnd() * 1e9));
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext('2d');
    this.frames = 0;
  }
}

// Brush styles repaint the moving picture every frame: the previous strokes are
// partly covered by a soft wash of the current frame, then fresh strokes go on,
// so the subject keeps moving and the paint itself shimmers ("boils").
function refresh(P, comp, f, alpha) {
  P.globalAlpha = alpha;
  P.imageSmoothingEnabled = true;
  P.drawImage(comp.canvas, 0, 0, f.w, f.h);
  P.globalAlpha = 1;
}

// Impressionist oil: short loaded strokes; pointillism variant.
export class OilPaint extends Painter {
  constructor(w, h, style, rnd, params) {
    super(w, h, style, rnd, params);
    this.dots = rnd() < 0.3;
  }
  draw(g, f) {
    const P = this.g, comp = this.comp;
    comp.update(f);
    refresh(P, comp, f, this.frames++ === 0 ? 1 : 0.3);
    const m = Math.min(f.w, f.h);
    const size = m * (this.dots ? 0.011 : 0.026) * (1 + f.pulse * 0.35);
    const n = Math.round((this.dots ? 1400 : 420) + f.energy * (this.dots ? 1200 : 500) + (f.beat.onBeat ? 250 : 0));
    P.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = this.rnd() * f.w, y = this.rnd() * f.h;
      let [r, gg, b] = comp.sample(x, y);
      const j = (this.rnd() - 0.5) * 40;
      r += j + (this.rnd() - 0.5) * 30; gg += j; b += j + (this.rnd() - 0.5) * 30;
      if (this.dots) {
        P.fillStyle = rgbToCss([r, gg, b]);
        P.beginPath(); P.arc(x, y, size * (0.6 + this.rnd() * 0.5), 0, TAU); P.fill();
        continue;
      }
      const a = this.noise.noise3(x * 0.004, y * 0.004, f.mt * 0.2) * TAU * 2;
      const len = size * (1.2 + this.rnd());
      const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
      P.lineWidth = size * (0.6 + this.rnd() * 0.5);
      P.strokeStyle = rgbToCss([r, gg, b], 0.9);
      P.beginPath(); P.moveTo(x - dx, y - dy); P.lineTo(x + dx, y + dy); P.stroke();
      P.lineWidth *= 0.3;
      P.strokeStyle = rgbToCss([r + 40, gg + 40, b + 40], 0.35);
      P.beginPath(); P.moveTo(x - dx, y - dy - P.lineWidth); P.lineTo(x + dx, y + dy - P.lineWidth); P.stroke();
    }
    g.drawImage(this.canvas, 0, 0);
    overlayGrain(g, f, 'canvas', 0.35);
  }
}

// Van Gogh: long thick strokes that follow swirling currents; the vortices turn with the music.
export class VanGogh extends Painter {
  constructor(w, h, style, rnd, params) {
    super(w, h, style, rnd, params);
    this.swirls = Array.from({ length: 3 }, (_, i) => ({ x: (0.25 + i * 0.25 + (rnd() - 0.5) * 0.1) * w, y: (0.2 + rnd() * 0.25) * h, s: (rnd() < 0.5 ? 1 : -1) }));
    this.spin = 0;
  }
  angle(x, y, f) {
    let a = this.noise.noise3(x * 0.003, y * 0.003, f.mt * 0.1) * TAU;
    if (y < f.h * 0.65) {
      let wx = 1, wy = 0;
      for (const s of this.swirls) {
        const sx = s.x + Math.cos(this.spin * 0.3 + s.s) * f.w * 0.03, sy = s.y + Math.sin(this.spin * 0.3) * f.h * 0.02;
        const dx = x - sx, dy = y - sy, d2 = dx * dx + dy * dy + 900;
        const k = (f.h * f.h * 0.02) / d2;
        wx += -dy * s.s * k; wy += dx * s.s * k;
      }
      a = Math.atan2(wy, wx) + Math.sin(this.spin) * 0.25;
    } else {
      a = a * 0.4 + (y > f.h * 0.8 ? 0 : -0.3);
    }
    return a;
  }
  draw(g, f) {
    const P = this.g, comp = this.comp;
    comp.update(f);
    refresh(P, comp, f, this.frames++ === 0 ? 1 : 0.22);
    this.spin += f.dt * (0.6 + f.energy * 1.5) + (f.beat.onBeat ? 0.25 : 0);
    const m = Math.min(f.w, f.h);
    const width = m * 0.013 * (1 + f.pulse * 0.3);
    const n = Math.round(200 + f.energy * 260 + (f.beat.onDownbeat ? 150 : 0));
    P.lineCap = 'round';
    P.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      let x = this.rnd() * f.w, y = this.rnd() * f.h;
      const [r, gg, b] = comp.sample(x, y);
      const pts = [[x, y]];
      const step = width * 0.9;
      for (let k = 0; k < 6; k++) {
        const a = this.angle(x, y, f);
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        pts.push([x, y]);
      }
      const path = () => { P.beginPath(); P.moveTo(pts[0][0], pts[0][1]); for (const p of pts) P.lineTo(p[0], p[1]); };
      path();
      P.lineWidth = width * 1.3;
      P.strokeStyle = rgbToCss([r * 0.6, gg * 0.6, b * 0.7], 0.7);
      P.stroke();
      path();
      P.lineWidth = width;
      const lift = this.rnd() * 50;
      P.strokeStyle = rgbToCss([r + lift, gg + lift, b + lift * 0.6]);
      P.stroke();
    }
    g.drawImage(this.canvas, 0, 0);
    overlayGrain(g, f, 'canvas', 0.3);
  }
}

// Watercolour: the moving picture as a pale wash under pigment blooms with dark
// wet edges; blooms land all the time (more on the beat) and dry out quickly.
export class Watercolor extends Painter {
  draw(g, f) {
    const P = this.g, comp = this.comp;
    comp.update(f);
    if (this.frames++ === 0) { P.fillStyle = '#ffffff'; P.fillRect(0, 0, f.w, f.h); }
    P.globalCompositeOperation = 'source-over';
    P.fillStyle = 'rgba(255,255,255,0.1)';
    P.fillRect(0, 0, f.w, f.h);
    const m = Math.min(f.w, f.h);
    const n = Math.round(14 + f.energy * 20 + (f.beat.onBeat ? 16 : 0));
    const R = m * 0.045;
    P.globalCompositeOperation = 'multiply';
    for (let i = 0; i < n; i++) {
      const x = this.rnd() * f.w, y = this.rnd() * f.h;
      const c = comp.sample(x, y);
      const r = R * (0.5 + this.rnd() * 0.9) * (1 + f.pulse * 0.3);
      const seed = this.rnd() * 100;
      P.beginPath();
      for (let k = 0; k <= 18; k++) {
        const a = (k / 18) * TAU;
        const rr = r * (0.7 + this.noise.noise3(Math.cos(a) + seed, Math.sin(a) + seed, 0) * 0.6);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        k ? P.lineTo(px, py) : P.moveTo(px, py);
      }
      P.closePath();
      P.fillStyle = rgbToCss(c, 0.3);
      P.fill();
      P.lineWidth = 2;
      P.strokeStyle = rgbToCss(mixRgb(c, [0, 0, 0], 0.35), 0.3);
      P.stroke();
    }
    if (f.hit > 0.6) {
      for (let i = 0; i < 40; i++) {
        const x = this.rnd() * f.w, y = this.rnd() * f.h;
        P.fillStyle = rgbToCss(comp.sample(x, y), 0.6);
        P.beginPath(); P.arc(x, y, 1 + this.rnd() * 4, 0, TAU); P.fill();
      }
    }
    P.globalCompositeOperation = 'source-over';
    g.fillStyle = '#f7f2e8';
    g.fillRect(0, 0, f.w, f.h);
    g.globalAlpha = 0.7;
    g.drawImage(comp.canvas, 0, 0, f.w, f.h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.canvas, 0, 0);
    g.globalCompositeOperation = 'source-over';
    overlayGrain(g, f, 'paper', 0.3);
  }
}

const UKIYO_PALETTES = [
  ['#1f3a5f', '#2b4c7e', '#8fb0c9', '#efe3c8', '#c8553d', '#1a1a1a', '#d9b77e', '#5b7553', '#f6efe0'],
  ['#0f2240', '#253f6b', '#6f8fb3', '#e8dcc0', '#b33a2e', '#141414', '#c99f5c', '#3f5e45', '#f2e8d2'],
];

// Ukiyo-e: flat woodblock colours, ink keylines, bokashi sky, wood grain.
export class Ukiyoe extends Painter {
  constructor(w, h, style, rnd, params) {
    super(w, h, style, rnd, { ...params, res: 480 });
    this.pal = UKIYO_PALETTES.map((p) => p.map(C));
    this.out = document.createElement('canvas');
    this.out.width = this.comp.cw; this.out.height = this.comp.ch;
    this.octx = this.out.getContext('2d');
    this.img = this.octx.createImageData(this.comp.cw, this.comp.ch);
    this.idx = new Uint8Array(this.comp.cw * this.comp.ch);
  }
  draw(g, f) {
    const comp = this.comp;
    comp.update(f);
    const pal = this.pal[f.section.intensity > 0.7 && f.beat.bar % 4 >= 2 ? 1 : 0];
    const W = comp.cw, H = comp.ch, d = comp.data, out = this.img.data, idx = this.idx;
    for (let i = 0, n = W * H; i < n; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      let best = 0, bd = 1e9;
      for (let k = 0; k < pal.length; k++) {
        if (k === 5) continue; // keyline ink only comes from edges
        const p = pal[k], dd = (p[0] - r) ** 2 * 0.8 + (p[1] - gg) ** 2 + (p[2] - b) ** 2 * 0.9;
        if (dd < bd) { bd = dd; best = k; }
      }
      idx[i] = best;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, k = idx[i];
      const edge = (x < W - 1 && idx[i + 1] !== k) || (y < H - 1 && idx[i + W] !== k);
      const c = edge ? pal[5] : pal[k];
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
    this.octx.putImageData(this.img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.out, 0, 0, f.w, f.h);
    // bokashi: the printer's graded band of indigo across the top
    const gr = g.createLinearGradient(0, 0, 0, f.h * 0.22);
    gr.addColorStop(0, rgbToCss(pal[0], 0.75));
    gr.addColorStop(1, rgbToCss(pal[0], 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, f.w, f.h * 0.22);
    overlayGrain(g, f, 'wood', 0.45);
    // cartouche with the keyword, like a print's title slip
    const m = Math.min(f.w, f.h);
    const word = (f.keyword || f.title || '').slice(0, 10);
    if (word) {
      const bw = m * 0.07, bh = m * 0.06 * Math.max(3, [...word].length) * 0.7;
      g.fillStyle = rgbToCss(pal[8]); g.fillRect(f.w - bw - m * 0.05, m * 0.05, bw, bh);
      g.strokeStyle = rgbToCss(pal[5]); g.lineWidth = 2; g.strokeRect(f.w - bw - m * 0.05, m * 0.05, bw, bh);
      g.fillStyle = rgbToCss(pal[5]);
      g.font = `800 ${bw * 0.6}px "Shippori Mincho", serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      [...word].forEach((ch, i) => g.fillText(ch, f.w - bw / 2 - m * 0.05, m * 0.05 + bw * 0.55 + i * bw * 0.72));
    }
  }
}

const POP_SETS = [
  ['#111111', '#e10600', '#ffd400', '#1d4ed8', '#ffffff'],
  ['#111111', '#ff2e88', '#00d1ff', '#fff200', '#ffffff'],
  ['#111111', '#7b2cff', '#ff8a00', '#00e08a', '#fff7e6'],
  ['#111111', '#0057ff', '#ff4d00', '#ffe600', '#f5f5f5'],
];

// Pop art: posterised bold colour, Ben-Day dots, black keylines; Warhol grid when loud.
// Each panel is rasterised per pixel at half its display size, dots included.
export class PopArt extends Painter {
  constructor(w, h, style, rnd, params) {
    super(w, h, style, rnd, { ...params, res: 240 });
    this.sets = POP_SETS.map((s) => s.map(C));
    const comp = this.comp;
    this.lum = new Float32Array(comp.cw * comp.ch);
    this.edge = new Uint8Array(comp.cw * comp.ch);
    this.offset = Math.floor(rnd() * 4);
    this.buffers = new Map();
  }
  buffer(pw, ph) {
    const key = pw + 'x' + ph;
    let b = this.buffers.get(key);
    if (!b) {
      const c = document.createElement('canvas');
      c.width = pw; c.height = ph;
      const ctx = c.getContext('2d');
      b = { c, ctx, img: ctx.createImageData(pw, ph) };
      this.buffers.set(key, b);
    }
    return b;
  }
  analyse() {
    const comp = this.comp, W = comp.cw, H = comp.ch, d = comp.data, L = this.lum, E = this.edge;
    for (let i = 0; i < W * H; i++) L[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = L[i];
      E[i] = (x < W - 1 && Math.abs(L[i + 1] - l) > 0.1) || (y < H - 1 && Math.abs(L[i + W] - l) > 0.1) ? 1 : 0;
    }
  }
  panel(g, f, set, x0, y0, w, h) {
    const comp = this.comp, W = comp.cw, H = comp.ch, L = this.lum, E = this.edge;
    const pw = Math.max(2, Math.round(w / 2)), ph = Math.max(2, Math.round(h / 2));
    const { c, ctx, img } = this.buffer(pw, ph);
    const o = img.data;
    const cell = Math.max(3, Math.round(Math.min(pw, ph) / 55));
    const grow = 1 + f.pulse * 0.3;
    for (let py = 0; py < ph; py++) {
      const cy = Math.min(H - 1, Math.floor((py / ph) * H));
      const row = Math.floor(py / cell);
      const shift = row % 2 ? cell / 2 : 0;
      const dy = (py % cell) - cell / 2 + 0.5;
      for (let px = 0; px < pw; px++) {
        const ci = cy * W + Math.min(W - 1, Math.floor((px / pw) * W));
        const l = L[ci];
        let col;
        if (E[ci]) col = set[0];
        else {
          const lv = l < 0.22 ? 0 : l < 0.45 ? 1 : l < 0.7 ? 2 : 3;
          col = lv === 0 ? set[3] : lv === 1 ? set[1] : lv === 2 ? set[2] : set[4];
          if (lv === 1 || lv === 2) {
            const dx = ((px + shift) % cell) - cell / 2 + 0.5;
            const r = cell * 0.5 * (1 - (l - 0.22) / 0.48) * grow;
            if (dx * dx + dy * dy < r * r) col = set[0];
          }
        }
        const i = (py * pw + px) * 4;
        o[i] = col[0]; o[i + 1] = col[1]; o[i + 2] = col[2]; o[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    g.drawImage(c, x0, y0, w, h);
    g.strokeStyle = rgbToCss(set[0]);
    g.lineWidth = Math.max(3, Math.min(w, h) * 0.012);
    g.strokeRect(x0, y0, w, h);
  }
  draw(g, f) {
    this.comp.update(f);
    this.analyse();
    const shift = this.offset + Math.floor(f.beat.bar / 2);
    if (f.section.intensity <= 0.6) {
      this.panel(g, f, this.sets[shift % this.sets.length], 0, 0, f.w, f.h);
    } else {
      const hw = f.w / 2, hh = f.h / 2;
      for (let i = 0; i < 4; i++) {
        // on each beat a different panel flips to the next colour set
        const s = this.sets[(shift + i + (i === f.beat.index % 4 ? 1 : 0)) % this.sets.length];
        this.panel(g, f, s, (i % 2) * hw, Math.floor(i / 2) * hh, hw, hh);
      }
    }
    // comic burst on accents
    if (f.hit > 0.55) {
      const m = Math.min(f.w, f.h), cx = f.w * 0.75, cy = f.h * 0.28, R = m * 0.16 * (0.8 + f.hit * 0.4);
      g.fillStyle = '#fff200'; g.strokeStyle = '#111'; g.lineWidth = 4;
      g.beginPath();
      for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU, r = k % 2 ? R * 0.62 : R; k ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + r, cy); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e10600';
      g.font = `900 ${R * 0.42}px "Bebas Neue", "Noto Sans JP", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(['POW!', 'BOOM!', 'WHAM!', 'ZAP!'][f.beat.bar % 4], cx, cy);
    }
  }
}

export const PAINT_SCENES = { oil: OilPaint, vangogh: VanGogh, watercolor: Watercolor, ukiyoe: Ukiyoe, popart: PopArt };

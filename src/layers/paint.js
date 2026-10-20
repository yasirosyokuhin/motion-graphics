// Painting styles beyond ink wash: impressionist oil (or pointillism), Van Gogh
// swirls, watercolour, ukiyo-e woodblock and pop art. Each paints a small
// animated composition (moon, sunset, sea wave, city...) chosen from the lyrics,
// and the music drives how fast and how boldly the paint goes on.

import { clamp, lerp, makeNoise, mulberry32, rgbToCss, hexToRgb, mixRgb, smoothstep } from '../util.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- subjects

export const SUBJECTS = ['night', 'sunset', 'mountains', 'flowers', 'city', 'wave', 'starry'];

const SUBJECT_WORDS = {
  night: ['moon', 'night', 'lake', '月', '夜', '湖', 'midnight'],
  sunset: ['sun', 'sunset', 'dawn', 'gold', '太陽', '夕', '朝', '光'],
  mountains: ['mountain', 'cloud', 'sky', 'far', '山', '雲', '空', '風'],
  flowers: ['flower', 'bloom', 'spring', 'love', 'rose', '花', '桜', '春', '咲', '愛'],
  city: ['city', 'street', 'neon', 'tonight', 'signal', '街', '都会', 'ネオン', '信号', 'ビル'],
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

// A small animated picture, redrawn on demand and sampled by the painters.
class Composition {
  constructor(subject, w, h, rnd, res = 320) {
    this.subject = subject;
    this.w = w; this.h = h;
    this.cw = res;
    this.ch = Math.round((res * h) / w);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.noise = makeNoise(Math.floor(rnd() * 1e9));
    this.rnd = rnd;
    const W = this.cw, H = this.ch;
    this.stars = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * H * 0.55, r: 0.5 + rnd() * 1.3, p: rnd() * TAU }));
    this.flowers = Array.from({ length: 160 }, () => ({ x: rnd() * W, y: H * (0.58 + rnd() * 0.42), c: rnd.pick(['#e63946', '#ffd166', '#ffffff', '#9b5de5', '#f4a261', '#ff8fab']), p: rnd() * TAU }));
    this.flowers.sort((a, b) => a.y - b.y);
    this.buildings = [];
    for (let x = -5; x < W; ) {
      const bw = 10 + rnd() * 26;
      this.buildings.push({ x, w: bw, h: H * (0.2 + rnd() * 0.45), seed: Math.floor(rnd() * 1e6) });
      x += bw + rnd() * 3;
    }
    this.big = Array.from({ length: 9 }, () => ({ x: rnd() * W, y: rnd() * H * 0.5, r: 2 + rnd() * 4 }));
    this.data = null;
  }

  ridge(y0, amp, scale, seed, t = 0) {
    const g = this.ctx, W = this.cw, H = this.ch;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, y0 - this.noise.fbm(x * scale + seed, seed, t, 4) * amp);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }

  grad(stops, y0 = 0, y1 = this.ch) {
    const gr = this.ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  }

  glow(x, y, r, color, a) {
    const g = this.ctx;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', a));
    gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  update(f) {
    const g = this.ctx, W = this.cw, H = this.ch, t = f.mt, m = Math.min(W, H);
    const pulse = f.pulse, bass = f.bass, energy = f.energy;
    g.globalAlpha = 1;
    switch (this.subject) {
      case 'night': {
        const hy = H * 0.66;
        g.fillStyle = this.grad([[0, '#060f2a'], [1, '#2a4c86']], 0, hy); g.fillRect(0, 0, W, hy);
        for (const s of this.stars) { g.fillStyle = `rgba(255,250,220,${clamp(0.4 + 0.5 * Math.sin(t * 3 + s.p) + pulse * 0.3)})`; g.fillRect(s.x, s.y, s.r, s.r); }
        const mx = W * 0.72, my = H * 0.24, mr = m * 0.085;
        this.glow(mx, my, mr * (3 + bass), 'rgba(255,240,190,A)', 0.35 + bass * 0.3);
        g.fillStyle = '#fff4cf'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
        g.fillStyle = '#1b2f58'; this.ridge(hy - H * 0.05, H * 0.22, 0.012, 3);
        g.fillStyle = '#0c1830'; this.ridge(hy + 1, H * 0.12, 0.02, 9);
        g.fillStyle = this.grad([[0, '#17305c'], [1, '#081226']], hy, H); g.fillRect(0, hy, W, H - hy);
        for (let y = hy + 2; y < H; y += 3) {
          const k = (y - hy) / (H - hy), wv = Math.sin(y * 0.9 + t * 4) * (3 + k * 8);
          g.fillStyle = `rgba(255,240,200,${0.7 - k * 0.5})`;
          g.fillRect(mx - mr * (0.6 + k) + wv, y, mr * (1.2 + 2 * k) * (0.5 + 0.5 * Math.sin(y * 0.37 + t * 2)), 1.4);
        }
        break;
      }
      case 'sunset': {
        const hy = H * 0.62;
        g.fillStyle = this.grad([[0, '#2d1b5e'], [0.55, '#ff6f61'], [1, '#ffc371']], 0, hy); g.fillRect(0, 0, W, hy);
        const sx = W * 0.5, sr = m * (0.12 + bass * 0.02), sy = hy - sr * 0.35;
        this.glow(sx, sy, sr * 3.2, 'rgba(255,220,150,A)', 0.55);
        g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
        g.fillStyle = '#6b2f57'; this.ridge(hy + 1, H * 0.1, 0.015, 5);
        g.fillStyle = this.grad([[0, '#c0485e'], [1, '#2a163a']], hy, H); g.fillRect(0, hy, W, H - hy);
        for (let y = hy + 2; y < H; y += 2.5) {
          const k = (y - hy) / (H - hy);
          g.fillStyle = `rgba(255,225,160,${0.8 - k * 0.6})`;
          const wdt = sr * (0.6 + k * 2.2) * (0.6 + 0.4 * Math.sin(y * 0.5 + t * 3));
          g.fillRect(sx - wdt / 2 + Math.sin(y + t * 5) * 3, y, wdt, 1.2);
        }
        break;
      }
      case 'mountains': {
        g.fillStyle = this.grad([[0, '#86b6e6'], [1, '#eaf3fb']]); g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 6; i++) {
          const cx = ((i * 97 + t * 6) % (W + 80)) - 40, cy = H * (0.12 + (i % 3) * 0.08);
          for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(cx + k * 9, cy + Math.sin(k) * 3, 7 + (k % 2) * 4, 0, TAU); g.fill(); }
        }
        const layers = [['#a9bdd2', 0.42, 0.28], ['#7f9bb6', 0.55, 0.25], ['#4f7a6e', 0.7, 0.2], ['#2f5d3a', 0.86, 0.14]];
        layers.forEach(([c, y, a], i) => { g.fillStyle = c; this.ridge(H * y, H * a, 0.01 + i * 0.006, i * 11); });
        break;
      }
      case 'flowers': {
        g.fillStyle = this.grad([[0, '#7fb8f5'], [1, '#e6f4ff']], 0, H * 0.6); g.fillRect(0, 0, W, H * 0.6);
        g.fillStyle = '#7fae5a'; this.ridge(H * 0.6, H * 0.08, 0.01, 2);
        g.fillStyle = this.grad([[0, '#5c9a3d'], [1, '#2f6a24']], H * 0.58, H); g.fillRect(0, H * 0.62, W, H);
        for (const fl of this.flowers) {
          const k = (fl.y - H * 0.58) / (H * 0.42);
          const r = 1 + k * 4.5 * (1 + pulse * 0.25);
          const x = fl.x + Math.sin(t * 2 + fl.p) * 2 * (1 + energy);
          g.fillStyle = fl.c; g.beginPath(); g.arc(x, fl.y, r, 0, TAU); g.fill();
          g.fillStyle = '#ffe680'; g.beginPath(); g.arc(x, fl.y, r * 0.3, 0, TAU); g.fill();
        }
        break;
      }
      case 'city': {
        const hy = H * 0.8;
        g.fillStyle = this.grad([[0, '#1a0b3d'], [0.7, '#7a2a8c'], [1, '#ff5f8f']], 0, hy); g.fillRect(0, 0, W, hy);
        const tick = Math.floor(t * 2) + f.beat.index;
        for (const b of this.buildings) {
          g.fillStyle = '#120a26';
          g.fillRect(b.x, hy - b.h, b.w, b.h);
          for (let wy = hy - b.h + 3; wy < hy - 3; wy += 4) for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 4) {
            const hsh = Math.sin(wx * 12.9 + wy * 78.2 + b.seed + (tick % 7)) * 43758.5;
            if (hsh - Math.floor(hsh) < 0.25 + energy * 0.3) { g.fillStyle = (b.seed % 5) ? '#ffd27f' : '#7fe8ff'; g.fillRect(wx, wy, 2, 2); }
          }
        }
        g.fillStyle = this.grad([[0, '#2a1240'], [1, '#09040f']], hy, H); g.fillRect(0, hy, W, H - hy);
        for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? 'rgba(255,95,143,0.5)' : 'rgba(127,232,255,0.45)'; g.fillRect((i * 37 + t * 20) % W, hy + 3 + (i % 5) * 4, 10 + (i % 3) * 6, 1.2); }
        break;
      }
      case 'wave': {
        const hy = H * 0.55;
        g.fillStyle = this.grad([[0, '#e9d7ad'], [1, '#f6ecd2']], 0, hy); g.fillRect(0, 0, W, hy);
        const fx = W * 0.72;
        g.fillStyle = '#4f6688'; g.beginPath(); g.moveTo(fx - W * 0.12, hy); g.lineTo(fx, hy - H * 0.16); g.lineTo(fx + W * 0.12, hy); g.fill();
        g.fillStyle = '#f7f4ec'; g.beginPath(); g.moveTo(fx - W * 0.035, hy - H * 0.11); g.lineTo(fx, hy - H * 0.16); g.lineTo(fx + W * 0.035, hy - H * 0.11); g.fill();
        g.fillStyle = '#2b4c7e'; g.fillRect(0, hy, W, H - hy);
        // the big wave: a crest that rises with the energy and curls forward
        const amp = H * (0.45 + energy * 0.15 + pulse * 0.04), cx = W * 0.32 + Math.sin(t * 0.5) * W * 0.03;
        g.fillStyle = '#1d3a66';
        g.beginPath(); g.moveTo(-10, H);
        for (let x = -10; x <= W * 0.75; x += 2) {
          const d = (x - cx) / (W * 0.2);
          const y = H - Math.exp(-d * d) * amp - Math.sin(x * 0.08 + t * 2) * 3;
          g.lineTo(x, y);
        }
        g.lineTo(W * 0.75, H); g.closePath(); g.fill();
        g.strokeStyle = '#9fc0dd'; g.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          for (let x = -10; x <= W * 0.7; x += 3) {
            const d = (x - cx) / (W * 0.2);
            const y = H - Math.exp(-d * d) * amp * (1 - k * 0.18) + k * 6;
            x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
        // foam claws along the curl
        g.fillStyle = '#f7f4ec';
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 1.1 + t * 0.3;
          const r = amp * 0.22 * (0.7 + 0.3 * Math.sin(i * 1.7 + t * 3));
          const px = cx + W * 0.06 + Math.cos(a + Math.PI) * r, py = H - amp + amp * 0.18 + Math.sin(a + Math.PI) * r * 0.8;
          g.beginPath(); g.arc(px, py, 1.5 + (i % 3), 0, TAU); g.fill();
        }
        for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 23 + t * 12) % W, hy + 4 + (i % 7) * 6, 1.2, 0, TAU); g.fill(); }
        break;
      }
      default: { // starry
        const hy = H * 0.72;
        g.fillStyle = this.grad([[0, '#0b2466'], [1, '#2f5aa8']], 0, hy); g.fillRect(0, 0, W, hy);
        g.strokeStyle = 'rgba(160,200,255,0.35)'; g.lineWidth = 3;
        for (let k = 0; k < 3; k++) { const cx = W * (0.3 + k * 0.22), cy = H * (0.28 + (k % 2) * 0.08); for (let r = 6; r < 40; r += 7) { g.beginPath(); g.arc(cx, cy, r, t * 0.5 + k, t * 0.5 + k + 4.4); g.stroke(); } }
        for (const s of this.big) { this.glow(s.x, s.y, s.r * (4 + pulse * 2), 'rgba(255,230,120,A)', 0.6); g.fillStyle = '#ffe36a'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); }
        g.fillStyle = '#ffe066'; g.beginPath(); g.arc(W * 0.86, H * 0.14, m * 0.07, 0, TAU); g.fill();
        g.fillStyle = '#163a7a'; g.beginPath(); g.arc(W * 0.875, H * 0.13, m * 0.06, 0, TAU); g.fill();
        g.fillStyle = '#1e3d72'; this.ridge(hy, H * 0.1, 0.015, 4);
        g.fillStyle = '#16264a'; g.fillRect(0, hy, W, H - hy);
        for (let i = 0; i < 14; i++) { const x = W * 0.35 + i * W * 0.045, y = hy + 4 + (i % 3) * 3; g.fillStyle = '#2b3d66'; g.fillRect(x, y, 9, 7); g.fillStyle = '#ffd34d'; g.fillRect(x + 3, y + 3, 2, 2); }
        g.fillStyle = '#0f1d0f';
        g.beginPath(); g.moveTo(W * 0.08, H);
        for (let y = H; y > H * 0.18; y -= 4) { const k = (H - y) / (H * 0.82); g.lineTo(W * 0.12 - Math.sin(y * 0.2 + t * 2) * 3 - (1 - k) * W * 0.05, y); }
        for (let y = H * 0.18; y < H; y += 4) { const k = (H - y) / (H * 0.82); g.lineTo(W * 0.12 + Math.sin(y * 0.23 + t * 2) * 3 + (1 - k) * W * 0.05, y); }
        g.fill();
      }
    }
    this.data = g.getImageData(0, 0, W, H).data;
  }

  // colour at stage coordinates
  sample(x, y) {
    const cx = clamp(Math.floor((x / this.w) * this.cw), 0, this.cw - 1);
    const cy = clamp(Math.floor((y / this.h) * this.ch), 0, this.ch - 1);
    const i = (cy * this.cw + cx) * 4, d = this.data;
    return [d[i], d[i + 1], d[i + 2]];
  }
}

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

// Impressionist oil: short loaded strokes, coarse to fine; pointillism variant.
export class OilPaint extends Painter {
  constructor(w, h, style, rnd, params) {
    super(w, h, style, rnd, params);
    this.dots = rnd() < 0.3;
  }
  draw(g, f) {
    const P = this.g, comp = this.comp;
    if (this.frames % 2 === 0) comp.update(f);
    if (this.frames === 0) {
      P.filter = 'blur(12px)';
      P.drawImage(comp.canvas, 0, 0, f.w, f.h);
      P.filter = 'none';
    }
    this.frames++;
    const prog = clamp(f.segT / 10);
    const m = Math.min(f.w, f.h);
    const size = m * lerp(this.dots ? 0.018 : 0.05, this.dots ? 0.007 : 0.014, prog) * (1 + f.pulse * 0.4);
    const n = Math.round((this.dots ? 500 : 140) + f.energy * (this.dots ? 900 : 360) + (f.beat.onBeat ? 200 : 0));
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
      const a = this.noise.noise3(x * 0.004, y * 0.004, f.mt * 0.1) * TAU * 2;
      const len = size * (1.2 + this.rnd());
      const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
      P.lineWidth = size * (0.6 + this.rnd() * 0.5);
      P.strokeStyle = rgbToCss([r, gg, b], 0.9);
      P.beginPath(); P.moveTo(x - dx, y - dy); P.lineTo(x + dx, y + dy); P.stroke();
      // a lighter ridge of paint along the stroke
      P.lineWidth *= 0.3;
      P.strokeStyle = rgbToCss([r + 40, gg + 40, b + 40], 0.35);
      P.beginPath(); P.moveTo(x - dx, y - dy - P.lineWidth); P.lineTo(x + dx, y + dy - P.lineWidth); P.stroke();
    }
    g.drawImage(this.canvas, 0, 0);
    overlayGrain(g, f, 'canvas', 0.35);
  }
}

// Van Gogh: long thick strokes that follow swirling currents in the sky.
export class VanGogh extends Painter {
  constructor(w, h, style, rnd, params) {
    super(w, h, style, rnd, params);
    this.swirls = Array.from({ length: 3 }, (_, i) => ({ x: (0.25 + i * 0.25 + (rnd() - 0.5) * 0.1) * w, y: (0.2 + rnd() * 0.25) * h, s: (rnd() < 0.5 ? 1 : -1) }));
    this.spin = 0;
  }
  angle(x, y, f) {
    let a = this.noise.noise3(x * 0.003, y * 0.003, f.mt * 0.05) * TAU;
    if (y < f.h * 0.65) {
      let wx = 0, wy = 0;
      for (const s of this.swirls) {
        const dx = x - s.x, dy = y - s.y, d2 = dx * dx + dy * dy + 900;
        const k = (f.h * f.h * 0.02) / d2;
        wx += -dy * s.s * k; wy += dx * s.s * k;
      }
      wx += 1; // the sky drifts sideways between the vortices
      a = Math.atan2(wy, wx) + this.spin * 0.2;
    } else {
      a = a * 0.4 + (y > f.h * 0.8 ? 0 : -0.3);
    }
    return a;
  }
  draw(g, f) {
    const P = this.g, comp = this.comp;
    if (this.frames % 2 === 0) comp.update(f);
    if (this.frames === 0) { P.filter = 'blur(10px)'; P.drawImage(comp.canvas, 0, 0, f.w, f.h); P.filter = 'none'; }
    this.frames++;
    this.spin += f.dt * (0.4 + f.energy) + (f.beat.onBeat ? 0.15 : 0);
    const m = Math.min(f.w, f.h);
    const width = m * (0.012 + 0.006 * (1 - clamp(f.segT / 12))) * (1 + f.pulse * 0.3);
    const n = Math.round(70 + f.energy * 160 + (f.beat.onDownbeat ? 120 : 0));
    P.lineCap = 'round';
    P.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      let x = this.rnd() * f.w, y = this.rnd() * f.h;
      const [r, gg, b] = comp.sample(x, y);
      const pts = [[x, y]];
      const step = width * 0.9;
      for (let k = 0; k < 7; k++) {
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

// Watercolour: a soft wash of the picture under translucent pigment blooms
// with darker wet edges; blooms keep landing (more on the beat) and slowly dry out.
export class Watercolor extends Painter {
  draw(g, f) {
    const P = this.g, comp = this.comp;
    if (this.frames % 3 === 0) comp.update(f);
    if (this.frames === 0) { P.fillStyle = '#ffffff'; P.fillRect(0, 0, f.w, f.h); }
    this.frames++;
    P.globalCompositeOperation = 'source-over';
    P.fillStyle = 'rgba(255,255,255,0.025)';
    P.fillRect(0, 0, f.w, f.h);
    const m = Math.min(f.w, f.h);
    const n = Math.round(6 + f.energy * 10 + (f.beat.onBeat ? 10 : 0));
    const R = m * lerp(0.07, 0.03, clamp(f.segT / 10));
    P.globalCompositeOperation = 'multiply';
    for (let i = 0; i < n; i++) {
      const x = this.rnd() * f.w, y = this.rnd() * f.h;
      const c = comp.sample(x, y);
      const r = R * (0.5 + this.rnd() * 0.9);
      const seed = this.rnd() * 100;
      for (let layer = 0; layer < 2; layer++) {
        P.beginPath();
        for (let k = 0; k <= 20; k++) {
          const a = (k / 20) * TAU;
          const rr = r * (0.7 + this.noise.noise3(Math.cos(a) + seed, Math.sin(a) + seed, layer) * 0.6);
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
          k ? P.lineTo(px, py) : P.moveTo(px, py);
        }
        P.closePath();
        P.fillStyle = rgbToCss(c, 0.22);
        P.fill();
        P.lineWidth = 2;
        P.strokeStyle = rgbToCss(mixRgb(c, [0, 0, 0], 0.35), 0.25);
        P.stroke();
      }
    }
    if (f.hit > 0.6) {
      for (let i = 0; i < 40; i++) {
        const x = this.rnd() * f.w, y = this.rnd() * f.h;
        P.fillStyle = rgbToCss(comp.sample(x, y), 0.6);
        P.beginPath(); P.arc(x, y, 1 + this.rnd() * 4, 0, TAU); P.fill();
      }
    }
    P.globalCompositeOperation = 'source-over';
    // paper, then the pale underpainting, then the pigment layer multiplied on top
    g.fillStyle = '#f7f2e8';
    g.fillRect(0, 0, f.w, f.h);
    g.globalAlpha = 0.6;
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
export { smoothstep };

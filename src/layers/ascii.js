// Native ASCII scenes. Every scene fills an AsciiGrid (char + colour index per
// cell) from the frame state and the grid is stamped onto the stage.

import { clamp, smoothstep, mulberry32, makeNoise, rgbToCss, mixRgb, wrapText, isCJK } from '../util.js';
import { fontOf } from '../style.js';

const MONO = '"JetBrains Mono", "DotGothic16", ui-monospace, monospace';

export class AsciiGrid {
  constructor(w, h, cellH) {
    this.resize(w, h, cellH);
  }

  resize(w, h, cellH) {
    this.w = w; this.h = h;
    this.ch = cellH;
    this.cw = Math.round(cellH * 0.6 * 100) / 100;
    this.cols = Math.ceil(w / this.cw);
    this.rows = Math.ceil(h / this.ch);
    const n = this.cols * this.rows;
    this.chars = new Array(n).fill(' ');
    this.col = new Uint8Array(n);
    this.z = new Float32Array(n);
  }

  clear() {
    this.chars.fill(' ');
    this.col.fill(0);
    this.z.fill(-1e9);
  }

  set(x, y, c, k = 0) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const i = x + y * this.cols;
    this.chars[i] = c;
    this.col[i] = k;
  }

  text(x, y, s, k = 0) {
    let i = 0;
    for (const c of s) this.set(x + i++, y, c, k);
  }

  // colors: array of css strings indexed by colour key (0 is never drawn).
  draw(g, colors, { font = MONO, weight = 600, ox = 0, oy = 0 } = {}) {
    g.font = `${weight} ${this.ch * 0.92}px ${font}`;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    const { cols, rows, cw, ch, chars, col } = this;
    for (let k = 1; k < colors.length; k++) {
      if (!colors[k]) continue;
      g.fillStyle = colors[k];
      for (let y = 0; y < rows; y++) {
        const row = y * cols;
        for (let x = 0; x < cols; x++) {
          const i = row + x;
          if (col[i] !== k) continue;
          const c = chars[i];
          if (c === ' ') continue;
          g.fillText(c, ox + x * cw, oy + y * ch);
        }
      }
    }
  }
}

const rampChar = (cs, v) => cs[Math.max(0, Math.min(cs.length - 1, Math.floor(v * cs.length)))];

// Standard 5-colour keys: 1 dim, 2 primary, 3 secondary, 4 accent, 5 fg.
export function gridColors(style, dimAmt = 0.35) {
  const [c1, c2, c3] = style.colors;
  return [null, rgbToCss(mixRgb(style.bg, c1, dimAmt)), rgbToCss(c1), rgbToCss(c2), rgbToCss(c3), rgbToCss(style.fg)];
}

// ---------------------------------------------------------------- scenes

class Base {
  constructor(w, h, style, rnd) {
    this.style = style;
    this.rnd = rnd;
    this.grid = new AsciiGrid(w, h, Math.round(clamp(Math.min(w, h) / 46, 11, 24)));
    this.colors = gridColors(style);
  }
  bg(g, f) {
    g.fillStyle = rgbToCss(this.style.bg);
    g.fillRect(0, 0, f.w, f.h);
  }
  present(g) {
    this.grid.draw(g, this.colors);
  }
}

export class AsciiTunnel extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.mode = rnd.pick(['tunnel', 'plasma', 'rings', 'tunnel']);
    this.segs = rnd.int(3, 8);
    this.cs = style.charset;
  }
  draw(g, f) {
    this.bg(g, f);
    const G = this.grid; G.clear();
    const { cols, rows, cw, ch } = G;
    const m = Math.min(f.w, f.h);
    const t = f.mt, bass = f.bass, cs = this.cs;
    const z = t * (0.9 + f.energy * 1.4);
    const twist = Math.sin(t * 0.3) * 1.5;
    for (let y = 0; y < rows; y++) {
      const v = ((y + 0.5) * ch - f.h / 2) / m;
      for (let x = 0; x < cols; x++) {
        const u = ((x + 0.5) * cw - f.w / 2) / m;
        const r = Math.sqrt(u * u + v * v) + 1e-4;
        const a = Math.atan2(v, u);
        let val, k;
        if (this.mode === 'plasma') {
          const s = 9 + bass * 4;
          val = (Math.sin(u * s + t) + Math.sin(v * s * 1.3 + t * 1.1) + Math.sin((u + v) * s * 0.7 + t * 0.7) + Math.sin(r * s * 1.6 - t * 2)) / 8 + 0.5;
          k = 2 + (Math.floor(val * 6 + t) % 3 + 3) % 3;
        } else if (this.mode === 'rings') {
          const ring = Math.sin(r * (18 + bass * 10) - t * 5);
          val = (ring * 0.5 + 0.5) * (0.55 + 0.45 * Math.sin(a * this.segs + t * 1.5));
          val *= smoothstep(0.9, 0.05, r);
          k = r < 0.18 + f.pulse * 0.1 ? 4 : 2 + (Math.floor(r * 8 - t) % 2 + 2) % 2;
        } else {
          const depth = 0.3 / r + z;
          const ang = a + twist * (0.3 / r) * 0.15;
          val = (0.5 + 0.5 * Math.sin(ang * this.segs)) * (0.5 + 0.5 * Math.sin(depth * 6.283));
          val = val * smoothstep(0.02, 0.35, r) * (0.7 + 0.6 * f.pulse);
          k = ((Math.floor(depth * 1.5) % 3) + 3) % 3 + 2;
          if (r < 0.06) { val = 0; }
        }
        val = clamp(val * (0.75 + f.energy * 0.6));
        if (val < 0.06) continue;
        G.set(x, y, rampChar(cs, val), val > 0.92 ? 5 : val < 0.25 ? 1 : k);
      }
    }
    this.present(g);
  }
}

export class AsciiShape extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.shape = rnd.pick(['torus', 'sphere', 'cube', 'torus']);
    this.cs = '.,-~:;=!*#$@';
  }
  plot(G, f, px, py, pz, lum) {
    const x = Math.floor(px / G.cw), y = Math.floor(py / G.ch);
    if (x < 0 || y < 0 || x >= G.cols || y >= G.rows) return;
    const i = x + y * G.cols;
    if (pz <= G.z[i]) return;
    G.z[i] = pz;
    const l = clamp(lum);
    G.chars[i] = rampChar(this.cs, l);
    G.col[i] = l > 0.85 ? 5 : l > 0.5 ? 2 : l > 0.2 ? 3 : 1;
  }
  draw(g, f) {
    this.bg(g, f);
    const G = this.grid; G.clear();
    const t = f.mt;
    const A = t * 0.9 + f.beat.index * 0.12, B = t * 0.55;
    const cA = Math.cos(A), sA = Math.sin(A), cB = Math.cos(B), sB = Math.sin(B);
    const scale = Math.min(f.w, f.h) * (0.36 + f.bass * 0.08 + f.pulse * 0.04);
    const cx = f.w / 2, cy = f.h / 2;
    const light = [0, 0.7, -0.7];
    const project = (x, y, z, nx, ny, nz) => {
      // rotate around X (A) then Z (B)
      let y1 = y * cA - z * sA, z1 = y * sA + z * cA;
      let x2 = x * cB - y1 * sB, y2 = x * sB + y1 * cB;
      let ny1 = ny * cA - nz * sA, nz1 = ny * sA + nz * cA;
      let nx2 = nx * cB - ny1 * sB, ny2 = nx * sB + ny1 * cB;
      const ooz = 1 / (z1 + 4);
      const lum = nx2 * light[0] + ny2 * light[1] + nz1 * light[2];
      this.plot(G, f, cx + x2 * scale * ooz * 3, cy - y2 * scale * ooz * 3, ooz, lum * 0.8 + 0.2);
    };
    if (this.shape === 'torus') {
      for (let th = 0; th < 6.283; th += 0.07) {
        const ct = Math.cos(th), st = Math.sin(th);
        for (let ph = 0; ph < 6.283; ph += 0.025) {
          const cp = Math.cos(ph), sp = Math.sin(ph);
          const R = 1 + 0.45 * ct;
          project(R * cp, R * sp, 0.45 * st, ct * cp, ct * sp, st);
        }
      }
    } else if (this.shape === 'sphere') {
      const spec = f.spectrum;
      for (let la = -1.55; la < 1.55; la += 0.045) {
        const cl = Math.cos(la), sl = Math.sin(la);
        for (let lo = 0; lo < 6.283; lo += 0.035) {
          const bin = spec[Math.floor(((lo / 6.283) * 40 + Math.abs(la) * 10)) % spec.length] || 0;
          const r = 1.1 + bin * 0.45;
          const nx = cl * Math.cos(lo), ny = sl, nz = cl * Math.sin(lo);
          project(nx * r, ny * r, nz * r, nx, ny, nz);
        }
      }
    } else {
      const s = 0.95, step = 0.04;
      const faces = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
      for (const [nx, ny, nz] of faces) {
        for (let a = -s; a <= s; a += step) for (let b = -s; b <= s; b += step) {
          let x, y, z;
          if (nx) { x = nx * s; y = a; z = b; } else if (ny) { x = a; y = ny * s; z = b; } else { x = a; y = b; z = nz * s; }
          const edge = Math.max(Math.abs(a), Math.abs(b)) > s - step * 1.5;
          project(x, y, z, nx + (edge ? 0.6 : 0), ny + (edge ? 0.6 : 0), nz);
        }
      }
    }
    // Orbiting satellites on loud passages.
    if (f.section.intensity > 0.6) {
      for (let i = 0; i < 6; i++) {
        const a = t * 1.3 + (i * Math.PI) / 3;
        const px = cx + Math.cos(a) * scale * 1.5, py = cy + Math.sin(a) * scale * 0.55;
        G.text(Math.floor(px / G.cw), Math.floor(py / G.ch), i % 2 ? '[+]' : '<o>', 4);
      }
    }
    this.present(g);
  }
}

// Big lyric (or title) lettering made of characters, over digital rain.
export class AsciiText extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.grid = new AsciiGrid(w, h, Math.round(clamp(Math.min(w, h) / 62, 9, 20)));
    this.cs = style.charset.trim().length > 3 ? style.charset : '01';
    this.solid = '#%@&$8BWM';
    const G = this.grid;
    this.mask = document.createElement('canvas');
    this.mask.width = G.cols; this.mask.height = G.rows;
    this.mctx = this.mask.getContext('2d', { willReadFrequently: true });
    this.text = null;
    this.alpha = null;
    this.drops = Array.from({ length: G.cols }, () => ({ y: rnd() * G.rows, v: 0.2 + rnd() * 0.8 }));
    this.rainChars = style.charsetAlt.trim() || '01';
  }
  setText(text, f) {
    if (text === this.text) return;
    this.text = text;
    const G = this.grid, c = this.mctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, G.cols, G.rows);
    if (!text) { this.alpha = null; return; }
    c.setTransform(1 / G.cw, 0, 0, 1 / G.ch, 0, 0);
    const face = isCJK(text) ? this.style.typeface.jp : this.style.typeface.en;
    let size = f.h * 0.42;
    let lines;
    for (let i = 0; i < 12; i++) {
      c.font = fontOf(face, size);
      lines = wrapText(c, text, f.w * 0.9);
      const wMax = Math.max(...lines.map((l) => c.measureText(l).width));
      if (wMax <= f.w * 0.92 && lines.length * size * 1.05 <= f.h * 0.8) break;
      size *= 0.85;
    }
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const lh = size * 1.02;
    lines.forEach((l, i) => c.fillText(l, f.w / 2, f.h / 2 + (i - (lines.length - 1) / 2) * lh));
    const d = c.getImageData(0, 0, G.cols, G.rows).data;
    this.alpha = new Float32Array(G.cols * G.rows);
    for (let i = 0; i < this.alpha.length; i++) this.alpha[i] = d[i * 4 + 3] / 255;
  }
  draw(g, f) {
    this.bg(g, f);
    const G = this.grid; G.clear();
    const text = f.lyric ? f.lyric.text : f.title;
    const n = [...(text || '')].length;
    this.setText(n > (isCJK(text || '') ? 9 : 16) ? f.keyword : text, f);
    // rain
    const speed = 0.25 + f.energy * 0.9 + f.pulse * 0.6;
    const rc = this.rainChars;
    for (let x = 0; x < G.cols; x++) {
      const d = this.drops[x];
      d.y += d.v * speed * f.dt * 30;
      if (d.y > G.rows + 20) { d.y = -this.rnd() * 20; d.v = 0.2 + this.rnd() * 0.8; }
      for (let k = 0; k < 14; k++) {
        const y = Math.floor(d.y) - k;
        if (y < 0 || y >= G.rows) continue;
        const ch = rc[(x * 7 + y * 13 + Math.floor(f.t * 12)) % rc.length];
        G.set(x, y, ch, k === 0 ? 2 : 1);
      }
    }
    // lettering
    if (this.alpha) {
      const wave = f.bass * 2.5 + f.hit * 3;
      const cs = this.cs;
      const tick = Math.floor(f.t * 15);
      for (let y = 0; y < G.rows; y++) {
        const glitch = f.hit > 0.4 && ((y * 7 + tick) % 11 === 0) ? Math.round((this.rnd() - 0.5) * 8) : 0;
        const off = Math.round(Math.sin(y * 0.35 + f.mt * 3) * wave) + glitch;
        for (let x = 0; x < G.cols; x++) {
          const sx = x - off;
          if (sx < 0 || sx >= G.cols) continue;
          const a = this.alpha[sx + y * G.cols];
          if (a < 0.2) continue;
          const sol = this.solid;
          const c = a > 0.55 ? sol[(x * 3 + y * 5 + tick) % sol.length] : rampChar(cs, 0.4 + a * 0.6);
          G.set(x, y, c, a > 0.55 ? (f.pulse > 0.75 ? 4 : 5) : 3);
        }
      }
    }
    this.present(g);
  }
}

// Spectrum analyser + oscilloscope + readouts, all in characters.
export class AsciiSpectrum extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.peaks = new Float32Array(64);
    this.mirror = rnd() < 0.6;
  }
  draw(g, f) {
    this.bg(g, f);
    const G = this.grid; G.clear();
    const bars = Math.min(64, Math.floor(G.cols / 2));
    const bw = G.cols / bars;
    const base = this.mirror ? Math.floor(G.rows / 2) : G.rows - 3;
    const maxH = this.mirror ? G.rows * 0.32 : G.rows * 0.55;
    const blocks = ' ▁▂▃▄▅▆▇█';
    for (let i = 0; i < bars; i++) {
      const v = clamp(f.spectrum[Math.floor((i / bars) * f.spectrum.length)] * 1.25);
      this.peaks[i] = Math.max(v, this.peaks[i] - f.dt * 0.4);
      const hgt = v * maxH;
      const x0 = Math.floor(i * bw), x1 = Math.floor((i + 1) * bw) - 1;
      for (let x = x0; x < Math.max(x0 + 1, x1 - 1); x++) {
        for (let k = 0; k < Math.ceil(hgt); k++) {
          const frac = clamp(hgt - k);
          const c = frac >= 1 ? (k % 2 ? '▓' : '█') : blocks[Math.floor(frac * 8)];
          const key = k > maxH * 0.8 ? 4 : k > maxH * 0.45 ? 3 : k % 3 === 0 ? 2 : 1;
          G.set(x, base - k, c, key);
          if (this.mirror) G.set(x, base + 1 + k, k % 2 ? '░' : '▒', 1);
        }
        G.set(x, base - Math.ceil(this.peaks[i] * maxH) - 1, '▔', 5);
      }
    }
    // oscilloscope line
    const wy = this.mirror ? 3 : Math.floor(G.rows * 0.22);
    for (let x = 0; x < G.cols; x++) {
      const s = f.wave[Math.floor((x / G.cols) * f.wave.length)] || 0;
      G.set(x, wy + Math.round(s * 4), s > 0.15 ? '*' : s < -0.15 ? '·' : '-', 5);
    }
    const tc = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    G.text(2, 1, `BPM ${f.bpm.toFixed(1)}  BAR ${String(f.beat.bar + 1).padStart(3, '0')}.${(f.beat.index % 4) + 1}  SEC ${String(f.section.index + 1).padStart(2, '0')}`, 5);
    G.text(G.cols - 14, 1, tc(f.t), 4);
    G.text(2, G.rows - 2, `LVL ${'█'.repeat(Math.round(f.energy * 20)).padEnd(20, '·')}`, 3);
    this.present(g);
  }
}

// A school of ASCII fish (boids) that scatters on hits; sharks on loud parts.
const SHARK_R = [
  '            ,|',
  '          ,/ |',
  '  ______/   `-.______',
  '<`  °            ___ `>==',
  ' `-.____,  ,---´   `´',
  '        `-´',
];
const SHARK_L = SHARK_R.map((l) => [...l.padEnd(26)].reverse().join('')
  .replace(/[<>/\\`´,]/g, (c) => ({ '<': '>', '>': '<', '/': '\\', '\\': '/', '`': '´', '´': '`', ',': ',' })[c] || c));

export class FishSchool extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.grid = new AsciiGrid(w, h, Math.round(clamp(Math.min(w, h) / 34, 14, 32)));
    const n = Math.round(clamp((w * h) / 6000, 90, 220));
    this.fish = Array.from({ length: n }, (_, i) => ({
      x: rnd() * w, y: rnd() * h, vx: (rnd() - 0.5) * 80, vy: (rnd() - 0.5) * 30,
      big: i % 17 === 0, k: 2 + (i % 3),
    }));
    this.bubbles = Array.from({ length: 40 }, () => ({ x: rnd() * w, y: rnd() * h, v: 20 + rnd() * 40 }));
    this.shark = null;
    this.noise = makeNoise(style.seed + 7);
  }
  draw(g, f) {
    this.bg(g, f);
    const G = this.grid; G.clear();
    const dt = Math.min(0.05, f.dt);
    const speed = 60 + f.energy * 120;
    const scare = f.hit > 0.5 || (f.beat.onDownbeat && f.section.intensity > 0.6);
    const fish = this.fish;
    const R = 110, R2 = R * R;
    for (const a of fish) {
      let ax = 0, ay = 0, cx = 0, cy = 0, vx = 0, vy = 0, n = 0;
      for (const b of fish) {
        if (a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        n++; cx += b.x; cy += b.y; vx += b.vx; vy += b.vy;
        if (d2 < 400) { ax -= dx * 4; ay -= dy * 4; }
      }
      if (n) {
        ax += (cx / n - a.x) * 1.6 + (vx / n - a.vx) * 1.8;
        ay += (cy / n - a.y) * 1.6 + (vy / n - a.vy) * 1.8;
      }
      const nz = this.noise.noise3(a.x * 0.004, a.y * 0.004, f.t * 0.2) - 0.5;
      ax += Math.cos(nz * 6) * 40; ay += Math.sin(nz * 6) * 20;
      if (scare) {
        const dx = a.x - f.w / 2, dy = a.y - f.h / 2, d = Math.hypot(dx, dy) + 1;
        ax += (dx / d) * 4000 * (f.hit + 0.3); ay += (dy / d) * 2500 * (f.hit + 0.3);
      }
      if (this.shark) {
        const dx = a.x - this.shark.x, dy = a.y - this.shark.y, d = Math.hypot(dx, dy) + 1;
        if (d < 260) { ax += (dx / d) * 3000; ay += (dy / d) * 3000; }
      }
      // walls
      const m = 40;
      if (a.x < m) ax += 300; if (a.x > f.w - m) ax -= 300;
      if (a.y < m) ay += 300; if (a.y > f.h - m) ay -= 300;
      a.vx += ax * dt; a.vy += ay * dt * 0.7;
      const s = Math.hypot(a.vx, a.vy) + 1e-3, max = speed * (a.big ? 0.8 : 1.4);
      if (s > max) { a.vx *= max / s; a.vy *= max / s; }
      a.x += a.vx * dt; a.y += a.vy * dt;
      const gx = Math.floor(a.x / G.cw), gy = Math.floor(a.y / G.ch);
      const right = a.vx >= 0;
      const body = a.big ? (right ? '><((((°>' : '<°))))><') : (right ? '><>' : '<><');
      G.text(gx, gy, body, a.big ? 5 : a.k);
    }
    // bubbles + waves
    for (const b of this.bubbles) {
      b.y -= b.v * dt * (1 + f.energy);
      if (b.y < 0) { b.y = f.h; b.x = this.rnd() * f.w; }
      G.set(Math.floor(b.x / G.cw + Math.sin(b.y * 0.03) * 1.5), Math.floor(b.y / G.ch), b.v > 45 ? 'o' : '°', 1);
    }
    for (let x = 0; x < G.cols; x++) {
      const y = 1 + Math.round(Math.sin(x * 0.25 + f.mt * 2) * 0.8 + f.bass);
      G.set(x, y, '~', 2);
    }
    // a shark crosses during loud sections
    if (!this.shark && f.section.intensity > 0.55 && f.beat.onDownbeat && this.rnd() < 0.5) {
      const dir = this.rnd() < 0.5 ? 1 : -1;
      this.shark = { dir, x: dir > 0 ? -300 : f.w + 300, y: f.h * (0.3 + this.rnd() * 0.4) };
    }
    if (this.shark) {
      const s = this.shark;
      s.x += s.dir * (200 + f.energy * 260) * dt;
      s.y += Math.sin(f.t * 1.5) * 20 * dt;
      const art = s.dir > 0 ? SHARK_R : SHARK_L;
      const gx = Math.floor(s.x / G.cw), gy = Math.floor(s.y / G.ch);
      art.forEach((l, i) => { let j = 0; for (const c of l) { if (c !== ' ') G.set(gx + j, gy + i, c, 4); j++; } });
      if (s.x < -400 || s.x > f.w + 400) this.shark = null;
    }
    this.present(g);
  }
}

// A shanshui painting re-drawn in characters; the brush shows through on beats.
export class PaintAscii extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.small = document.createElement('canvas');
    this.sctx = this.small.getContext('2d', { willReadFrequently: true });
    this.dark = rnd() < (style.lightBg ? 0.2 : 0.75);
    this.cs = ' .:-=+*#%@';
    this.palette = new Map();
  }
  draw(g, f, painting) {
    const G = this.grid;
    if (!painting) { this.bg(g, f); return; }
    if (this.small.width !== G.cols) { this.small.width = G.cols; this.small.height = G.rows; }
    // cover-fit the 16:9 painting into this frame
    const pw = painting.width, ph = painting.height;
    const s = Math.max(f.w / pw, f.h / ph);
    const sw = f.w / s, sh = f.h / s;
    this.sctx.drawImage(painting, (pw - sw) / 2, (ph - sh) / 2, sw, sh, 0, 0, G.cols, G.rows);
    const d = this.sctx.getImageData(0, 0, G.cols, G.rows).data;
    const paper = this.dark ? this.style.bg : [238, 230, 218];
    g.fillStyle = rgbToCss(paper);
    g.fillRect(0, 0, f.w, f.h);
    // the painting itself bleeds through on the beat
    const show = clamp(0.1 + f.pulse * 0.45 + (1 - f.section.intensity) * 0.15);
    if (!this.dark) {
      g.globalAlpha = show;
      g.drawImage(painting, (pw - sw) / 2, (ph - sh) / 2, sw, sh, 0, 0, f.w, f.h);
      g.globalAlpha = 1;
    }
    G.clear();
    const colors = [null];
    const keyOf = new Map();
    for (let i = 0, n = G.cols * G.rows; i < n; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      const L = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
      const ink = clamp((0.93 - L) * 1.6);
      if (ink < 0.05) continue;
      const red = r > gg * 1.35 && r > b * 1.35 && r > 90;
      let rgb;
      if (this.dark) rgb = red ? this.style.colors[1] : mixRgb(this.style.colors[0], this.style.fg, ink);
      else rgb = red ? [200, 40, 30] : [Math.round(r * 0.6) & 0xf0, Math.round(gg * 0.6) & 0xf0, Math.round(b * 0.6) & 0xf0];
      const q = this.dark ? (red ? 'r' : Math.round(ink * 6)) : rgb.join(',');
      let k = keyOf.get(q);
      if (k === undefined) {
        if (colors.length >= 250) k = colors.length - 1;
        else { k = colors.length; colors.push(rgbToCss(rgb)); keyOf.set(q, k); }
      }
      G.chars[i] = rampChar(this.cs, ink);
      G.col[i] = k;
    }
    G.draw(g, colors);
  }
}

export const ASCII_SCENES = { asciiTunnel: AsciiTunnel, asciiShape: AsciiShape, asciiText: AsciiText, asciiSpectrum: AsciiSpectrum, fish: FishSchool, paintAscii: PaintAscii };
export { mulberry32 };

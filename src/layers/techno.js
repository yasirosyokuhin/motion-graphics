// Techno / motion-graphics scenes: beat rings + radial spectrum, perspective
// grids and spectral terrain, Swiss/Bauhaus block grids, and a HUD overlay.

import { clamp, easeOutCubic, easeInOutCubic, rgbToCss, mixRgb, isCJK } from '../util.js';
import { fontOf } from '../style.js';

const MONO = '"JetBrains Mono", ui-monospace, monospace';
const css = rgbToCss;

class Base {
  constructor(w, h, style, rnd) {
    this.style = style;
    this.rnd = rnd;
    this.w = w; this.h = h;
  }
  bg(g, f, a = 1) {
    g.fillStyle = css(this.style.bg, a);
    g.fillRect(0, 0, f.w, f.h);
  }
}

export class GeoPulse extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.rings = [];
    this.sides = [rnd.int(3, 6), rnd.int(3, 8), rnd.int(4, 9)];
    this.codes = Array.from({ length: 18 }, () => Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0').toUpperCase());
  }
  draw(g, f) {
    const S = this.style, [c1, c2, c3] = S.colors;
    this.bg(g, f);
    const cx = f.w / 2, cy = f.h / 2, m = Math.min(f.w, f.h);
    if (f.beat.onBeat) this.rings.push({ t: f.t, w: f.beat.onDownbeat ? 6 : 2, c: f.beat.onDownbeat ? c2 : c1 });
    this.rings = this.rings.filter((r) => f.t - r.t < 2.2);
    // flash disc on downbeats in loud parts
    if (f.section.intensity > 0.65 && f.beat.index % 4 === 0 && f.beat.phase < 0.15) {
      g.fillStyle = css(c1, 0.25 * (1 - f.beat.phase / 0.15));
      g.fillRect(0, 0, f.w, f.h);
    }
    for (const r of this.rings) {
      const a = (f.t - r.t) / 2.2;
      g.strokeStyle = css(r.c, 1 - a);
      g.lineWidth = r.w * (1 - a) + 0.5;
      g.beginPath();
      g.arc(cx, cy, m * 0.08 + easeOutCubic(a) * m * 0.9, 0, Math.PI * 2);
      g.stroke();
    }
    // crosshair with ticks
    g.strokeStyle = css(mixRgb(S.bg, S.fg, 0.25));
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, cy); g.lineTo(f.w, cy); g.moveTo(cx, 0); g.lineTo(cx, f.h);
    for (let x = cx % 40; x < f.w; x += 40) { g.moveTo(x, cy - 4); g.lineTo(x, cy + 4); }
    for (let y = cy % 40; y < f.h; y += 40) { g.moveTo(cx - 4, y); g.lineTo(cx + 4, y); }
    g.stroke();
    // radial spectrum
    const n = f.spectrum.length;
    const R0 = m * (0.2 + f.bass * 0.05);
    g.lineWidth = Math.max(2, (Math.PI * 2 * R0) / n / 2.2);
    g.lineCap = 'butt';
    for (let i = 0; i < n; i++) {
      const v = f.spectrum[i];
      const a = (i / n) * Math.PI * 2 + f.mt * 0.2;
      const len = v * m * 0.22;
      g.strokeStyle = css(i % 8 === 0 ? c3 : mixRgb(c1, c2, i / n));
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0);
      g.lineTo(cx + Math.cos(a) * (R0 + len), cy + Math.sin(a) * (R0 + len));
      g.stroke();
    }
    // nested rotating polygons
    this.sides.forEach((sides, k) => {
      const r = m * (0.17 - k * 0.04) * (1 + f.pulse * 0.12);
      const rot = (k % 2 ? -1 : 1) * (f.mt * (0.4 + k * 0.25)) + easeInOutCubic(f.beat.barPhase) * Math.PI / sides;
      g.strokeStyle = css(k === 1 ? c2 : S.fg);
      g.lineWidth = k === 0 ? 3 : 1.5;
      g.beginPath();
      for (let i = 0; i <= sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    });
    g.fillStyle = css(c3);
    g.beginPath();
    g.arc(cx, cy, m * 0.012 * (1 + f.pulse * 2), 0, Math.PI * 2);
    g.fill();
    // orbiters
    for (let i = 0; i < 8; i++) {
      const a = f.mt * (0.6 + i * 0.07) + i * 0.785;
      const r = m * (0.32 + (i % 3) * 0.05);
      const s = 4 + (i % 3) * 3 + f.pulse * 4;
      g.fillStyle = css(i % 2 ? c1 : c2);
      g.fillRect(cx + Math.cos(a) * r - s / 2, cy + Math.sin(a) * r * 0.9 - s / 2, s, s);
    }
    // side code stream
    g.font = `500 ${Math.round(m * 0.018)}px ${MONO}`;
    g.textBaseline = 'top';
    const lh = m * 0.026;
    const shift = f.beat.index % this.codes.length;
    for (let i = 0; i < this.codes.length; i++) {
      const code = this.codes[(i + shift) % this.codes.length];
      g.fillStyle = css(i === 0 ? c3 : mixRgb(S.bg, S.fg, 0.45));
      g.fillText(`0x${code}`, f.w - m * 0.17, f.h * 0.18 + i * lh);
    }
  }
}

export class GeoGrid extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    this.mode = style.key === 'vapor' || rnd() < 0.45 ? 'synth' : 'terrain';
    this.history = [];
  }
  draw(g, f) {
    const S = this.style, [c1, c2, c3] = S.colors;
    this.bg(g, f);
    if (this.mode === 'terrain') return this.terrain(g, f);
    const hz = f.h * 0.55;
    // sky gradient + striped sun
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, css(S.bg));
    sky.addColorStop(1, css(mixRgb(S.bg, c2, 0.35)));
    g.fillStyle = sky;
    g.fillRect(0, 0, f.w, hz);
    const sr = Math.min(f.w, f.h) * (0.22 + f.bass * 0.03);
    const sun = g.createLinearGradient(0, hz - sr * 1.6, 0, hz);
    sun.addColorStop(0, css(c3));
    sun.addColorStop(1, css(c2));
    g.save();
    g.beginPath();
    g.arc(f.w / 2, hz - sr * 0.35, sr, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = sun;
    g.fillRect(0, 0, f.w, hz);
    g.fillStyle = css(S.bg);
    for (let i = 0; i < 8; i++) {
      const y = hz - sr * 0.35 + sr * (0.05 + i * 0.12) + ((f.mt * 20) % (sr * 0.12));
      g.fillRect(0, y, f.w, 2 + i * 1.6);
    }
    g.restore();
    // mountains from the spectrum
    g.fillStyle = css(mixRgb(S.bg, c1, 0.25));
    g.beginPath();
    g.moveTo(0, hz);
    const n = f.spectrum.length;
    for (let i = 0; i <= n; i++) {
      const v = f.spectrum[Math.min(n - 1, Math.abs(Math.floor(n / 2) - i) * 2 % n)];
      g.lineTo((i / n) * f.w, hz - v * f.h * 0.18 - 6);
    }
    g.lineTo(f.w, hz);
    g.fill();
    // floor grid: one line per beat, so the floor moves in time
    g.fillStyle = css(S.bg);
    g.fillRect(0, hz, f.w, f.h - hz);
    g.strokeStyle = css(c1);
    g.lineWidth = 1.5;
    g.beginPath();
    const depthLines = 14;
    const scroll = f.beat.phase + (f.beat.index % 1);
    for (let i = 0; i < depthLines; i++) {
      const z = (i + 1 - scroll) / depthLines;
      const y = hz + (f.h - hz) * Math.pow(z, 2.2);
      g.moveTo(0, y); g.lineTo(f.w, y);
    }
    for (let i = -20; i <= 20; i++) {
      g.moveTo(f.w / 2 + i * 6, hz);
      g.lineTo(f.w / 2 + i * f.w * 0.12, f.h);
    }
    g.stroke();
    g.fillStyle = css(c1, 0.15 + f.pulse * 0.2);
    g.fillRect(0, hz - 1, f.w, 3);
  }
  terrain(g, f) {
    const S = this.style;
    this.history.unshift(Float32Array.from(f.spectrum));
    const rowsN = 42;
    if (this.history.length > rowsN) this.history.length = rowsN;
    const top = f.h * 0.1, bottom = f.h * 0.95;
    const left = f.w * 0.06, right = f.w * 0.94;
    for (let r = this.history.length - 1; r >= 0; r--) {
      const spec = this.history[r];
      const y0 = top + ((rowsN - r) / rowsN) * (bottom - top);
      g.beginPath();
      const n = 96;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const centre = Math.exp(-Math.pow((u - 0.5) / 0.24, 2));
        const v = spec[Math.floor(Math.abs(u - 0.5) * 2 * (spec.length - 1))] || 0;
        const y = y0 - v * centre * f.h * 0.22 - centre * (Math.sin(u * 40 + r) * 2);
        const x = left + u * (right - left);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.fillStyle = css(S.bg);
      g.lineTo(right, y0 + 50); g.lineTo(left, y0 + 50); g.closePath();
      g.fill();
      g.strokeStyle = r === 0 ? css(S.colors[1]) : css(mixRgb(S.bg, S.fg, 1 - r / rowsN * 0.7));
      g.lineWidth = r === 0 ? 2.5 : 1.2;
      g.stroke();
    }
  }
}

// Swiss / Bauhaus grid of shapes that flip, rotate and recolour on the beat.
export class GeoBlocks extends Base {
  constructor(w, h, style, rnd) {
    super(w, h, style, rnd);
    const portrait = h > w;
    this.cols = portrait ? 3 : rnd.pick([4, 5, 6]);
    this.rows = portrait ? 5 : 3;
    this.cells = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.cells.push(this.newCell());
    this.lastBeat = -1;
  }
  newCell() {
    const r = this.rnd;
    return { shape: r.pick(['circle', 'half', 'quarter', 'tri', 'square', 'stripes', 'ring', 'letter']), c: r.int(0, 3), b: r.int(0, 3), rot: r.int(0, 3), from: 0, t0: -10 };
  }
  draw(g, f) {
    const S = this.style;
    const pal = [S.bg, ...S.colors, S.fg];
    this.bg(g, f);
    if (f.beat.onBeat && f.beat.index !== this.lastBeat) {
      this.lastBeat = f.beat.index;
      const n = f.beat.onDownbeat ? Math.ceil(this.cells.length * 0.5) : Math.ceil(this.cells.length * (0.1 + f.energy * 0.25));
      for (let i = 0; i < n; i++) {
        const c = this.cells[Math.floor(this.rnd() * this.cells.length)];
        if (this.rnd() < 0.55) { c.from = c.rot; c.rot += 1; c.t0 = f.t; }
        else Object.assign(c, this.newCell(), { t0: f.t, from: c.rot });
      }
    }
    const cw = f.w / this.cols, ch = f.h / this.rows;
    const word = (f.keyword || f.title || 'MV').toUpperCase();
    const letters = [...word.replace(/\s+/g, '')];
    this.cells.forEach((c, i) => {
      const x = (i % this.cols) * cw, y = Math.floor(i / this.cols) * ch;
      const k = clamp((f.t - c.t0) / 0.28);
      const rot = (c.from + (c.rot - c.from) * easeOutCubic(k)) * Math.PI / 2;
      const fg = pal[1 + c.c], bgc = pal[c.b === c.c ? 0 : c.b === 0 ? 0 : 1 + ((c.b + 1) % 4)];
      g.fillStyle = css(bgc);
      g.fillRect(x, y, cw + 1, ch + 1);
      g.save();
      g.beginPath(); g.rect(x, y, cw, ch); g.clip();
      g.translate(x + cw / 2, y + ch / 2);
      g.rotate(rot);
      const s = Math.min(cw, ch) * 0.5 * (k < 1 ? 0.7 + 0.3 * easeOutCubic(k) : 1);
      g.fillStyle = css(fg);
      g.strokeStyle = css(fg);
      switch (c.shape) {
        case 'circle': g.beginPath(); g.arc(0, 0, s * 0.85, 0, Math.PI * 2); g.fill(); break;
        case 'half': g.beginPath(); g.arc(0, s, s * 1.6, Math.PI, 0); g.fill(); break;
        case 'quarter': g.beginPath(); g.moveTo(-s, -s); g.arc(-s, -s, s * 2, 0, Math.PI / 2); g.fill(); break;
        case 'tri': g.beginPath(); g.moveTo(-s, s); g.lineTo(s, s); g.lineTo(-s, -s); g.fill(); break;
        case 'square': g.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4); break;
        case 'stripes': for (let j = -4; j <= 4; j += 2) g.fillRect(-s * 1.2, j * s * 0.13, s * 2.4, s * 0.13); break;
        case 'ring': g.lineWidth = s * 0.25; g.beginPath(); g.arc(0, 0, s * 0.7 * (1 + f.pulse * 0.15), 0, Math.PI * 2); g.stroke(); break;
        default: {
          const l = letters.length ? letters[i % letters.length] : '●';
          g.rotate(-rot);
          g.font = fontOf(isCJK(l) ? S.typeface.jp : S.typeface.en, s * 1.6);
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(l, 0, s * 0.08);
        }
      }
      g.restore();
    });
    // hairline grid
    g.strokeStyle = css(S.fg, 0.35);
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < this.cols; i++) { g.moveTo(i * cw, 0); g.lineTo(i * cw, f.h); }
    for (let j = 1; j < this.rows; j++) { g.moveTo(0, j * ch); g.lineTo(f.w, j * ch); }
    g.stroke();
  }
}

// Thin tech overlay: frame corners, timecode, bpm, REC dot, level meter.
export function drawHUD(g, f, style, amount) {
  if (amount <= 0) return;
  const m = Math.min(f.w, f.h);
  const pad = m * 0.035, L = m * 0.05;
  g.save();
  g.globalAlpha = clamp(amount);
  g.strokeStyle = css(style.fg, 0.8);
  g.lineWidth = 1.5;
  g.beginPath();
  for (const [x, y, dx, dy] of [[pad, pad, 1, 1], [f.w - pad, pad, -1, 1], [pad, f.h - pad, 1, -1], [f.w - pad, f.h - pad, -1, -1]]) {
    g.moveTo(x, y + dy * L); g.lineTo(x, y); g.lineTo(x + dx * L, y);
  }
  g.stroke();
  g.font = `500 ${Math.round(m * 0.017)}px ${MONO}`;
  g.textBaseline = 'top';
  g.fillStyle = css(style.fg, 0.85);
  const t = f.t;
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}:${String(Math.floor((t % 1) * 30)).padStart(2, '0')}`;
  g.fillText(tc, pad + 8, pad + 8);
  g.textAlign = 'right';
  g.fillText(`${f.bpm.toFixed(0)} BPM  ${String(f.beat.bar + 1).padStart(3, '0')}:${(f.beat.index % 4) + 1}`, f.w - pad - 8, pad + 8);
  g.fillText(f.styleLabel, f.w - pad - 8, f.h - pad - 8 - m * 0.02);
  g.textAlign = 'left';
  if (Math.floor(t * 2) % 2 === 0) {
    g.fillStyle = css(style.colors[1]);
    g.beginPath(); g.arc(pad + 14, f.h - pad - 14 - m * 0.006, m * 0.008, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = css(style.fg, 0.85);
  g.fillText('REC', pad + 26, f.h - pad - 14 - m * 0.016);
  // level meter
  const bw = m * 0.18, bh = 4;
  g.fillStyle = css(style.fg, 0.2);
  g.fillRect(f.w / 2 - bw / 2, f.h - pad - 10, bw, bh);
  g.fillStyle = css(style.colors[0]);
  g.fillRect(f.w / 2 - bw / 2, f.h - pad - 10, bw * clamp(f.energy * 0.6 + f.bass * 0.5), bh);
  g.restore();
}

export const TECHNO_SCENES = { geoPulse: GeoPulse, geoGrid: GeoGrid, geoBlocks: GeoBlocks };

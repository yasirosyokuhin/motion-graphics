// Kinetic lyric typography. Each line gets a style chosen from the MV style
// (deterministically per line) and animates over its own lifetime.

import { clamp, easeOutCubic, easeOutBack, rgbToCss, hashString, mulberry32, wrapText, isCJK } from '../util.js';

const css = rgbToCss;
const MONO = '"JetBrains Mono", "DotGothic16", monospace';

function fitFont(g, text, family, weight, maxW, maxH, start) {
  let size = start;
  let lines = [text];
  for (let i = 0; i < 14; i++) {
    g.font = `${weight} ${size}px ${family}`;
    lines = wrapText(g, text, maxW);
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    if (w <= maxW && lines.length * size * 1.15 <= maxH) break;
    size *= 0.88;
  }
  return { size, lines };
}

export class TypeLayer {
  constructor(style) {
    this.style = style;
    this.layoutCache = new Map();
  }

  styleFor(lyric, scene) {
    const S = this.style;
    const rnd = mulberry32(hashString(lyric.text + lyric.index) ^ S.seed);
    let kind = rnd.pick(S.type);
    if (kind === 'vertical' && !isCJK(lyric.text)) kind = 'typewriter';
    // big lettering scenes already shout the line; keep the overlay quiet there
    if (scene === 'asciiText' || scene === 'geoBlocks') kind = 'typewriter';
    return { kind, rnd };
  }

  draw(g, f) {
    const L = f.lyric;
    if (!L) return;
    const { kind, rnd } = this.styleFor(L, f.sceneKind);
    const out = clamp((L.end - f.t) / 0.25);
    g.save();
    g.globalAlpha = out;
    // a soft halo in the opposite tone keeps lyrics readable over paper-white paintings
    const fg = this.style.fg;
    const light = (fg[0] + fg[1] + fg[2]) / 3 > 128;
    g.shadowColor = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)';
    g.shadowBlur = Math.min(f.w, f.h) * 0.02;
    this[kind](g, f, L, rnd);
    g.restore();
  }

  family(text, accent = false) {
    const S = this.style;
    if (isCJK(text)) return S.font.display.includes('Bebas') ? '"Noto Sans JP", sans-serif' : S.font.display;
    return accent ? S.font.accent : S.font.display;
  }

  // Huge centred line that punches on every beat, karaoke-filled.
  impact(g, f, L) {
    const S = this.style;
    const fam = this.family(L.text);
    const { size, lines } = fitFont(g, L.text, fam, 900, f.w * 0.86, f.h * 0.6, f.h * 0.2);
    const k = easeOutBack(clamp(L.age / 0.18));
    const punch = 1 + f.pulse * 0.06;
    g.translate(f.w / 2 + (f.hit > 0.5 ? (rnd2(f.t) - 0.5) * 14 * f.hit : 0), f.h / 2);
    g.scale(k * punch, k * punch);
    g.font = `900 ${size}px ${fam}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = size * 1.08;
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lh;
      g.fillStyle = css(S.colors[1], 0.9);
      g.fillText(line, 6, y + 6);
      g.fillStyle = css(S.fg);
      g.fillText(line, 0, y);
    });
    // karaoke sweep: the sung part of the line turns accent-coloured
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    g.beginPath();
    g.rect(-w / 2, -lh * lines.length, w * clamp(L.progress * 1.1), lh * lines.length * 2);
    g.clip();
    g.fillStyle = css(S.colors[0]);
    lines.forEach((line, i) => g.fillText(line, 0, (i - (lines.length - 1) / 2) * lh));
  }

  // Monospace line typed out with a block cursor in a lower-third box.
  typewriter(g, f, L) {
    const S = this.style;
    const fam = isCJK(L.text) ? '"DotGothic16", "Noto Sans JP", monospace' : MONO;
    const { size, lines } = fitFont(g, L.text, fam, 700, f.w * 0.8, f.h * 0.22, Math.min(f.w, f.h) * 0.06);
    const chars = [...L.text];
    const shown = Math.floor(clamp(L.age / Math.max(0.4, (L.end - L.start) * 0.45)) * chars.length);
    let left = shown;
    g.font = `700 ${size}px ${fam}`;
    g.textBaseline = 'top';
    const lh = size * 1.3;
    const x0 = f.w * 0.08, y0 = f.h * 0.86 - lines.length * lh;
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    g.fillStyle = css(S.bg, 0.72);
    g.fillRect(x0 - size * 0.4, y0 - size * 0.35, w + size * 1.4, lines.length * lh + size * 0.5);
    g.fillStyle = css(S.colors[0]);
    g.fillRect(x0 - size * 0.4, y0 - size * 0.35, size * 0.12, lines.length * lh + size * 0.5);
    let cx = x0, cy = y0;
    for (let i = 0; i < lines.length; i++) {
      const lc = [...lines[i]];
      const vis = lc.slice(0, Math.max(0, left)).join('');
      left -= lc.length;
      g.fillStyle = css(S.fg);
      g.fillText(vis, x0, y0 + i * lh);
      if (left <= 0 || i === lines.length - 1) {
        cx = x0 + g.measureText(vis).width; cy = y0 + i * lh;
        break;
      }
    }
    if (Math.floor(f.t * 3) % 2 === 0 || shown < chars.length) {
      g.fillStyle = css(S.colors[2]);
      g.fillRect(cx + 3, cy, size * 0.55, size);
    }
  }

  // Characters fly in one by one from scattered positions.
  split(g, f, L, rnd) {
    const S = this.style;
    const fam = this.family(L.text);
    const { size, lines } = fitFont(g, L.text, fam, 900, f.w * 0.84, f.h * 0.5, f.h * 0.14);
    g.font = `900 ${size}px ${fam}`;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const lh = size * 1.1;
    let idx = 0;
    const total = [...L.text].length;
    lines.forEach((line, li) => {
      const w = g.measureText(line).width;
      let x = f.w / 2 - w / 2;
      const y = f.h / 2 + (li - (lines.length - 1) / 2) * lh;
      for (const c of line) {
        const cw = g.measureText(c).width;
        const delay = (idx / Math.max(1, total)) * 0.5;
        const k = easeOutCubic(clamp((L.age - delay) / 0.45));
        const sx = (rnd() - 0.5) * f.w * 0.8, sy = (rnd() - 0.5) * f.h * 0.8, sr = (rnd() - 0.5) * 3;
        g.save();
        g.translate(x + cw / 2 + sx * (1 - k), y + sy * (1 - k) - (f.beat.index % 2 === idx % 2 ? f.pulse * size * 0.08 : 0));
        g.rotate(sr * (1 - k));
        g.globalAlpha *= k;
        g.fillStyle = css(idx % 5 === 0 ? S.colors[1] : S.fg);
        g.fillText(c, -cw / 2, 0);
        g.restore();
        x += cw;
        idx++;
      }
    });
  }

  // Outlined echoes of the line scrolling behind a solid one.
  stack(g, f, L) {
    const S = this.style;
    const fam = this.family(L.text);
    const { size, lines } = fitFont(g, L.text, fam, 900, f.w * 0.9, f.h * 0.2, f.h * 0.16);
    const line = lines.join(' ');
    g.font = `900 ${size}px ${fam}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = 7, lh = size * 0.95;
    const scroll = (f.mt * 40) % lh;
    for (let i = -n; i <= n; i++) {
      const y = f.h / 2 + i * lh + (i === 0 ? 0 : scroll);
      if (i === 0) continue;
      g.lineWidth = 1.5;
      g.strokeStyle = css(i % 2 ? S.colors[0] : S.fg, 0.55);
      g.strokeText(line, f.w / 2, y);
    }
    const k = easeOutCubic(clamp(L.age / 0.2));
    g.fillStyle = css(S.colors[1]);
    g.fillRect(0, f.h / 2 - lh * 0.55 * k, f.w, lh * 1.1 * k);
    g.fillStyle = css(S.bg);
    g.fillText(line, f.w / 2, f.h / 2);
  }

  // Sliced, RGB-split text that tears on hits.
  glitch(g, f, L, rnd) {
    const S = this.style;
    const fam = this.family(L.text, true);
    const { size, lines } = fitFont(g, L.text, fam, 900, f.w * 0.84, f.h * 0.5, f.h * 0.16);
    g.font = `900 ${size}px ${fam}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = size * 1.1;
    const tear = 0.2 + f.hit * 1.5 + (L.age < 0.15 ? 1 : 0);
    const slices = 9;
    lines.forEach((line, li) => {
      const y0 = f.h / 2 + (li - (lines.length - 1) / 2) * lh;
      for (let s = 0; s < slices; s++) {
        const top = y0 - size / 2 + (s * size) / slices;
        const off = (rnd2(s + Math.floor(f.t * 20) + li * 13) - 0.5) * size * 0.5 * tear;
        g.save();
        g.beginPath(); g.rect(0, top, f.w, size / slices + 1); g.clip();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = css(S.colors[0], 0.85); g.fillText(line, f.w / 2 + off - 4 * tear, y0);
        g.fillStyle = css(S.colors[1], 0.85); g.fillText(line, f.w / 2 + off + 4 * tear, y0);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = css(S.fg); g.fillText(line, f.w / 2 + off, y0);
        g.restore();
      }
    });
  }

  // Japanese vertical setting, right to left, characters fading down.
  vertical(g, f, L) {
    const S = this.style;
    const fam = S.font.display.includes('Mincho') ? S.font.display : '"Shippori Mincho", "Noto Sans JP", serif';
    const chars = [...L.text.replace(/\s+/g, '　')];
    const perCol = Math.max(6, Math.min(14, Math.ceil(chars.length / 2)));
    const ncols = Math.ceil(chars.length / perCol);
    const size = Math.min((f.h * 0.78) / perCol, f.w * 0.09);
    g.font = `800 ${size}px ${fam}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const x0 = f.w * 0.82;
    chars.forEach((c, i) => {
      const col = Math.floor(i / perCol), row = i % perCol;
      const k = easeOutCubic(clamp((L.age - i * 0.05) / 0.4));
      const x = x0 - col * size * 1.35;
      const y = f.h * 0.12 + row * size * 1.05 + size / 2 - (1 - k) * size * 0.6;
      g.globalAlpha = k * clamp((L.end - f.t) / 0.25);
      g.fillStyle = css(S.colors[1], 0.5);
      g.fillText(c, x + 3, y + 3);
      g.fillStyle = css(S.fg);
      g.fillText(c, x, y);
    });
    if (ncols) {
      g.globalAlpha = 1;
      g.fillStyle = css(S.colors[1]);
      g.fillRect(x0 + size * 0.75, f.h * 0.12, 3, f.h * 0.76 * clamp(L.progress));
    }
  }
}

function rnd2(x) {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

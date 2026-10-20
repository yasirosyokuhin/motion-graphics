// Kinetic lyric typography. Each line gets a style chosen from the MV style
// (deterministically per line) and animates over its own lifetime. Faces come
// from the style's typeface set (style.js TYPEFACES).

import { clamp, easeOutCubic, easeOutBack, rgbToCss, hashString, mulberry32, wrapText, isCJK } from '../util.js';
import { fontOf } from '../style.js';

const css = rgbToCss;
// glyphs a character flickers through before it resolves (the "decode" style)
const SCRAMBLE = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ01#%&@$*+=<>/\\|';

// Two lines split near the middle at a natural break: after a Japanese particle,
// punctuation or a space (never inside a word like 探し|てる).
function balanced(text) {
  const chars = [...text];
  const mid = chars.length / 2;
  let best = -1, bd = 1e9;
  chars.forEach((c, i) => {
    if (i === 0 || i >= chars.length - 1) return;
    // a particle followed by kanji/katakana ends a phrase (中で|君を, 君を|探して)
    const ok = /[\s、。,!?！？]/.test(c) || (/[をがはにでのともへ]/.test(c) && !/[ぁ-ん]/.test(chars[i + 1] || ''));
    if (!ok) return;
    const d = Math.abs(i + 1 - mid);
    if (d < bd) { bd = d; best = i + 1; }
  });
  if (best < 0 || bd > chars.length * 0.3) return null;
  return [chars.slice(0, best).join('').trim(), chars.slice(best).join('').trim()];
}

function fit(g, text, face, maxW, maxH, start) {
  const lh = 1.18;
  g.font = fontOf(face, start);
  const w1 = g.measureText(text).width;
  // keep it on one line if that costs at most ~40% of the size
  let size = Math.min(start, (start * maxW) / w1, maxH / lh);
  if (size >= start * 0.6) { g.font = fontOf(face, size); return { size, lines: [text] }; }
  let lines = balanced(text);
  if (lines) {
    const wMax = Math.max(...lines.map((l) => g.measureText(l).width));
    size = Math.min(start, (start * maxW) / wMax, maxH / (2 * lh));
    if (size >= start * 0.45) { g.font = fontOf(face, size); return { size, lines }; }
  }
  size = start;
  for (let i = 0; i < 16; i++) {
    g.font = fontOf(face, size);
    lines = wrapText(g, text, maxW);
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    if (w <= maxW && lines.length * size * lh <= maxH) break;
    size *= 0.9;
  }
  g.font = fontOf(face, size);
  return { size, lines };
}

const noise = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class TypeLayer {
  constructor(style) {
    this.style = style;
    this.compact = false;
  }

  face(text) {
    const T = this.style.typeface;
    return isCJK(text) ? T.jp : T.en;
  }

  styleFor(lyric, scene) {
    const S = this.style;
    const rnd = mulberry32(hashString(lyric.text + lyric.index) ^ S.seed);
    let kind = rnd.pick(S.type);
    if (kind === 'vertical' && !isCJK(lyric.text)) kind = 'decode';
    // scenes that already shout the line (or show off the art) get the quiet lower third
    if (scene === 'asciiText' || scene === 'geoBlocks' || this.compact) kind = 'decode';
    return { kind, rnd };
  }

  draw(g, f) {
    const L = f.lyric;
    if (!L) return;
    const { kind, rnd } = this.styleFor(L, f.sceneKind);
    g.save();
    g.globalAlpha = kind === 'decode' ? 1 : clamp((L.end - f.t) / 0.25);
    const fg = this.style.fg;
    const light = (fg[0] + fg[1] + fg[2]) / 3 > 128;
    g.shadowColor = light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
    g.shadowBlur = Math.min(f.w, f.h) * 0.018;
    this[kind](g, f, L, rnd);
    g.restore();
  }

  // Huge centred line that punches on every beat; the sung part fills with the accent.
  impact(g, f, L) {
    const S = this.style, face = this.face(L.text);
    const { size, lines } = fit(g, L.text, face, f.w * 0.86, f.h * 0.6, f.h * 0.2);
    const k = easeOutBack(clamp(L.age / 0.18));
    const punch = 1 + f.pulse * 0.05;
    g.translate(f.w / 2 + (f.hit > 0.5 ? (noise(f.t) - 0.5) * 14 * f.hit : 0), f.h / 2);
    g.scale(k * punch, k * punch);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lh = size * 1.12;
    const ys = lines.map((_, i) => (i - (lines.length - 1) / 2) * lh);
    lines.forEach((line, i) => { g.fillStyle = css(S.fg); g.fillText(line, 0, ys[i]); });
    g.shadowBlur = 0;
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    g.beginPath();
    g.rect(-w / 2, -lh * lines.length, w * clamp(L.progress * 1.1), lh * lines.length * 2);
    g.clip();
    g.fillStyle = css(S.colors[0]);
    lines.forEach((line, i) => g.fillText(line, 0, ys[i]));
  }

  // Lower third: each character flickers through random glyphs, then locks in;
  // at the end of the line it dissolves back into noise.
  decode(g, f, L) {
    const S = this.style, face = this.face(L.text);
    const m = Math.min(f.w, f.h);
    const { size, lines } = fit(g, L.text, face, f.w * 0.8, f.h * 0.2, m * 0.07);
    const total = [...L.text].length;
    const dur = Math.max(0.4, Math.min(1.2, (L.end - L.start) * 0.4));
    const outT = clamp((f.t - (L.end - 0.3)) / 0.3);
    const x0 = f.w * 0.07;
    const lh = size * 1.22;
    const y0 = f.h * 0.86 - (lines.length - 1) * lh;
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    // tiny label above: line number + timecode, like a subtitle slate
    g.font = fontOf(S.typeface.mono, Math.max(10, m * 0.016));
    g.fillStyle = css(S.colors[0]);
    const tc = `${String(Math.floor(L.start / 60)).padStart(2, '0')}:${(L.start % 60).toFixed(2).padStart(5, '0')}`;
    g.fillText(`LYRIC ${String(L.index + 1).padStart(2, '0')}  ${tc}`, x0, y0 - size * 1.05);
    g.font = fontOf(face, size);
    const tick = Math.floor(f.t * 20);
    let idx = 0;
    lines.forEach((line, li) => {
      let x = x0;
      const y = y0 + li * lh;
      for (const ch of line) {
        const at = (idx / Math.max(1, total)) * dur;
        const age = L.age - at;
        const gone = outT > 0 && noise(idx * 3.1) < outT;
        if (age > 0 && !gone) {
          const settled = age > 0.16 && outT === 0;
          const c = settled || ch === ' ' ? ch : SCRAMBLE[Math.floor(noise(idx * 7.3 + tick) * SCRAMBLE.length)];
          g.fillStyle = settled ? css(S.fg) : css(S.colors[1]);
          g.fillText(c, x, y);
        }
        x += g.measureText(ch).width;
        idx++;
      }
    });
    // progress hairline under the line
    const w = Math.max(...lines.map((l) => g.measureText(l).width));
    g.shadowBlur = 0;
    g.fillStyle = css(S.fg, 0.25);
    g.fillRect(x0, y0 + (lines.length - 1) * lh + size * 0.3, w, 2);
    g.fillStyle = css(S.colors[0]);
    g.fillRect(x0, y0 + (lines.length - 1) * lh + size * 0.3, w * clamp(L.progress), 2);
  }

  // Characters fly in one by one from scattered positions.
  split(g, f, L, rnd) {
    const S = this.style, face = this.face(L.text);
    const { size, lines } = fit(g, L.text, face, f.w * 0.84, f.h * 0.5, f.h * 0.14);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const lh = size * 1.12;
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
        g.translate(x + cw / 2 + sx * (1 - k), y + sy * (1 - k) - (f.beat.index % 2 === idx % 2 ? f.pulse * size * 0.06 : 0));
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

  // Outlined echoes of the line scrolling behind a solid band.
  stack(g, f, L) {
    const S = this.style, face = this.face(L.text);
    const { size, lines } = fit(g, L.text, face, f.w * 0.9, f.h * 0.2, f.h * 0.16);
    const line = lines.join(' ');
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = 7, lh = size * 1.0;
    const scroll = (f.mt * 40) % lh;
    g.shadowBlur = 0;
    for (let i = -n; i <= n; i++) {
      if (i === 0) continue;
      g.lineWidth = 1.5;
      g.strokeStyle = css(i % 2 ? S.colors[0] : S.fg, 0.5);
      g.strokeText(line, f.w / 2, f.h / 2 + i * lh + scroll);
    }
    const k = easeOutCubic(clamp(L.age / 0.2));
    g.fillStyle = css(S.colors[1]);
    g.fillRect(0, f.h / 2 - lh * 0.6 * k, f.w, lh * 1.2 * k);
    g.fillStyle = css(S.bg);
    g.fillText(line, f.w / 2, f.h / 2);
  }

  // Sliced, RGB-split text that tears on hits.
  glitch(g, f, L) {
    const S = this.style, face = this.face(L.text);
    const { size, lines } = fit(g, L.text, face, f.w * 0.84, f.h * 0.5, f.h * 0.16);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowBlur = 0;
    const lh = size * 1.15;
    const tear = 0.15 + f.hit * 1.4 + (L.age < 0.15 ? 1 : 0);
    const slices = 9;
    lines.forEach((line, li) => {
      const y0 = f.h / 2 + (li - (lines.length - 1) / 2) * lh;
      for (let s = 0; s < slices; s++) {
        const top = y0 - size / 2 + (s * size) / slices;
        const off = (noise(s + Math.floor(f.t * 20) + li * 13) - 0.5) * size * 0.5 * tear;
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

  // Japanese vertical setting, right to left, characters settling in from above.
  vertical(g, f, L) {
    const S = this.style;
    const chars = [...L.text.replace(/\s+/g, '　')];
    const perCol = Math.max(6, Math.min(14, Math.ceil(chars.length / 2)));
    const size = Math.min((f.h * 0.78) / perCol, f.w * 0.09);
    g.font = fontOf(S.typeface.vert, size);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const x0 = f.w * 0.82;
    chars.forEach((c, i) => {
      const col = Math.floor(i / perCol), row = i % perCol;
      const k = easeOutCubic(clamp((L.age - i * 0.05) / 0.4));
      const x = x0 - col * size * 1.35;
      const y = f.h * 0.12 + row * size * 1.05 + size / 2 - (1 - k) * size * 0.6;
      g.globalAlpha = k * clamp((L.end - f.t) / 0.25);
      g.fillStyle = css(S.fg);
      g.fillText(c, x, y);
    });
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.fillStyle = css(S.colors[1]);
    g.fillRect(x0 + size * 0.75, f.h * 0.12, 2, f.h * 0.76 * clamp(L.progress));
  }
}

// ASCII art pieces from ascii-magic-art (vendor/ascii-magic-art), played
// full-screen on the music clock and recoloured into the MV's palette.

import { paint, frameFor, cellAspect, GlyphAtlas } from '../../vendor/ascii-magic-art/runtime/canvas.js';
import { hexToRgb, luminance, mixRgb, clamp } from '../util.js';
import { loadPiece } from '../piece-source.js';
const toHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');

function saturation([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx ? (mx - mn) / mx : 0;
}

// Maps a piece's palette into the style: 'original' keeps it, 'duotone' runs
// brightness through the style gradient, 'mono' goes ink-only with accents.
function remapPalette(pal, mode, style) {
  if (!pal || mode === 'original') return pal;
  const out = {};
  const { bg, fg, colors, lightBg } = style;
  const stops = lightBg
    ? [mixRgb(bg, colors[1], 0.6), colors[1], colors[0], fg]
    : [mixRgb(bg, colors[0], 0.6), colors[0], colors[1], fg];
  for (const [k, hex] of Object.entries(pal)) {
    const rgb = hexToRgb(hex);
    // lift mid-tones: pieces are drawn for dark screens, and duotone darkens them further
    const L = clamp(Math.pow(luminance(rgb), 0.6) * 1.1);
    if (mode === 'mono') {
      const accent = saturation(rgb) > 0.65 && rgb[0] > rgb[2] * 1.4;
      out[k] = toHex(accent ? colors[1] : mixRgb(lightBg ? fg : mixRgb(bg, fg, 0.18), lightBg ? mixRgb(bg, fg, 0.2) : fg, lightBg ? 1 - L : L));
      continue;
    }
    const u = (lightBg ? 1 - L : L) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(u));
    out[k] = toHex(mixRgb(stops[i], stops[i + 1], u - i));
  }
  return out;
}

export class PieceLayer {
  constructor() {
    this.cache = new Map();
    this.atlas = new GlyphAtlas();
    this.remapCache = new WeakMap();
  }

  async load(slug) {
    if (this.cache.has(slug)) return this.cache.get(slug);
    const mod = await loadPiece(slug);
    const entry = { meta: mod.meta, draw: mod.default() };
    this.cache.set(slug, entry);
    return entry;
  }

  palette(pal, mode, style) {
    if (!pal) return pal;
    let byMode = this.remapCache.get(pal);
    if (!byMode) this.remapCache.set(pal, (byMode = {}));
    const key = mode + style.seed;
    if (!byMode[key]) byMode[key] = remapPalette(pal, mode, style);
    return byMode[key];
  }

  // opts: { slug, t, look, colorMode, zoom, style }
  draw(g, w, h, opts) {
    const p = this.cache.get(opts.slug);
    if (!p) return false;
    const { meta } = p;
    const style = opts.style;
    const raw = p.draw(opts.t);
    const look = { look: opts.look === 'original' ? undefined : opts.look };
    if (meta.cell === 'square') look.lift = false;
    if (meta.dots) Object.assign(look, meta.dots, { look: opts.look === 'original' ? undefined : opts.look });
    const basePal = raw.palette || meta.palette;
    const { frame, mode } = frameFor(raw, basePal, meta, look);
    const pal = this.palette(frame.palette || basePal, opts.colorMode, style);
    const f = frame.palette ? { ...frame, palette: pal } : frame;
    const aspect = cellAspect(meta);
    const sx = w / meta.cols, sy = h / (meta.rows * aspect);
    // Cell size stays fixed per piece (the glyph atlas is keyed on it); zoom goes through the transform.
    const cw = Math.round(Math.max(sx, sy) * 4) / 4;
    const ch = cw * aspect;
    const x = (w - meta.cols * cw) / 2;
    const y = (h - meta.rows * ch) / 2;
    const ink = toHex(style.fg);
    g.save();
    g.translate(w / 2 + (opts.dx || 0), h / 2 + (opts.dy || 0));
    g.scale(opts.zoom || 1, opts.zoom || 1);
    g.translate(-w / 2, -h / 2);
    paint(g, f, pal, { ...look, x, y, cw, ch, ink, mode, atlas: this.atlas, dpr: 1, invert: style.lightBg && mode !== 'text', mono: false });
    g.restore();
    return true;
  }
}

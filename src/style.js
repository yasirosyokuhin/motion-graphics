// Genre / mood presets and automatic style selection.
// Any song gets a style: audio features + lyric moods score every preset,
// then a seeded variation picks palette, charset and scene mix.

import { mulberry32, hexToRgb } from './util.js';

export const CHARSETS = {
  classic: ' .`:-=+*cs#%@',
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ·░▒▓█',
  katakana: ' ･ｰｼﾂｿﾝﾐﾊﾒﾖﾗﾘﾀﾁﾃﾄﾅﾆﾇﾈﾉ日ﾎﾏﾑﾓﾔﾕ',
  binary: ' .:01',
  symbols: ' .·+×※◇◆□■●',
  kanji: ' 、一二人口日月田目夢愛光闇',
  braille: ' ⠁⠃⠇⠏⠟⠿⡿⣿',
};

const FONT = {
  gothic: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", sans-serif',
  mincho: '"Shippori Mincho", "Hiragino Mincho ProN", serif',
  pixel: '"DotGothic16", "JetBrains Mono", monospace',
  condensed: '"Bebas Neue", "Noto Sans JP", sans-serif',
  mono: '"JetBrains Mono", "DotGothic16", monospace',
};

// palette: [bg, primary, secondary, accent, fg]
export const PRESETS = {
  cyber: {
    label: 'CYBER / ELECTRONIC',
    palettes: [
      ['#05010d', '#00f0ff', '#ff2bd6', '#f8f32b', '#e8fbff'],
      ['#000000', '#39ff14', '#00b3ff', '#ff3864', '#eaffea'],
      ['#07020f', '#7b2cff', '#00ffd5', '#ff006e', '#ffffff'],
    ],
    charsets: ['katakana', 'binary', 'dense', 'braille'],
    font: { display: FONT.gothic, accent: FONT.pixel },
    scenes: { asciiTunnel: 3, asciiShape: 2.5, asciiText: 3, asciiSpectrum: 2, geoPulse: 2, geoGrid: 1.5, geoBlocks: 1, paint: 0.6, ink: 1 },
    fx: { rgb: 1.0, glitch: 1.0, grain: 0.07, scan: 0.45, feedback: 0.55, bloom: 0.9, strobe: 0.6, vignette: 0.6 },
    type: ['glitch', 'impact', 'split', 'typewriter'],
    cutBars: 4,
  },
  rock: {
    label: 'ROCK / METAL / PUNK',
    palettes: [
      ['#0a0a0a', '#ff1e1e', '#ffffff', '#ffcc00', '#f4f4f4'],
      ['#000000', '#e6e6e6', '#b30000', '#ff6a00', '#ffffff'],
    ],
    charsets: ['blocks', 'dense', 'classic', 'kanji'],
    font: { display: FONT.condensed, accent: FONT.gothic },
    scenes: { asciiTunnel: 2, asciiShape: 2, asciiText: 3, asciiSpectrum: 1.5, geoPulse: 1.5, geoGrid: 0.5, geoBlocks: 2.5, paint: 1.2, ink: 1.2 },
    fx: { rgb: 0.8, glitch: 1.1, grain: 0.14, scan: 0.25, feedback: 0.35, bloom: 0.5, strobe: 1.0, vignette: 0.8 },
    type: ['impact', 'stack', 'glitch', 'split'],
    cutBars: 2,
  },
  pop: {
    label: 'POP / J-POP / IDOL',
    palettes: [
      ['#fff4f8', '#ff4fa3', '#4f7bff', '#ffd23f', '#1a1033'],
      ['#101030', '#ff7eb6', '#7afcff', '#feff9c', '#ffffff'],
      ['#fdf6e3', '#ff5e5b', '#00cecb', '#ffed66', '#202030'],
    ],
    charsets: ['symbols', 'classic', 'braille'],
    font: { display: FONT.gothic, accent: FONT.condensed },
    scenes: { asciiTunnel: 1, asciiShape: 1.5, asciiText: 2, asciiSpectrum: 1, geoPulse: 2.5, geoGrid: 1, geoBlocks: 3, paint: 2, ink: 1 },
    fx: { rgb: 0.45, glitch: 0.35, grain: 0.04, scan: 0.1, feedback: 0.4, bloom: 0.6, strobe: 0.35, vignette: 0.3 },
    type: ['split', 'impact', 'stack', 'typewriter'],
    cutBars: 4,
  },
  lofi: {
    label: 'LO-FI / CHILL / R&B',
    palettes: [
      ['#1d1a2f', '#f4a261', '#e76f51', '#8ab6d6', '#f6efe4'],
      ['#2b2233', '#ffb4a2', '#b5838d', '#e5989b', '#ffe8d6'],
      ['#13232f', '#f2cc8f', '#81b29a', '#e07a5f', '#f4f1de'],
    ],
    charsets: ['classic', 'braille', 'symbols'],
    font: { display: FONT.mincho, accent: FONT.mono },
    scenes: { asciiTunnel: 0.8, asciiShape: 1.2, asciiText: 1.5, asciiSpectrum: 0.8, geoPulse: 0.8, geoGrid: 0.6, geoBlocks: 0.6, paint: 4, ink: 2.5 },
    fx: { rgb: 0.25, glitch: 0.15, grain: 0.12, scan: 0.15, feedback: 0.6, bloom: 0.5, strobe: 0.05, vignette: 0.8 },
    type: ['typewriter', 'vertical', 'split'],
    cutBars: 8,
  },
  ambient: {
    label: 'AMBIENT / CLASSICAL / BALLAD',
    palettes: [
      ['#0b0f19', '#9fb7d4', '#e9d8a6', '#94d2bd', '#f5f3ee'],
      ['#f3efe6', '#1b263b', '#8d5524', '#a3b18a', '#111111'],
      ['#0d0d0d', '#e0e0e0', '#c9a227', '#6c757d', '#fafafa'],
    ],
    charsets: ['braille', 'classic', 'kanji'],
    font: { display: FONT.mincho, accent: FONT.mincho },
    scenes: { asciiTunnel: 0.5, asciiShape: 1, asciiText: 1, asciiSpectrum: 0.3, geoPulse: 0.5, geoGrid: 0.3, geoBlocks: 0.2, paint: 5, ink: 3.5 },
    fx: { rgb: 0.1, glitch: 0.05, grain: 0.09, scan: 0.0, feedback: 0.75, bloom: 0.6, strobe: 0.0, vignette: 0.9 },
    type: ['vertical', 'typewriter', 'split'],
    cutBars: 8,
  },
  hiphop: {
    label: 'HIP-HOP / TRAP',
    palettes: [
      ['#0b0b0b', '#ffd400', '#ffffff', '#ff3b30', '#ffffff'],
      ['#111111', '#c0ff00', '#9b5de5', '#f15bb5', '#f0f0f0'],
      ['#f1e9da', '#111111', '#d62828', '#003049', '#111111'],
    ],
    charsets: ['dense', 'blocks', 'classic'],
    font: { display: FONT.condensed, accent: FONT.gothic },
    scenes: { asciiTunnel: 1.2, asciiShape: 1.5, asciiText: 3, asciiSpectrum: 2, geoPulse: 1.5, geoGrid: 0.8, geoBlocks: 3, paint: 1.2, ink: 0.8 },
    fx: { rgb: 0.6, glitch: 0.6, grain: 0.12, scan: 0.2, feedback: 0.3, bloom: 0.4, strobe: 0.5, vignette: 0.7 },
    type: ['impact', 'stack', 'typewriter', 'glitch'],
    cutBars: 2,
  },
  vapor: {
    label: 'CITY POP / SYNTHWAVE / VAPORWAVE',
    palettes: [
      ['#120024', '#ff71ce', '#01cdfe', '#fffb96', '#f6e9ff'],
      ['#1a1040', '#ff6c11', '#ff3864', '#2de2e6', '#f9f871'],
    ],
    charsets: ['katakana', 'classic', 'symbols'],
    font: { display: FONT.gothic, accent: FONT.pixel },
    scenes: { asciiTunnel: 1.5, asciiShape: 2, asciiText: 2, asciiSpectrum: 1, geoPulse: 1.5, geoGrid: 4, geoBlocks: 1, paint: 1.5, ink: 1 },
    fx: { rgb: 0.7, glitch: 0.4, grain: 0.08, scan: 0.6, feedback: 0.55, bloom: 1.0, strobe: 0.2, vignette: 0.6 },
    type: ['split', 'typewriter', 'impact', 'vertical'],
    cutBars: 4,
  },
  dark: {
    label: 'DARK / EMO / GOTHIC',
    palettes: [
      ['#000000', '#f2f2f2', '#8b0000', '#5a5a5a', '#ffffff'],
      ['#050505', '#c9c9c9', '#4a00e0', '#e0002a', '#eeeeee'],
    ],
    charsets: ['kanji', 'blocks', 'dense', 'braille'],
    font: { display: FONT.mincho, accent: FONT.gothic },
    scenes: { asciiTunnel: 2, asciiShape: 1.5, asciiText: 2.5, asciiSpectrum: 0.8, geoPulse: 1, geoGrid: 0.4, geoBlocks: 1, paint: 2.5, ink: 3 },
    fx: { rgb: 0.5, glitch: 0.7, grain: 0.16, scan: 0.3, feedback: 0.6, bloom: 0.5, strobe: 0.5, vignette: 1.0 },
    type: ['vertical', 'glitch', 'impact', 'stack'],
    cutBars: 4,
  },
};

const bell = (x, mu, sigma) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2);

export function scorePresets(features, mood) {
  const f = features;
  const m = mood.scores;
  const fast = bell(f.bpm, 140, 22);
  const mid = bell(f.bpm, 115, 18);
  const slow = bell(f.bpm, 80, 15);
  const s = {
    cyber: 0.6 * fast + 0.5 * f.brightness + 0.4 * f.percussive + 2.2 * m.tech + 0.6 * m.party + 0.2 * f.loudness,
    rock: 0.5 * fast + 0.6 * f.loudness + 0.4 * f.brightness + 2.2 * m.rebel + 1.0 * m.energy + 0.6 * m.dark - 0.3 * f.dynamics,
    pop: 0.7 * mid + 0.4 * f.brightness + 0.3 * f.percussive + 1.6 * m.love + 1.0 * m.party + 0.4 * m.energy,
    lofi: 0.8 * slow + 0.5 * (1 - f.loudness) + 0.3 * (1 - f.brightness) + 1.2 * m.sad + 0.8 * m.love + 0.6 * m.dream,
    ambient: 0.9 * (1 - f.percussive) + 0.4 * slow + 0.5 * f.dynamics + 1.5 * m.nature + 1.0 * m.dream + 0.4 * m.sad - 0.4 * f.loudness,
    hiphop: 0.7 * (bell(f.bpm, 90, 12) + bell(f.bpm, 150, 10)) + 0.6 * f.percussive + 0.3 * (1 - f.brightness) + 1.4 * m.party + 0.8 * m.rebel,
    vapor: 0.6 * mid + 0.3 * (1 - f.percussive) + 1.4 * m.dream + 1.0 * m.tech + 0.8 * m.love + 0.4 * m.nature,
    dark: 0.4 * (1 - f.brightness) + 2.0 * m.dark + 1.0 * m.sad + 0.6 * m.rebel + 0.2 * f.dynamics,
  };
  return Object.entries(s).sort((a, b) => b[1] - a[1]);
}

export function buildStyle({ features, mood, preset = 'auto', seed = 1, intensity = 1 }) {
  const rnd = mulberry32(seed);
  const ranking = scorePresets(features, mood);
  // Small seeded jitter keeps near-ties from always landing on the same look.
  const jittered = ranking.map(([k, v]) => [k, v + rnd() * 0.15]).sort((a, b) => b[1] - a[1]);
  const key = preset !== 'auto' && PRESETS[preset] ? preset : jittered[0][0];
  const p = PRESETS[key];
  const secondary = PRESETS[jittered.find(([k]) => k !== key)[0]];
  const palette = rnd.pick(p.palettes).map(hexToRgb);
  // Borrow a little from the runner-up so hybrids (e.g. sad + electronic) read correctly.
  const scenes = {};
  for (const k of Object.keys(p.scenes)) scenes[k] = p.scenes[k] * 0.8 + (secondary.scenes[k] || 0) * 0.2;
  const fx = {};
  for (const k of Object.keys(p.fx)) fx[k] = p.fx[k] * intensity;
  const energyBias = features.loudness * 0.5 + features.percussive * 0.5;
  return {
    key,
    label: p.label,
    ranking,
    palette,
    bg: palette[0],
    fg: palette[4],
    colors: palette.slice(1, 4),
    lightBg: (palette[0][0] + palette[0][1] + palette[0][2]) / 3 > 140,
    charset: CHARSETS[rnd.pick(p.charsets)],
    charsetAlt: CHARSETS[rnd.pick(p.charsets)],
    font: p.font,
    scenes,
    fx,
    type: p.type,
    cutBars: Math.max(1, Math.round(p.cutBars * (features.bpm > 150 ? 2 : 1))),
    energyBias,
    seed,
  };
}

// Visual library: which ASCII art piece / ink painting fits a lyric line.
// Japanese words are mapped onto the English tags the pieces carry, so a line
// like "月が綺麗な夜" pulls a moon piece or the moon-over-the-lake painting.

import { isCJK } from './util.js';

// Japanese (and a few loose English forms) -> English tag words.
const JA = [
  ['月', 'moon'], ['満月', 'moon'], ['星', 'stars'], ['流れ星', 'stars'], ['宇宙', 'space'], ['銀河', 'galaxy'], ['惑星', 'planet'],
  ['太陽', 'sun'], ['朝', 'morning'], ['夜明け', 'dawn'], ['夕', 'sunset'], ['夕焼け', 'sunset'], ['夜', 'night'], ['真夜中', 'night'],
  ['海', 'ocean'], ['波', 'waves'], ['川', 'river'], ['湖', 'lake'], ['水', 'water'], ['滝', 'waterfall'], ['雨', 'rain'], ['嵐', 'storm'],
  ['雷', 'lightning'], ['雪', 'snow'], ['冬', 'winter'], ['春', 'spring'], ['夏', 'summer'], ['秋', 'autumn'], ['紅葉', 'autumn'],
  ['桜', 'sakura'], ['花', 'flowers'], ['森', 'forest'], ['木', 'tree'], ['山', 'mountains'], ['空', 'sky'], ['雲', 'cloud'], ['霧', 'mist'],
  ['風', 'wind'], ['火', 'fire'], ['炎', 'fire'], ['燃', 'fire'], ['砂漠', 'desert'], ['虹', 'rainbow'], ['オーロラ', 'aurora'],
  ['街', 'city'], ['都会', 'city'], ['東京', 'city'], ['ビル', 'skyline'], ['道', 'street'], ['車', 'traffic'], ['電車', 'train'],
  ['橋', 'bridge'], ['船', 'ferry'], ['飛行機', 'plane'], ['ロケット', 'rocket'], ['ネオン', 'neon'], ['信号', 'neon'],
  ['猫', 'cat'], ['犬', 'dog'], ['鳥', 'birds'], ['魚', 'fish'], ['鯨', 'whale'], ['クジラ', 'whale'], ['蝶', 'butterfly'], ['鶴', 'crane'],
  ['心', 'heart'], ['ハート', 'heart'], ['愛', 'heart'], ['恋', 'heart'], ['鼓動', 'heart'],
  ['音', 'music'], ['音楽', 'music'], ['歌', 'music'], ['ピアノ', 'piano'], ['ギター', 'guitar'], ['ビート', 'audio'], ['リズム', 'audio'],
  ['時間', 'clock'], ['時計', 'clock'], ['時', 'time'], ['記憶', 'nostalgia'], ['思い出', 'nostalgia'],
  ['夢', 'dream'], ['光', 'light'], ['闇', 'dark'], ['影', 'shadow'], ['未来', 'future'], ['世界', 'earth'], ['地球', 'earth'],
  ['ゲーム', 'game'], ['コード', 'code'], ['ノイズ', 'noise'], ['電', 'electric'], ['回路', 'circuit'], ['データ', 'data'],
  ['祭', 'festival'], ['花火', 'fireworks'], ['パーティ', 'party'], ['踊', 'dance'], ['ダンス', 'dance'],
  ['竹', 'bamboo'], ['寺', 'temple'], ['神社', 'temple'], ['日本', 'japan'],
];
const EN_ALIAS = {
  stars: ['star', 'stars', 'starry'], moon: ['moon', 'moonlight', 'lunar'], ocean: ['ocean', 'sea', 'seas', 'tide'],
  waves: ['wave', 'waves', 'surf'], rain: ['rain', 'raining', 'rainy', 'storm'], fire: ['fire', 'flame', 'flames', 'burn', 'burning', 'blaze'],
  city: ['city', 'town', 'streets', 'downtown'], heart: ['heart', 'love', 'hearts'], night: ['night', 'midnight', 'tonight'],
  space: ['space', 'cosmos', 'universe', 'galaxy', 'orbit'], snow: ['snow', 'snowfall', 'winter', 'frozen', 'ice'],
  flowers: ['flower', 'flowers', 'bloom', 'blossom', 'rose', 'roses'], birds: ['bird', 'birds', 'wings', 'fly', 'flying'],
  music: ['music', 'song', 'sing', 'melody', 'piano', 'guitar', 'radio'], neon: ['neon', 'signal', 'lights'],
  clock: ['clock', 'time', 'tick'], dream: ['dream', 'dreams', 'dreaming'], sun: ['sun', 'sunshine', 'sunrise', 'sunset'],
};

function tagsOf(text) {
  const out = new Set();
  if (!text) return out;
  for (const [ja, tag] of JA) if (text.includes(ja)) out.add(tag);
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  for (const w of words) {
    out.add(w);
    for (const [tag, forms] of Object.entries(EN_ALIAS)) if (forms.includes(w)) out.add(tag);
  }
  return out;
}

// Categories that read well full-screen in a music video, and how often.
const CATEGORY_WEIGHT = {
  landscapes: 1.4, cosmos: 1.3, solids: 1.3, demoscene: 1.5, algorithms: 1.2, 'motion-lab': 1.0, weather: 1.2,
  animals: 0.8, cities: 1.2, lettering: 0.5, music: 1.0, retro: 0.7, arcade: 0.4, science: 0.6, occasions: 0.3,
  things: 0.3, india: 0.3, food: 0.1, mascots: 0.15, frames: 0, screens: 0, 'live-data': 0, explainers: 0, 'empty-states': 0,
};

// Style key -> categories it leans toward.
const STYLE_CATEGORY = {
  cyber: { demoscene: 2, algorithms: 1.8, solids: 1.6, cosmos: 1.2, cities: 1.4, retro: 1.3 },
  rock: { demoscene: 1.8, solids: 1.6, weather: 1.4, algorithms: 1.2 },
  pop: { landscapes: 1.3, occasions: 2, animals: 1.5, music: 1.6, lettering: 1.3, solids: 1.1 },
  lofi: { landscapes: 2, cities: 1.6, weather: 1.6, animals: 1.3, music: 1.4 },
  ambient: { landscapes: 2.2, cosmos: 1.6, weather: 1.5, 'motion-lab': 1.3 },
  hiphop: { cities: 2, demoscene: 1.5, music: 1.6, solids: 1.2, retro: 1.3 },
  vapor: { cities: 1.8, retro: 2, cosmos: 1.4, landscapes: 1.3, demoscene: 1.3 },
  dark: { weather: 1.6, cosmos: 1.4, algorithms: 1.6, demoscene: 1.5, landscapes: 1.1 },
};

// Paintings (shanshui scenes) and the words that summon them.
export const PAINTINGS = {
  s01: { title: 'Cranes over the falls', tags: ['birds', 'crane', 'waterfall', 'water', 'fly', 'free'] },
  s02: { title: 'Golden river', tags: ['river', 'gold', 'sunset', 'boat', 'flow', 'journey'] },
  s03: { title: 'Moon over the lake', tags: ['moon', 'night', 'lake', 'calm', 'dark', 'quiet'] },
  s04: { title: 'Rope bridges', tags: ['bridge', 'mountains', 'mist', 'cloud', 'far', 'road'] },
  s05: { title: 'Stone bridge, red sun', tags: ['sun', 'bridge', 'red', 'sunset', 'dawn'] },
  s06: { title: 'Snow temple', tags: ['snow', 'winter', 'temple', 'cold', 'white', 'silence'] },
  s07: { title: 'Bamboo valley', tags: ['bamboo', 'forest', 'green', 'wind', 'tree', 'spring'] },
  s08: { title: 'Red cascade', tags: ['waterfall', 'red', 'fire', 'blood', 'rage', 'water'] },
  s09: { title: 'Floating peaks', tags: ['mountains', 'cloud', 'sky', 'dream', 'heaven', 'float'] },
  s10: { title: 'Autumn ruins', tags: ['autumn', 'leaves', 'ruins', 'memory', 'nostalgia', 'fall'] },
};

export class Library {
  constructor(index) {
    this.pieces = index.filter((p) => (CATEGORY_WEIGHT[p.category] ?? 0.3) > 0);
    this.all = index;
  }

  static async load(url = 'vendor/ascii-magic-art/index.json') {
    const res = await fetch(url);
    return new Library(await res.json());
  }

  // Pieces whose tags/name match the words of a lyric line, best first.
  matchPieces(text) {
    const tags = tagsOf(text);
    if (!tags.size) return [];
    const scored = [];
    for (const p of this.all) {
      if (CATEGORY_WEIGHT[p.category] === 0) continue;
      let s = 0;
      for (const t of p.tags) if (tags.has(t)) s += 2;
      for (const w of p.slug.split('-')) if (tags.has(w)) s += 1.5;
      if (s > 0) scored.push([p, s * (0.5 + (CATEGORY_WEIGHT[p.category] ?? 0.3))]);
    }
    return scored.sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }

  matchPainting(text) {
    const tags = tagsOf(text);
    let best = null, bs = 0;
    for (const [id, p] of Object.entries(PAINTINGS)) {
      let s = 0;
      for (const t of p.tags) if (tags.has(t)) s++;
      if (s > bs) { bs = s; best = id; }
    }
    return best;
  }

  // A random piece weighted by category fit for the style.
  pickPiece(rnd, styleKey, avoid = new Set()) {
    const lean = STYLE_CATEGORY[styleKey] || {};
    const entries = this.pieces
      .filter((p) => !avoid.has(p.slug))
      .map((p) => [p, (CATEGORY_WEIGHT[p.category] ?? 0.3) * (lean[p.category] || 0.6) * (p.tags.includes('hero') || p.tags.includes('wallpaper') ? 1.5 : 1)]);
    return rnd.weighted(entries);
  }
}

export const hasJapanese = isCJK;

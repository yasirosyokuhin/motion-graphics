// Lyrics: LRC / plain-text parsing, automatic timing against the beat grid,
// and keyword-based mood analysis (Japanese + English).

import { isCJK } from './util.js';

const LRC_TAG = /\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

export function parseLyrics(raw) {
  const text = (raw || '').replace(/\r/g, '');
  const timed = [];
  const plain = [];
  for (const line of text.split('\n')) {
    if (/^\s*\[(ti|ar|al|by|offset|length):/i.test(line)) continue;
    const tags = [...line.matchAll(LRC_TAG)];
    const body = line.replace(LRC_TAG, '').trim();
    if (tags.length) {
      for (const m of tags) {
        const t = parseInt(m[1], 10) * 60 + parseFloat(m[2].replace(':', '.'));
        timed.push({ start: t, text: body });
      }
    } else {
      plain.push(line.trim());
    }
  }
  if (timed.length >= 2) {
    timed.sort((a, b) => a.start - b.start);
    return { mode: 'lrc', lines: timed };
  }
  // Collapse runs of blank lines into a single "gap" marker.
  const lines = [];
  for (const l of plain) {
    if (!l) {
      if (lines.length && lines[lines.length - 1].gap !== true) lines.push({ gap: true, text: '' });
    } else lines.push({ text: l });
  }
  while (lines.length && lines[lines.length - 1].gap) lines.pop();
  return { mode: 'plain', lines };
}

const weightOf = (text) => {
  const n = [...text].length;
  return isCJK(text) ? Math.max(5, n * 1.0) : Math.max(5, n * 0.55);
};

// Produces [{start, end, text}] for every visible line.
export function timeLyrics(parsed, analysis) {
  const dur = analysis.duration;
  if (parsed.mode === 'lrc') {
    const out = [];
    parsed.lines.forEach((l, i) => {
      const next = parsed.lines[i + 1];
      if (!l.text) return;
      const nextStart = next ? next.start : dur;
      const maxLen = Math.max(2.5, [...l.text].length * 0.45 + 1.5);
      out.push({ start: l.start, end: Math.min(nextStart - 0.05, l.start + maxLen), text: l.text });
    });
    return out;
  }
  const items = parsed.lines;
  if (!items.length) return [];
  const { energy, hopT, bars, beats } = analysis;
  // Vocal window: from the first bar where the track has body to the last.
  let first = 0, last = dur;
  for (let i = 0; i < energy.length; i++) if (energy[i] > 0.35) { first = i * hopT; break; }
  for (let i = energy.length - 1; i >= 0; i--) if (energy[i] > 0.35) { last = i * hopT; break; }
  const firstBar = bars.find((b) => b >= first - 0.05) ?? first;
  let start = Math.max(firstBar, bars[1] ?? 0);
  if (start > dur * 0.35) start = Math.min(dur * 0.1, start);
  let end = Math.max(start + 5, last - 240 / analysis.bpm);
  if (end > dur) end = dur;
  const weights = items.map((l) => (l.gap ? 8 : weightOf(l.text)));
  const total = weights.reduce((a, b) => a + b, 0);
  const snap = (t) => {
    let best = t, bd = 1e9;
    for (const b of beats) {
      const d = Math.abs(b - t);
      if (d < bd) { bd = d; best = b; }
      if (b > t + 1) break;
    }
    return best;
  };
  const out = [];
  let acc = 0;
  items.forEach((l, i) => {
    const s = start + ((end - start) * acc) / total;
    acc += weights[i];
    const e = start + ((end - start) * acc) / total;
    if (!l.gap) out.push({ start: snap(s), end: e - 0.08, text: l.text });
  });
  for (let i = 0; i < out.length - 1; i++) out[i].end = Math.min(out[i].end, out[i + 1].start - 0.05);
  return out;
}

export function toLRC(lines) {
  const fmt = (t) => {
    const m = Math.floor(t / 60);
    const s = (t - m * 60).toFixed(2).padStart(5, '0');
    return `[${String(m).padStart(2, '0')}:${s}]`;
  };
  return lines.map((l) => `${fmt(l.start)}${l.text}`).join('\n');
}

export function lyricAt(lines, t) {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (t >= l.start && t < l.end) {
      return { ...l, index: i, progress: (t - l.start) / Math.max(0.01, l.end - l.start), age: t - l.start };
    }
  }
  return null;
}

// ---------- mood analysis ----------

const MOODS = {
  dark: ['dark', 'death', 'die', 'blood', 'shadow', 'black', 'grave', 'demon', 'hell', 'void', 'kill', 'pain', 'abyss', 'nightmare',
    '闇', '黒', '死', '血', '影', '地獄', '悪魔', '絶望', '痛', '殺', '深淵', '呪', '終わり'],
  love: ['love', 'heart', 'kiss', 'baby', 'darling', 'hold', 'you and me', 'together', 'sweet', 'forever',
    '愛', '恋', 'キス', '好き', '君', 'あなた', '抱', '二人', '永遠', 'ハート', '会いたい'],
  sad: ['cry', 'tears', 'alone', 'lonely', 'goodbye', 'rain', 'miss', 'lost', 'broken', 'cold', 'empty', 'fade',
    '涙', '泣', '雨', '孤独', 'さよなら', '寂し', '悲し', '失', '消え', '冷た', '壊れ', '一人', 'ひとり'],
  energy: ['run', 'fire', 'fight', 'jump', 'power', 'go', 'rise', 'burn', 'fast', 'loud', 'wild', 'alive', 'shout', 'beat',
    '走', '火', '炎', '戦', '跳', '力', '叫', '燃', '加速', '鼓動', 'ビート', '全開', '飛'],
  tech: ['signal', 'neon', 'digital', 'code', 'machine', 'robot', 'cyber', 'electric', 'system', 'data', 'future', 'virtual', 'glitch', 'noise',
    '信号', 'ネオン', 'デジタル', '電', '機械', 'システム', '未来', 'ノイズ', '回路', 'コード', '光速', '仮想'],
  nature: ['sea', 'ocean', 'sky', 'flower', 'tree', 'wind', 'river', 'mountain', 'sun', 'moon', 'star', 'forest', 'snow', 'spring', 'bloom',
    '海', '空', '花', '木', '風', '川', '山', '太陽', '月', '星', '森', '雪', '春', '夏', '秋', '冬', '桜', '咲'],
  dream: ['dream', 'float', 'cloud', 'heaven', 'angel', 'magic', 'sleep', 'memory', 'slow', 'paradise', 'galaxy', 'space',
    '夢', '浮', '雲', '天国', '天使', '魔法', '眠', '記憶', '思い出', '銀河', '宇宙', '幻'],
  party: ['dance', 'party', 'club', 'tonight', 'money', 'drink', 'shake', 'move', 'groove', 'bounce', 'floor',
    'ダンス', '踊', 'パーティ', '今夜', '騒', '乾杯', 'フロア'],
  rebel: ['rebel', 'riot', 'scream', 'rage', 'chaos', 'break', 'war', 'revolution', 'destroy', 'never', 'fuck', 'hate',
    '反逆', '怒', '叫べ', '壊せ', '革命', '戦争', '混沌', '破壊', '叛'],
};

export function analyzeLyricMood(text) {
  const lower = (text || '').toLowerCase();
  const scores = {};
  const hits = [];
  let total = 0;
  for (const [mood, words] of Object.entries(MOODS)) {
    let s = 0;
    for (const w of words) {
      const isLatin = /^[a-z ]+$/.test(w);
      const re = isLatin ? new RegExp(`\\b${w}`, 'g') : new RegExp(w, 'g');
      const n = (lower.match(re) || []).length;
      if (n) { s += n; hits.push(w); }
    }
    scores[mood] = s;
    total += s;
  }
  for (const k of Object.keys(scores)) scores[k] = total ? scores[k] / total : 0;
  return { scores, keywords: [...new Set(hits)], total };
}

// Picks the most "poster-worthy" word/phrase of a lyric line.
export function keywordOf(line) {
  if (!line) return '';
  const t = line.trim();
  if ([...t].length <= 8) return t;
  if (isCJK(t)) {
    const parts = t.split(/[\s、。,!?！？・「」『』]+/).filter(Boolean);
    const best = parts.sort((a, b) => b.length - a.length)[0] || t;
    return [...best].slice(0, 8).join('');
  }
  const words = t.replace(/[^\p{L}\p{N}\s']/gu, '').split(/\s+/).filter(Boolean);
  const stop = new Set(['the', 'and', 'you', 'your', 'are', 'was', 'for', 'with', 'that', 'this', 'from', 'have', 'just', 'into', 'what', 'when', 'will']);
  const cands = words.filter((w) => !stop.has(w.toLowerCase()));
  const best = (cands.length ? cands : words).sort((a, b) => b.length - a.length)[0] || t;
  return best.toUpperCase();
}

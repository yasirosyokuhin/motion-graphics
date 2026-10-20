// App wiring: load a song, analyse it, build a style + plan, preview, export.

import { AudioEngine } from './audio.js';
import { parseLyrics, timeLyrics, analyzeLyricMood, toLRC } from './lyrics.js';
import { buildStyle, PRESETS } from './style.js';
import { Library } from './library.js';
import { Director } from './director.js';
import { PieceLayer } from './layers/pieces.js';
import { PaintingLayer } from './layers/painting.js';
import { Post } from './post.js';
import { Recorder } from './recorder.js';
import { renderDemo, DEMO_LYRICS } from './demo.js';
import { hashString, fmtTime, rgbToCss } from './util.js';

const $ = (id) => document.getElementById(id);
const ui = {
  file: $('file'), drop: $('drop'), demo: $('demo'), title: $('title'), artist: $('artist'), lyrics: $('lyrics'),
  tap: $('tap'), copyLrc: $('copyLrc'), preset: $('preset'), scene: $('scene'), aspect: $('aspect'), quality: $('quality'), intensity: $('intensity'),
  generate: $('generate'), reroll: $('reroll'), out: $('out'), overlay: $('overlay'), rec: $('rec'), tapbox: $('tapbox'),
  play: $('play'), time: $('time'), timeline: $('timeline'), fullscreen: $('fullscreen'), export: $('export'),
  chips: $('chips'), legend: $('legend'), screen: $('screen'),
};

const KIND_COLORS = {
  painting: '#e8d9b0', paintAscii: '#b49a6a', piece: '#00f0ff', asciiTunnel: '#7b2cff', asciiShape: '#9b5de5',
  asciiText: '#ff2bd6', asciiSpectrum: '#39ff14', fish: '#2de2e6', geoPulse: '#ff6c11', geoGrid: '#ff3864', geoBlocks: '#ffd23f',
  oil: '#d98e4a', vangogh: '#3b6fd8', watercolor: '#9fd3c7', ukiyoe: '#c8553d', popart: '#ff2e88',
};
const KIND_LABEL = {
  painting: '絵画', paintAscii: '絵画→ASCII', piece: 'ASCIIアート', asciiTunnel: 'トンネル', asciiShape: '3D', asciiText: '歌詞ASCII',
  asciiSpectrum: 'スペクトラム', fish: '魚群', geoPulse: 'テクノ:パルス', geoGrid: 'テクノ:グリッド', geoBlocks: 'テクノ:ブロック',
  oil: '油彩/点描', vangogh: 'ゴッホ風', watercolor: '水彩', ukiyoe: '浮世絵', popart: 'ポップアート',
};
KIND_LABEL.painting = '水墨画';

const state = {
  audio: new AudioEngine(),
  library: null,
  pieces: new PieceLayer(),
  painting: null,
  director: null,
  post: null,
  stage: document.createElement('canvas'),
  seedSalt: 0,
  lastT: performance.now(),
  recording: null,
  tap: null,
  timedLines: [],
  busy: false,
};
const g = state.stage.getContext('2d');

for (const [k, label] of [['auto', 'シーン: 自動ミックス'], ['paintings', 'シーン: 絵画だけ'], ['painters', 'シーン: 絵画（水墨画以外）'], ['ascii', 'シーン: ASCIIだけ（632作品から）'], ...Object.entries(KIND_LABEL).map(([key, l]) => [key, `シーン: ${l}`])]) {
  const o = document.createElement('option');
  o.value = k; o.textContent = label;
  ui.scene.append(o);
}
for (const [k, p] of [['auto', { label: 'AUTO（自動判定）' }], ...Object.entries(PRESETS)]) {
  const o = document.createElement('option');
  o.value = k; o.textContent = p.label;
  ui.preset.append(o);
}

function overlay(big, small, progress) {
  ui.overlay.hidden = false;
  ui.overlay.innerHTML = `<div class="big">${big}</div><div class="small">${small || ''}</div>` +
    (progress != null ? `<div class="bar2"><i style="width:${Math.round(progress * 100)}%"></i></div>` : '');
}

function chips(list) {
  ui.chips.innerHTML = list.map(([k, v]) => `<span class="chip">${k} <b>${v}</b></span>`).join('');
}

async function loadBuffer(buffer, name) {
  state.busy = true;
  ui.generate.disabled = true;
  overlay('ANALYZING', name, 0);
  const a = await state.audio.setBuffer(buffer, (p) => overlay('ANALYZING', name, p));
  ui.drop.classList.add('loaded');
  ui.drop.querySelector('strong').textContent = name;
  chips([['BPM', a.bpm.toFixed(1)], ['LEN', fmtTime(a.duration)], ['SECTIONS', a.sections.length]]);
  state.busy = false;
  ui.generate.disabled = false;
  await generate();
}

async function loadFile(file) {
  if (!file) return;
  try {
    overlay('LOADING', file.name);
    const buf = await state.audio.decode(await file.arrayBuffer());
    if (!ui.title.value) ui.title.value = file.name.replace(/\.[^.]+$/, '');
    await loadBuffer(buf, file.name);
  } catch (e) {
    console.error(e);
    overlay('ERROR', `読み込めませんでした: ${e.message}`);
  }
}

function sizeFor(aspect, q) {
  const s = +q;
  if (aspect === '9:16') return [Math.round((s * 9) / 16), s];
  if (aspect === '1:1') return [s, s];
  return [Math.round((s * 16) / 9), s];
}

async function generate() {
  const a = state.audio.analysis;
  if (!a || state.busy) return;
  state.busy = true;
  ui.generate.disabled = ui.reroll.disabled = ui.export.disabled = ui.play.disabled = true;
  state.audio.pause();
  try {
    if (!state.library) state.library = await Library.load();
    if (!state.painting && PaintingLayer.supported()) {
      try { state.painting = new PaintingLayer({ scale: 0.5 }); } catch (e) { console.warn('paintings disabled', e); }
    }
    await document.fonts.ready;
    const title = ui.title.value.trim();
    const artist = ui.artist.value.trim();
    const parsed = parseLyrics(ui.lyrics.value);
    state.timedLines = timeLyrics(parsed, a);
    const mood = analyzeLyricMood(ui.lyrics.value + ' ' + title);
    const seed = (hashString(title + '|' + ui.lyrics.value + '|' + a.duration.toFixed(2)) + state.seedSalt * 7919) >>> 0;
    const style = buildStyle({ features: a.features, mood, preset: ui.preset.value, seed, intensity: +ui.intensity.value });
    const [w, h] = sizeFor(ui.aspect.value, ui.quality.value);
    state.stage.width = w; state.stage.height = h;
    if (!state.post) state.post = new Post(ui.out);
    state.post.resize(w, h);
    const director = new Director({
      analysis: a, lyrics: state.timedLines, style, library: state.library, title, artist, w, h, seed,
      pieces: state.pieces, painting: state.painting, forceKind: ui.scene.value,
    });
    await director.plan((p, what) => overlay('GENERATING', what || style.label, p));
    state.director = director;
    const topMoods = Object.entries(mood.scores).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => k.toUpperCase());
    chips([
      ['BPM', a.bpm.toFixed(1)], ['LEN', fmtTime(a.duration)], ['STYLE', style.label],
      ['MOOD', topMoods.join(' / ') || '—'], ['CUTS', director.segments.length], ['LYRICS', `${state.timedLines.length} (${parsed.mode})`],
    ]);
    const used = [...new Set(director.segments.map((s) => s.kind))];
    ui.legend.innerHTML = used.map((k) => `<span><i style="background:${KIND_COLORS[k]}"></i>${KIND_LABEL[k]}</span>`).join('');
    ui.overlay.hidden = true;
    director.reset();
  } catch (e) {
    console.error(e);
    overlay('ERROR', e.message);
  }
  state.busy = false;
  ui.generate.disabled = ui.reroll.disabled = ui.export.disabled = ui.play.disabled = false;
}

// ---------------------------------------------------------------- render loop

const waveF = new Float32Array(512);
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.1, (now - state.lastT) / 1000);
  state.lastT = now;
  const A = state.audio;
  const d = state.director;
  ui.play.textContent = A.playing ? '❚❚' : '▶';
  ui.time.textContent = `${fmtTime(A.time)} / ${fmtTime(A.duration)}`;
  drawTimeline();
  if (!d || state.busy) return;
  A.updateRealtime();
  if (A.wave) for (let i = 0; i < waveF.length; i++) waveF[i] = (A.wave[Math.floor((i / waveF.length) * A.wave.length)] - 128) / 128;
  const t = A.time;
  const params = d.render(g, t, A.playing ? dt : 0, { bands: A.bands, spectrum: A.spectrum, wave: waveF });
  state.post.render(state.stage, t, params);
}

function drawTimeline() {
  const c = ui.timeline;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * 2) { c.width = w * 2; c.height = h * 2; }
  const x = c.getContext('2d');
  x.setTransform(2, 0, 0, 2, 0, 0);
  x.clearRect(0, 0, w, h);
  const a = state.audio.analysis;
  if (!a) return;
  const dur = a.duration;
  const d = state.director;
  if (d) for (const s of d.segments) {
    x.fillStyle = KIND_COLORS[s.kind] || '#444';
    x.globalAlpha = 0.28;
    x.fillRect((s.start / dur) * w, 0, ((Math.min(s.end, dur) - s.start) / dur) * w, h);
  }
  x.globalAlpha = 1;
  x.strokeStyle = '#e9e9ef';
  x.lineWidth = 1;
  x.beginPath();
  const step = Math.max(1, Math.floor(a.energy.length / w));
  for (let i = 0; i < a.energy.length; i += step) {
    const px = (i / a.energy.length) * w, py = h - 4 - a.energy[i] * (h - 10);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.stroke();
  x.fillStyle = '#ff2bd6';
  for (const l of state.timedLines) x.fillRect((l.start / dur) * w, h - 3, 2, 3);
  x.fillStyle = '#fff';
  x.fillRect((state.audio.time / dur) * w - 1, 0, 2, h);
}

// ---------------------------------------------------------------- controls

ui.file.addEventListener('change', () => loadFile(ui.file.files[0]));
ui.drop.addEventListener('dragover', (e) => { e.preventDefault(); ui.drop.classList.add('over'); });
ui.drop.addEventListener('dragleave', () => ui.drop.classList.remove('over'));
ui.drop.addEventListener('drop', (e) => { e.preventDefault(); ui.drop.classList.remove('over'); loadFile(e.dataTransfer.files[0]); });
ui.screen.addEventListener('dragover', (e) => e.preventDefault());
ui.screen.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

ui.demo.addEventListener('click', async () => {
  overlay('SYNTHESIZING', 'デモ曲を生成中…');
  state.audio.ensureContext();
  const buf = await renderDemo(state.audio.ctx.sampleRate);
  ui.title.value = 'NEON SIGNAL';
  ui.artist.value = 'MV//GEN DEMO';
  ui.lyrics.value = DEMO_LYRICS;
  await loadBuffer(buf, 'demo: NEON SIGNAL (synth)');
});

ui.generate.addEventListener('click', () => generate());
ui.reroll.addEventListener('click', () => { state.seedSalt++; generate(); });
for (const el of [ui.preset, ui.scene, ui.aspect, ui.quality]) el.addEventListener('change', () => state.director && generate());
ui.intensity.addEventListener('change', () => state.director && generate());

ui.play.addEventListener('click', togglePlay);
function togglePlay() {
  const A = state.audio;
  if (!state.director) return;
  if (A.playing) A.pause();
  else { if (A.time === 0) state.director.reset(); A.play(); }
}
ui.timeline.addEventListener('click', (e) => {
  const a = state.audio.analysis;
  if (!a || state.recording) return;
  const r = ui.timeline.getBoundingClientRect();
  state.audio.seek(((e.clientX - r.left) / r.width) * a.duration);
});
ui.fullscreen.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : ui.screen.requestFullscreen()));

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.tap) return tapMark();
    togglePlay();
  }
  if (e.code === 'Escape' && state.tap) finishTap();
});

// ---- tap sync: Space marks the start of each lyric line while the song plays
ui.tap.addEventListener('click', () => {
  const parsed = parseLyrics(ui.lyrics.value);
  const lines = parsed.lines.filter((l) => l.text && !l.gap).map((l) => l.text);
  if (!state.audio.buffer || !lines.length) return;
  state.tap = { lines, i: 0, marks: [] };
  state.audio.stop();
  state.director && state.director.reset();
  state.audio.play(0);
  updateTapBox();
  ui.tapbox.hidden = false;
});
function updateTapBox() {
  const T = state.tap;
  ui.tapbox.innerHTML = T.i < T.lines.length
    ? `SPACE で次の行の頭を叩く (${T.i + 1}/${T.lines.length})<br><b>${T.lines[T.i]}</b><br><small>Esc で終了</small>`
    : '完了！ Esc で確定';
}
function tapMark() {
  const T = state.tap;
  if (T.i >= T.lines.length) return finishTap();
  T.marks.push({ start: state.audio.time, text: T.lines[T.i] });
  T.i++;
  updateTapBox();
}
function finishTap() {
  const T = state.tap;
  state.tap = null;
  ui.tapbox.hidden = true;
  state.audio.pause();
  if (T.marks.length) {
    ui.lyrics.value = toLRC(T.marks);
    generate();
  }
}
ui.copyLrc.addEventListener('click', async () => {
  const text = state.timedLines.length ? toLRC(state.timedLines) : ui.lyrics.value;
  ui.lyrics.value = text;
  try { await navigator.clipboard.writeText(text); } catch (_) { /* clipboard may be blocked */ }
});

// ---- export: plays the song from the top and records the canvas + audio
ui.export.addEventListener('click', async () => {
  const A = state.audio;
  if (!state.director) return;
  if (state.recording) { A.stop(); return; }
  A.stop();
  state.director.reset();
  const rec = new Recorder(ui.out, A.streamDest.stream);
  state.recording = rec;
  ui.rec.hidden = false;
  ui.export.textContent = '■ STOP';
  rec.start(60);
  const prevEnded = A.onEnded;
  A.onEnded = async () => {
    A.onEnded = prevEnded;
    const blob = await rec.stop();
    state.recording = null;
    ui.rec.hidden = true;
    ui.export.textContent = '● EXPORT';
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(ui.title.value || 'mv').replace(/[\\/:*?"<>|]+/g, '_')}.${rec.extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  await A.play(0);
});
const origStop = state.audio.stop.bind(state.audio);
state.audio.stop = () => {
  const wasRecording = state.recording && state.audio.playing;
  origStop();
  if (wasRecording && state.audio.onEnded) state.audio.onEnded();
};

// debug / automation hook
window.__mv = { state, generate, loadBuffer, renderDemo, DEMO_LYRICS, rgbToCss };

// Embedded build (claude.ai artifact): downloads are blocked there, so export is
// hidden, and the demo song is prepared on load so the page opens ready to play.
if (window.MV_EMBED) {
  ui.export.hidden = true;
  ui.scene.value = 'ascii';
  ui.demo.click();
}

requestAnimationFrame(frame);

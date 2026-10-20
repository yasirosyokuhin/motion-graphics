// Audio playback + offline analysis (tempo, beat grid, sections, hits)
// and realtime spectrum bands.

import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffer = null;
    this.analysis = null;
    this.source = null;
    this.playing = false;
    this.startedAt = 0;
    this.offset = 0;
    this.onEnded = null;
    this.freq = null;
    this.wave = null;
    this.bands = { bass: 0, mid: 0, high: 0, level: 0 };
    this.spectrum = new Float32Array(64);
  }

  ensureContext() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.master = this.ctx.createGain();
    this.streamDest = this.ctx.createMediaStreamDestination();
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.master.connect(this.streamDest);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.wave = new Uint8Array(this.analyser.fftSize);
  }

  async decode(arrayBuffer) {
    this.ensureContext();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  async setBuffer(buffer, onProgress) {
    this.stop();
    this.buffer = buffer;
    this.offset = 0;
    this.analysis = await analyzeBuffer(buffer, onProgress);
    return this.analysis;
  }

  get duration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  get time() {
    if (!this.buffer) return 0;
    if (!this.playing) return this.offset;
    return Math.min(this.duration, this.ctx.currentTime - this.startedAt);
  }

  async play(from = this.offset) {
    if (!this.buffer) return;
    this.ensureContext();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this._killSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.analyser);
    from = clamp(from, 0, this.duration - 0.01);
    src.start(0, from);
    this.startedAt = this.ctx.currentTime - from;
    this.source = src;
    this.playing = true;
    src.onended = () => {
      if (this.source !== src) return;
      this.playing = false;
      this.offset = 0;
      this.source = null;
      this.onEnded && this.onEnded();
    };
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.time;
    this.playing = false;
    this._killSource();
  }

  stop() {
    this.playing = false;
    this.offset = 0;
    this._killSource();
  }

  seek(t) {
    const wasPlaying = this.playing;
    this.offset = clamp(t, 0, this.duration);
    if (wasPlaying) this.play(this.offset);
  }

  _killSource() {
    if (this.source) {
      const s = this.source;
      this.source = null;
      try { s.onended = null; s.stop(); } catch (_) { /* already stopped */ }
      s.disconnect();
    }
  }

  // Realtime spectrum -> smoothed bands (0..1) + 64 log-spaced bins.
  updateRealtime() {
    if (!this.ctx) return this.bands;
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.wave);
    const sr = this.ctx.sampleRate;
    const n = this.freq.length;
    const binHz = sr / 2 / n;
    const band = (lo, hi) => {
      const a = Math.max(1, Math.floor(lo / binHz));
      const b = Math.min(n - 1, Math.ceil(hi / binHz));
      let s = 0;
      for (let i = a; i <= b; i++) s += this.freq[i];
      return s / ((b - a + 1) * 255);
    };
    const k = this.playing ? 0.5 : 0.08;
    const sm = (old, v) => old + (v - old) * k;
    const bass = band(25, 160), mid = band(160, 2500), high = band(2500, 12000);
    this.bands.bass = sm(this.bands.bass, this.playing ? bass : 0);
    this.bands.mid = sm(this.bands.mid, this.playing ? mid : 0);
    this.bands.high = sm(this.bands.high, this.playing ? high * 1.6 : 0);
    this.bands.level = (this.bands.bass + this.bands.mid + this.bands.high) / 3;
    const bins = this.spectrum.length;
    for (let i = 0; i < bins; i++) {
      const f0 = 30 * Math.pow(16000 / 30, i / bins);
      const f1 = 30 * Math.pow(16000 / 30, (i + 1) / bins);
      const v = this.playing ? band(f0, f1) : 0;
      this.spectrum[i] += (v - this.spectrum[i]) * 0.5;
    }
    return this.bands;
  }
}

// ---------- offline analysis ----------

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const a = i + j, b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

function percentile(arr, p) {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))] || 0;
}

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

export async function analyzeBuffer(buffer, onProgress = () => {}) {
  const sr = buffer.sampleRate;
  const len = buffer.length;
  const chs = buffer.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += d[i] / chs;
  }

  const N = 1024;
  const hop = 512;
  const hopT = hop / sr;
  const frames = Math.max(1, Math.floor((len - N) / hop));
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const rms = new Float32Array(frames);
  const low = new Float32Array(frames);
  const high = new Float32Array(frames);
  const cent = new Float32Array(frames);
  const flux = new Float32Array(frames);
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
  const lowBin = Math.max(2, Math.round((150 * N) / sr));
  const highBin = Math.round((4000 * N) / sr);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    let s2 = 0;
    for (let i = 0; i < N; i++) {
      const v = mono[off + i];
      s2 += v * v;
      re[i] = v * win[i];
      im[i] = 0;
    }
    rms[f] = Math.sqrt(s2 / N);
    fft(re, im);
    let lo = 0, hi = 0, num = 0, den = 0, fl = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      const lm = Math.log1p(m * 10);
      cur[k] = lm;
      if (k <= lowBin) lo += m;
      if (k >= highBin) hi += m;
      num += k * m;
      den += m;
      const d = lm - prev[k];
      if (d > 0) fl += k < lowBin * 3 ? d * 1.5 : d;
    }
    low[f] = lo / lowBin;
    high[f] = hi / (N / 2 - highBin);
    cent[f] = den > 0 ? ((num / den) * sr) / N : 0;
    flux[f] = fl;
    const t = prev; prev = cur; cur = t;
    if (f % 2000 === 0) {
      onProgress(f / frames * 0.8);
      await yieldUI();
    }
  }

  // Onset envelope: flux minus local mean.
  const onset = new Float32Array(frames);
  const wm = Math.round(0.25 / hopT);
  let acc = 0;
  const pre = new Float32Array(frames + 1);
  for (let i = 0; i < frames; i++) { acc += flux[i]; pre[i + 1] = acc; }
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - wm), b = Math.min(frames, i + wm + 1);
    const mean = (pre[b] - pre[a]) / (b - a);
    onset[i] = Math.max(0, flux[i] - mean);
  }
  const onMax = percentile(onset, 0.99) || 1;
  for (let i = 0; i < frames; i++) onset[i] = Math.min(1.5, onset[i] / onMax);
  onProgress(0.85);
  await yieldUI();

  // Tempo by autocorrelation with a log-gaussian prior around 120 BPM.
  const minLag = Math.floor(60 / 200 / hopT);
  const maxLag = Math.ceil(60 / 60 / hopT);
  const ac = new Float32Array(maxLag * 2 + 2);
  const span = Math.min(frames, Math.round(120 / hopT));
  const start = Math.max(0, Math.floor(frames / 2 - span / 2));
  for (let L = minLag; L <= Math.min(maxLag * 2, frames - 1); L++) {
    let s = 0;
    for (let i = start; i < start + span - L; i++) s += onset[i] * onset[i + L];
    ac[L] = s;
  }
  let bestL = 0, bestS = -1;
  for (let L = minLag; L <= maxLag; L++) {
    const bpm = 60 / (L * hopT);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.8, 2));
    const s = (ac[L] + 0.5 * (ac[L * 2] || 0)) * prior;
    if (s > bestS) { bestS = s; bestL = L; }
  }
  let period = bestL;
  if (bestL > minLag && bestL < maxLag) {
    const a = ac[bestL - 1], b = ac[bestL], c = ac[bestL + 1];
    const d = a - 2 * b + c;
    if (d !== 0) period = bestL + (0.5 * (a - c)) / d;
  }
  let bpm = period > 0 ? 60 / (period * hopT) : 120;
  if (!isFinite(bpm) || bpm <= 0) { bpm = 120; }
  while (bpm < 70) bpm *= 2;
  while (bpm > 190) bpm /= 2;
  period = 60 / bpm / hopT;

  // Phase: offset that best lines up with onsets.
  let bestPhase = 0, bestPS = -1;
  for (let p = 0; p < period; p += 0.5) {
    let s = 0;
    for (let k = p; k < frames; k += period) {
      const i = Math.round(k);
      s += onset[i] + 0.5 * (onset[i - 1] || 0) + 0.5 * (onset[i + 1] || 0);
    }
    if (s > bestPS) { bestPS = s; bestPhase = p; }
  }
  const beatT = period * hopT;
  const beats = [];
  for (let t = bestPhase * hopT; t < buffer.duration; t += beatT) beats.push(t);
  if (!beats.length) beats.push(0);

  // Downbeat: which beat (mod 4) carries most low-end energy.
  const lowMax = percentile(low, 0.98) || 1;
  const dbScore = [0, 0, 0, 0];
  beats.forEach((t, i) => {
    const f = Math.min(frames - 1, Math.round(t / hopT));
    dbScore[i % 4] += low[f] / lowMax + onset[f];
  });
  const dbOff = dbScore.indexOf(Math.max(...dbScore));
  const bars = [];
  if (dbOff > 0) bars.push(Math.max(0, beats[dbOff] - beatT * 4));
  for (let i = dbOff; i < beats.length; i += 4) bars.push(beats[i]);
  if (!bars.length || bars[0] > 0.001) bars.unshift(0);
  onProgress(0.9);
  await yieldUI();

  // Normalized envelopes.
  const rmsHi = percentile(rms, 0.97) || 1;
  const energy = new Float32Array(frames);
  const lowN = new Float32Array(frames);
  const highN = new Float32Array(frames);
  const highMax = percentile(high, 0.98) || 1;
  let e = 0;
  for (let i = 0; i < frames; i++) {
    const v = clamp(rms[i] / rmsHi);
    e += (v - e) * (v > e ? 0.3 : 0.05);
    energy[i] = e;
    lowN[i] = clamp(low[i] / lowMax);
    highN[i] = clamp(high[i] / highMax);
  }

  // Sections from per-bar energy novelty.
  const barE = bars.map((t, i) => {
    const t1 = bars[i + 1] ?? buffer.duration;
    const a = Math.floor(t / hopT), b = Math.max(a + 1, Math.floor(t1 / hopT));
    let s = 0;
    for (let k = a; k < b && k < frames; k++) s += energy[k] * 0.7 + lowN[k] * 0.15 + highN[k] * 0.15;
    return s / (b - a);
  });
  const boundaries = [0];
  const W = 4;
  const nov = barE.map((_, b) => {
    if (b < 2 || b > barE.length - 2) return 0;
    let l = 0, r = 0, nl = 0, nr = 0;
    for (let k = Math.max(0, b - W); k < b; k++) { l += barE[k]; nl++; }
    for (let k = b; k < Math.min(barE.length, b + W); k++) { r += barE[k]; nr++; }
    return Math.abs(r / nr - l / nl);
  });
  const novThr = Math.max(0.06, percentile(nov, 0.8));
  for (let b = 2; b < barE.length - 2; b++) {
    const isPeak = nov[b] >= nov[b - 1] && nov[b] >= nov[b + 1] && nov[b] > novThr;
    const last = boundaries[boundaries.length - 1];
    if (isPeak && b - last >= 4) boundaries.push(b);
    else if (b - last >= 16 && b % 8 === 0) boundaries.push(b); // long sections get split
  }
  const sections = boundaries.map((b, i) => {
    const bEnd = boundaries[i + 1] ?? bars.length;
    let s = 0;
    for (let k = b; k < bEnd; k++) s += barE[k];
    return {
      index: i,
      startBar: b,
      endBar: bEnd,
      start: bars[b],
      end: bars[bEnd] ?? buffer.duration,
      energy: s / Math.max(1, bEnd - b),
    };
  });
  const eMin = Math.min(...sections.map((s) => s.energy));
  const eMax = Math.max(...sections.map((s) => s.energy));
  sections.forEach((s) => {
    s.intensity = eMax - eMin > 0.05 ? (s.energy - eMin) / (eMax - eMin) : 0.6;
    s.intensity = clamp(s.intensity * 0.75 + s.energy * 0.35);
  });

  // Strong hits (accents) for flashes and glitches.
  const hits = [];
  const hitThr = Math.max(0.45, percentile(onset, 0.97));
  let lastHit = -1;
  for (let i = 1; i < frames - 1; i++) {
    if (onset[i] > hitThr && onset[i] >= onset[i - 1] && onset[i] >= onset[i + 1]) {
      const t = i * hopT;
      if (t - lastHit > 0.12) { hits.push({ t, s: clamp(onset[i]) }); lastHit = t; }
    }
  }

  // Global features for style selection.
  let centSum = 0, centN = 0;
  for (let i = 0; i < frames; i++) if (rms[i] > rmsHi * 0.1) { centSum += cent[i]; centN++; }
  const meanEnergy = energy.reduce((a, b) => a + b, 0) / frames;
  const meanRms = rms.reduce((a, b) => a + b, 0) / frames;
  const onsetMean = onset.reduce((a, b) => a + b, 0) / frames;
  const barStd = Math.sqrt(barE.reduce((a, b) => a + (b - meanEnergy) ** 2, 0) / barE.length);
  onProgress(1);

  return {
    duration: buffer.duration,
    hopT,
    bpm,
    beats,
    bars,
    sections,
    hits,
    energy,
    low: lowN,
    high: highN,
    features: {
      bpm,
      loudness: clamp(meanRms / 0.25),
      brightness: clamp(((centN ? centSum / centN : 2000) - 800) / 3500),
      percussive: clamp(onsetMean / 0.18),
      dynamics: clamp(barStd / 0.25),
    },
  };
}

// Fast per-frame lookups against the precomputed analysis.
export class Timeline {
  constructor(analysis) {
    this.a = analysis;
    this.prevT = -1;
    this.beatPtr = 0;
    this.hitPtr = 0;
  }

  reset() {
    this.prevT = -1;
    this.beatPtr = 0;
    this.hitPtr = 0;
  }

  _idx(arr, t) {
    let lo = 0, hi = arr.length - 1;
    if (t < arr[0]) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= t) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  sample(arr, t) {
    const i = Math.max(0, Math.min(arr.length - 1, Math.round(t / this.a.hopT)));
    return arr[i] || 0;
  }

  at(t) {
    const a = this.a;
    const bi = this._idx(a.beats, t);
    const b0 = bi >= 0 ? a.beats[bi] : 0;
    const b1 = a.beats[bi + 1] ?? b0 + 60 / a.bpm;
    const beatPhase = bi >= 0 ? clamp((t - b0) / (b1 - b0)) : 0;
    const bar = this._idx(a.bars, t);
    const r0 = a.bars[Math.max(0, bar)] ?? 0;
    const r1 = a.bars[bar + 1] ?? r0 + (240 / a.bpm);
    const barPhase = clamp((t - r0) / (r1 - r0));
    let sec = a.sections[0];
    for (const s of a.sections) if (t >= s.start) sec = s;
    // Events crossed since the last frame (forward only; jumps reset).
    const events = { beat: false, downbeat: false, hit: 0 };
    if (this.prevT < 0 || t < this.prevT || t - this.prevT > 0.5) {
      this.beatPtr = bi + 1;
      this.hitPtr = 0;
      while (this.hitPtr < a.hits.length && a.hits[this.hitPtr].t <= t) this.hitPtr++;
    } else {
      while (this.beatPtr < a.beats.length && a.beats[this.beatPtr] <= t) {
        events.beat = true;
        if (a.bars.some((x) => Math.abs(x - a.beats[this.beatPtr]) < 0.02)) events.downbeat = true;
        this.beatPtr++;
      }
      while (this.hitPtr < a.hits.length && a.hits[this.hitPtr].t <= t) {
        events.hit = Math.max(events.hit, a.hits[this.hitPtr].s);
        this.hitPtr++;
      }
    }
    this.prevT = t;
    return {
      beatIndex: bi,
      beatPhase,
      bar: Math.max(0, bar),
      barPhase,
      section: {
        ...sec,
        progress: clamp((t - sec.start) / Math.max(0.01, sec.end - sec.start)),
      },
      energy: this.sample(a.energy, t),
      low: this.sample(a.low, t),
      high: this.sample(a.high, t),
      events,
    };
  }
}

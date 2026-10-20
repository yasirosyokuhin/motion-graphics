// A synthesized demo song (no samples): intro, verse, build, drop, breakdown,
// final drop. Lets the whole pipeline be tried without bringing a file.

export const DEMO_LYRICS = `夜の街に光る信号
ノイズの中で君を探してる
Can you hear the signal tonight?

心臓のビートが加速する
走れ 走れ 世界の果てまで
We are the fire in the dark

月が溶けて 海になる
星を数えて 夢を見てた

Run through the neon rain
燃えろ 燃えろ 未来まで
We are the fire in the dark`;

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);
// Am - F - C - G
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [45, 41, 36, 43];

// Rendered sample by sample in plain JS (fast, no audio graph): a few simple
// voices summed into a stereo buffer, then soft-clipped.
export async function renderDemo(sampleRate = 44100) {
  const bpm = 126;
  const beat = 60 / bpm, bar = beat * 4;
  const form = [[8, 'intro'], [8, 'verse'], [4, 'build'], [16, 'drop'], [8, 'break'], [4, 'build'], [12, 'drop'], [4, 'outro']];
  const totalBars = form.reduce((a, [b]) => a + b, 0);
  const dur = totalBars * bar + 2;
  const N = Math.ceil(dur * sampleRate);
  const L = new Float32Array(N), R = new Float32Array(N);
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

  const add = (t, len, pan, fn) => {
    const i0 = Math.floor(t * sampleRate), n = Math.floor(len * sampleRate);
    const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n && i0 + i < N; i++) {
      const v = fn(i / sampleRate, i);
      L[i0 + i] += v * gl; R[i0 + i] += v * gr;
    }
  };
  const kick = (t, v = 1) => {
    let ph = 0;
    add(t, 0.45, 0, (x) => {
      const f = 42 + 120 * Math.exp(-x * 30);
      ph += (2 * Math.PI * f) / sampleRate;
      return Math.sin(ph) * v * Math.exp(-x * 7) * 0.9;
    });
  };
  const hat = (t, v, len) => {
    let prev = 0;
    add(t, len, 0.3, (x) => { const n = rand(); const hp = n - prev; prev = n; return hp * v * Math.exp(-x * (5 / len)); });
  };
  const snare = (t, v = 0.5) => {
    let lp = 0;
    add(t, 0.25, -0.1, (x) => {
      const n = rand(); lp += (n - lp) * 0.6;
      return ((n - lp) * 0.8 * Math.exp(-x * 18) + Math.sin(2 * Math.PI * 190 * x) * 0.5 * Math.exp(-x * 30)) * v;
    });
  };
  // band-limited-ish saw/square through a resonant state-variable lowpass
  const voice = (t, freq, len, shape, v, cutoff, pan = 0, attack = 0.005, detune = 0) => {
    let ph = 0, low = 0, band = 0;
    const f = Math.min(0.9, 2 * Math.sin(Math.PI * Math.min(cutoff, sampleRate / 6) / sampleRate)), q = 0.35;
    const fr = freq * Math.pow(2, detune / 1200);
    add(t, len, pan, (x) => {
      ph = (ph + fr / sampleRate) % 1;
      const raw = shape === 'square' ? (ph < 0.5 ? 1 : -1) : 2 * ph - 1;
      low += f * band; band += f * (raw - low - q * band);
      const env = Math.min(1, x / attack) * Math.min(1, (len - x) / 0.04);
      return low * v * env;
    });
  };
  const pad = (t, notes, len, v) => {
    for (const n of notes) for (const d of [-8, 8]) voice(t, NOTE(n), len, 'saw', v, 1200, d > 0 ? 0.4 : -0.4, len * 0.3, d);
  };

  let t0 = 0.05;
  for (const [bars, name] of form) {
    for (let b = 0; b < bars; b++) {
      const bt = t0 + b * bar;
      const ch = b % 4;
      const chord = PROG[ch];
      const drums = name === 'drop' || name === 'verse';
      if (name !== 'break' && name !== 'outro') for (let k = 0; k < 4; k++) kick(bt + k * beat, name === 'drop' ? 1 : 0.8);
      if (name === 'intro' || name === 'break' || name === 'outro') pad(bt, chord, bar, name === 'break' ? 0.07 : 0.05);
      if (name !== 'outro' && (name !== 'intro' || b >= 4)) for (let k = 0; k < 8; k++) hat(bt + (k * beat) / 2, name === 'drop' ? 0.22 : 0.12, k % 2 ? 0.06 : 0.035);
      if (drums) { snare(bt + beat, 0.5); snare(bt + beat * 3, 0.5); }
      if (name === 'build') {
        const n = 4 + b * 4;
        for (let k = 0; k < n; k++) snare(bt + (k * bar) / n, 0.15 + (b / 4) * 0.35);
        voice(bt, NOTE(57 + b * 2), bar, 'saw', 0.08, 400 + b * 900, 0, 0.1);
      }
      if (name === 'verse' || name === 'drop') {
        for (let k = 0; k < 8; k++) voice(bt + (k * beat) / 2, NOTE(BASS[ch] + (k % 4 === 3 ? 12 : 0)), beat / 2 - 0.02, 'saw', 0.3, name === 'drop' ? 900 : 500);
      }
      if (name === 'drop') {
        pad(bt, chord.map((n) => n + 12), bar, 0.035);
        for (let k = 0; k < 16; k++) {
          const n = chord[(k * 2 + Math.floor(k / 4)) % 3] + 12 + (k % 8 === 7 ? 12 : 0);
          voice(bt + (k * beat) / 4, NOTE(n), beat / 4 - 0.02, 'square', 0.08, 2600 + 1200 * Math.sin(b + k / 3), (k % 2 ? 0.5 : -0.5));
        }
      }
    }
    t0 += bars * bar;
    await new Promise((r) => setTimeout(r, 0));
  }
  const buf = new AudioBuffer({ length: N, numberOfChannels: 2, sampleRate });
  for (const [c, d] of [[0, L], [1, R]]) {
    for (let i = 0; i < N; i++) d[i] = Math.tanh(d[i] * 1.2) * 0.85;
    buf.copyToChannel(d, c);
  }
  return buf;
}

// The director: plans every cut of the MV from the song structure, the lyrics
// and the style (deterministic for a given seed), then renders each frame.

import { Timeline } from './audio.js';
import { lyricAt, keywordOf } from './lyrics.js';
import { clamp, easeOutCubic, mulberry32, rgbToCss } from './util.js';
import { PAINTINGS } from './library.js';
import { ASCII_SCENES } from './layers/ascii.js';
import { TECHNO_SCENES, drawHUD } from './layers/techno.js';
import { PAINT_SCENES, subjectFor } from './layers/paint.js';
import { TypeLayer } from './layers/type.js';

const SCENE_CLASSES = { ...ASCII_SCENES, ...TECHNO_SCENES, ...PAINT_SCENES };
const PAINTERS = new Set(Object.keys(PAINT_SCENES));
const PAINT_KINDS = new Set(['painting', 'paintAscii']);

// How well a kind of visual suits a section of a given intensity (0..1).
const SUIT = {
  painting: (I) => 1.5 - I * 1.1,
  paintAscii: (I) => 0.6 + I * 0.5,
  piece: () => 1,
  asciiTunnel: (I) => 0.2 + I * 1.1,
  asciiShape: (I) => 0.5 + I * 0.6,
  asciiText: (I) => 0.7 + I * 0.4,
  asciiSpectrum: (I) => 0.2 + I,
  fish: (I) => 1.1 - I * 0.5,
  geoPulse: (I) => 0.3 + I,
  geoGrid: (I) => 0.4 + I * 0.7,
  geoBlocks: (I) => 0.2 + I,
  oil: (I) => 1.2 - I * 0.5,
  vangogh: (I) => 0.7 + I * 0.3,
  watercolor: (I) => 1.4 - I,
  ukiyoe: () => 0.9,
  popart: (I) => 0.4 + I,
};

// Feedback trail strength per kind (paintings already carry their own motion).
const TRAIL = { painting: 0.25, paintAscii: 0.45, piece: 0.5, asciiText: 0.55, geoBlocks: 0.3, geoGrid: 0.6, geoPulse: 0.85, asciiTunnel: 0.7, asciiShape: 0.7, asciiSpectrum: 0.6, fish: 0.6, oil: 0.15, vangogh: 0.3, watercolor: 0.1, ukiyoe: 0.3, popart: 0.3 };

export class Director {
  constructor({ analysis, lyrics, style, library, title, artist, w, h, seed, pieces, painting, forceKind }) {
    Object.assign(this, { analysis, lyrics, style, library, title, artist, w, h, seed, pieces, painting, forceKind });
    this.timeline = new Timeline(analysis);
    this.typeLayer = new TypeLayer(style);
    this.segments = [];
    this.instances = new Map();
    this.reset();
  }

  reset() {
    this.timeline.reset();
    this.pulse = 0;
    this.hit = 0;
    this.cutFlash = 0;
    this.segIndex = -1;
    this.instances.clear();
    this.insert = null;
    this.sceneRnd = mulberry32(this.seed ^ 0x51ed);
  }

  beatPhaseAt(t) {
    const b = this.analysis.beats;
    let lo = 0, hi = b.length - 1;
    if (t < b[0]) return 0;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (b[m] <= t) lo = m; else hi = m - 1; }
    const b1 = b[lo + 1] ?? b[lo] + 60 / this.analysis.bpm;
    return clamp((t - b[lo]) / (b1 - b[lo]));
  }

  // Music-warped clock: real seconds plus a surge right after every beat.
  musicTime(t) {
    const p = this.beatPhaseAt(t);
    return t + (60 / this.analysis.bpm) * 0.6 * (easeOutCubic(p) - p);
  }

  async plan(onProgress = () => {}) {
    const { analysis: A, style: S, library } = this;
    const rnd = mulberry32(this.seed ^ 0x9e3779b9);
    const paintOK = !!this.painting;
    const lyricText = (a, b) => this.lyrics.filter((l) => l.end > a && l.start < b).map((l) => l.text).join(' ');
    // A small set of paintings for this song keeps build time down.
    const allIds = Object.keys(PAINTINGS);
    const nPaint = clamp(Math.round(1 + (S.scenes.painting + S.scenes.paintAscii) * 0.6), 2, 5);
    const songPaintings = [];
    while (songPaintings.length < nPaint) {
      const id = rnd.pick(allIds);
      if (!songPaintings.includes(id)) songPaintings.push(id);
    }
    const firstLyric = this.lyrics.length ? this.lyrics[0].start : Infinity;
    const recentSlugs = new Set();
    const segs = [];
    let prevKind = null, sameRun = 0;

    for (const sec of A.sections) {
      const I = sec.intensity;
      const barsPerCut = Math.max(1, I > 0.72 ? Math.round(S.cutBars / 2) : I > 0.4 ? S.cutBars : S.cutBars * 2);
      const barLen = 240 / A.bpm;
      // keep cuts between ~1.5 s and ~16 s whatever the tempo
      const step = clamp(barsPerCut, Math.ceil(1.5 / barLen), Math.max(1, Math.floor(16 / barLen)));
      for (let b = sec.startBar; b < sec.endBar; b += step) {
        const start = A.bars[b];
        const end = A.bars[Math.min(b + step, sec.endBar)] ?? A.duration;
        if (end - start < 0.4) {
          if (segs.length) segs[segs.length - 1].end = end;
          continue;
        }
        const text = lyricText(start, end);
        let kind = null;
        const params = {};
        // Intro: the title in big ASCII lettering until the vocals come in.
        if (!segs.length && this.title && start < firstLyric) {
          kind = paintOK && S.scenes.painting > 2.5 ? 'painting' : 'asciiText';
        }
        // Lyric-driven picks: words in the line summon matching art.
        if (!kind && text) {
          const pid = library.matchPainting(text);
          if (pid && paintOK && rnd() < 0.55 * clamp((S.scenes.painting + S.scenes.paintAscii) / 3, 0.25, 1.2)) {
            kind = I > 0.6 && rnd() < 0.6 ? 'paintAscii' : 'painting';
            params.id = pid;
          } else {
            const hits = library.matchPieces(text).filter((p) => !recentSlugs.has(p.slug)).slice(0, 4);
            if (hits.length && rnd() < 0.7 * clamp(S.scenes.piece / 2.5, 0.4, 1.2)) {
              kind = 'piece';
              params.slug = rnd.pick(hits).slug;
              params.matched = true;
            }
          }
        }
        if (this.forceKind && this.forceKind !== 'auto') {
          kind = this.forceKind === 'paintings' ? rnd.pick([...PAINTERS, ...(paintOK ? ['painting'] : [])])
            : this.forceKind === 'painters' ? rnd.pick([...PAINTERS]) : this.forceKind;
          if (PAINT_KINDS.has(kind) && !paintOK) kind = 'oil';
          if (kind !== 'piece') delete params.slug;
          if (!PAINT_KINDS.has(kind)) delete params.id;
        }
        if (!kind) {
          const entries = Object.entries(S.scenes)
            .filter(([k]) => (paintOK || !PAINT_KINDS.has(k)))
            .map(([k, w]) => [k, w * Math.max(0.05, SUIT[k](I)) * (k === prevKind ? (sameRun >= 1 ? 0.15 : 1.4) : 1)]);
          kind = rnd.weighted(entries);
        }
        if (kind === 'piece' && !params.slug) {
          const p = library.pickPiece(rnd, S.key, recentSlugs);
          params.slug = p.slug;
        }
        if (kind === 'piece') {
          recentSlugs.add(params.slug);
          if (recentSlugs.size > 12) recentSlugs.delete(recentSlugs.values().next().value);
          params.look = rnd.pick(S.looks);
          params.altLook = rnd.pick(S.looks.filter((l) => l !== params.look)) || 'blocks';
          params.colorMode = rnd.pick(S.colorModes);
          params.offset = rnd() * 30;
        }
        if (PAINT_KINDS.has(kind) && !params.id) params.id = rnd.pick(songPaintings);
        if (PAINTERS.has(kind)) params.subject = subjectFor(text || this.title, rnd);
        sameRun = kind === prevKind ? sameRun + 1 : 0;
        prevKind = kind;
        segs.push({ start, end, kind, params, section: sec.index, intensity: I, seed: Math.floor(rnd() * 1e9) });
      }
    }
    if (segs.length) { segs[0].start = 0; segs[segs.length - 1].end = A.duration + 1; }
    this.segments = segs;

    // Load everything the plan needs.
    const slugs = [...new Set(segs.filter((s) => s.kind === 'piece').map((s) => s.params.slug))];
    const ids = [...new Set(segs.filter((s) => PAINT_KINDS.has(s.kind)).map((s) => s.params.id))];
    const total = slugs.length + ids.length * 4 + 1;
    let done = 0;
    for (const slug of slugs) {
      try {
        await this.pieces.load(slug);
      } catch (e) {
        console.warn('piece failed to load, swapping', slug, e);
        for (const s of segs) if (s.params.slug === slug) { s.kind = 'asciiTunnel'; }
      }
      onProgress(++done / total, `ASCII: ${slug}`);
    }
    if (ids.length) {
      await this.painting.build(ids, (p, id) => onProgress((done + p * ids.length * 4) / total, id ? `PAINTING: ${PAINTINGS[id].title}` : ''));
      const paintSegs = segs.filter((s) => PAINT_KINDS.has(s.kind)).map((s) => ({ start: s.start, end: s.end, id: s.params.id, calm: s.intensity < 0.5 }));
      this.painting.setSegments(paintSegs, { beatPhase: (t) => this.beatPhaseAt(t) }, mulberry32(this.seed ^ 0xabc));
    }
    onProgress(1, '');
    return segs;
  }

  segmentAt(t) {
    const s = this.segments;
    let i = Math.max(0, this.segIndex);
    if (!s[i] || t < s[i].start) i = 0;
    while (i < s.length - 1 && t >= s[i].end) i++;
    return i;
  }

  instance(i) {
    if (this.instances.has(i)) return this.instances.get(i);
    const seg = this.segments[i];
    const C = SCENE_CLASSES[seg.kind];
    const inst = C ? new C(this.w, this.h, this.style, mulberry32(seg.seed), seg.params) : null;
    // keep at most a few live scenes around
    if (this.instances.size > 3) this.instances.delete(this.instances.keys().next().value);
    this.instances.set(i, inst);
    return inst;
  }

  // audio: { bands, spectrum, wave(Float32 -1..1) }
  render(g, t, dt, audio) {
    const S = this.style;
    const tl = this.timeline.at(t);
    const ev = tl.events;
    this.pulse = ev.beat ? 1 : this.pulse * Math.exp(-dt * 7);
    this.hit = Math.max(this.hit * Math.exp(-dt * 9), ev.hit);
    const i = this.segmentAt(t);
    if (i !== this.segIndex) {
      if (this.segIndex >= 0) this.cutFlash = 1;
      this.segIndex = i;
      this.segStartFrameT = t;
    }
    this.cutFlash *= Math.exp(-dt * 10);
    const seg = this.segments[i];
    const lyric = lyricAt(this.lyrics, t);
    if (lyric) this.lastKeyword = keywordOf(lyric.text);
    const f = {
      t, dt, w: this.w, h: this.h,
      mt: this.musicTime(t),
      bpm: this.analysis.bpm,
      beat: {
        index: Math.max(0, tl.beatIndex), phase: tl.beatPhase, bar: tl.bar, barPhase: tl.barPhase,
        onBeat: ev.beat, onDownbeat: ev.downbeat,
      },
      pulse: this.pulse, hit: this.hit,
      energy: tl.energy,
      bass: Math.max(audio.bands.bass, tl.low * 0.8),
      mid: audio.bands.mid,
      high: Math.max(audio.bands.high, tl.high * 0.7),
      spectrum: audio.spectrum, wave: audio.wave,
      section: tl.section,
      lyric,
      keyword: this.lastKeyword || this.title || '',
      title: this.title,
      sceneKind: seg.kind,
      seg,
      segT: t - seg.start,
      styleLabel: S.label,
    };
    g.save();
    this.drawScene(g, f, seg, i);
    g.restore();
    // lyrics (the intro title card already shows the title)
    if (lyric) this.typeLayer.draw(g, f);
    drawHUD(g, f, S, S.fx.hud ?? (['cyber', 'vapor', 'hiphop'].includes(S.key) ? 0.9 : 0));
    this.drawCredits(g, f);
    return this.postParams(f, seg);
  }

  // Loud passages get a one-beat insert of a contrasting visual at the end of
  // every phrase (the last beat of each 2-bar group), like a stutter edit.
  insertFor(f, seg) {
    const S = this.style;
    if (seg.intensity < 0.72 || S.fx.strobe < 0.3 || f.segT < 1) return null;
    if (f.beat.index % 8 !== 7) return null;
    if (!this.insert) {
      const kind = ['asciiTunnel', 'geoPulse', 'asciiSpectrum'].sort((a, b) => S.scenes[b] - S.scenes[a])[0];
      this.insert = new SCENE_CLASSES[kind](this.w, this.h, S, mulberry32(this.seed ^ 0x1234));
    }
    return this.insert;
  }

  drawScene(g, f, seg, i) {
    const S = this.style;
    const ins = seg.kind !== 'asciiText' && this.insertFor(f, seg);
    if (ins) { ins.draw(g, f); return; }
    if (seg.kind === 'piece') {
      g.fillStyle = rgbToCss(S.bg);
      g.fillRect(0, 0, f.w, f.h);
      const p = seg.params;
      const look = f.hit > 0.65 ? p.altLook : p.look;
      const ok = this.pieces.draw(g, f.w, f.h, {
        slug: p.slug, t: p.offset + f.mt * (0.8 + f.energy * 0.5), look, colorMode: p.colorMode, style: S,
        zoom: 1 + f.pulse * 0.035 + clamp(f.segT / 20) * 0.08,
        dx: f.hit > 0.5 ? (Math.random() - 0.5) * 16 * f.hit : 0,
      });
      if (ok) return;
    }
    if (PAINT_KINDS.has(seg.kind)) {
      const sway = Math.sin(f.mt * 0.4) * 18;
      const cam = {
        x: sway, y: 0,
        dolly: f.pulse * 0.012 + (f.beat.onDownbeat ? 0.01 : 0),
        zoom: 1 + f.pulse * (0.012 + seg.intensity * 0.02) + f.hit * 0.02,
        roll: (f.hit > 0.6 ? 0.006 : 0) * (f.beat.index % 2 ? 1 : -1),
      };
      const canvas = this.painting.render(f.t, cam);
      if (seg.kind === 'painting') {
        const pw = canvas.width, ph = canvas.height;
        const s = Math.max(f.w / pw, f.h / ph);
        const sw = f.w / s, sh = f.h / s;
        g.drawImage(canvas, (pw - sw) / 2, (ph - sh) / 2, sw, sh, 0, 0, f.w, f.h);
        return;
      }
      this.instance(i).draw(g, f, canvas);
      return;
    }
    const inst = this.instance(i);
    if (inst) inst.draw(g, f);
  }

  drawCredits(g, f) {
    const show = f.t < 7 && !(f.sceneKind === 'asciiText' && !f.lyric);
    const end = this.analysis.duration - f.t;
    const S = this.style;
    if (show && (this.title || this.artist)) {
      const a = clamp(Math.min(f.t / 0.8, (7 - f.t) / 1));
      const m = Math.min(f.w, f.h);
      g.save();
      g.globalAlpha = a;
      g.fillStyle = rgbToCss(S.fg);
      g.textBaseline = 'alphabetic';
      g.font = `900 ${m * 0.065}px ${S.font.display}`;
      g.fillText(this.title || '', m * 0.06, f.h - m * 0.11);
      g.font = `500 ${m * 0.024}px "JetBrains Mono", monospace`;
      g.fillStyle = rgbToCss(S.colors[0]);
      g.fillText((this.artist || '').toUpperCase(), m * 0.062, f.h - m * 0.065);
      g.restore();
    }
    if (end < 2.5) {
      g.fillStyle = `rgba(0,0,0,${clamp(1 - end / 2.5)})`;
      g.fillRect(0, 0, f.w, f.h);
    }
  }

  postParams(f, seg) {
    const fx = this.style.fx;
    const I = f.section.intensity;
    const downFlash = I > 0.7 && f.beat.index % 4 === 0 && f.beat.phase < 0.08 ? 0.3 : 0;
    return {
      rgb: fx.rgb * (0.15 + f.pulse * 0.6 + f.hit * 1.5 + this.cutFlash * 2.5),
      glitch: fx.glitch * clamp(f.hit * 0.9 + this.cutFlash * 1.2),
      feedback: clamp(fx.feedback * (TRAIL[seg.kind] ?? 0.5) * (0.6 + 0.6 * f.energy), 0, 0.9),
      zoom: 0.004 + f.pulse * 0.012,
      rot: 0.003 * Math.sin(f.t * 0.5),
      bloom: fx.bloom * (0.5 + 0.5 * f.energy),
      flash: fx.strobe * (downFlash + this.cutFlash * 0.12),
      invert: fx.strobe > 0.8 && f.hit > 0.85 && I > 0.75 ? 1 : 0,
      scan: fx.scan,
      grain: fx.grain,
      vig: fx.vignette,
    };
  }
}

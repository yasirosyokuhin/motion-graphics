// Ink-wash paintings from shanshui (vendor/shanshui), driven by the music:
// the shot list comes from the director, scene time surges on every beat,
// and the camera punches in on downbeats.

import { Engine } from '../../vendor/shanshui/src/engine/engine.js';
import { Film } from '../../vendor/shanshui/src/film.js';
import { SCENES } from '../../vendor/shanshui/src/scenes/index.js';
import { clamp, easeOutCubic } from '../util.js';

// Shanshui's own seams between paintings (see vendor/shanshui/src/transitions).
const SEAMS = ['mist', 'cloudrise', 'wind', 'scroll', 'dusk', 'snow'];
// Scenes are authored for local time [-3, 14].
const LOCAL_SPAN = 13;

class MusicFilm extends Film {
  constructor(engine, opts, cache, clock) {
    super(engine, opts);
    this.clock = clock;
    this.cam = null;
    this.shots.forEach((s) => { if (s.scene !== '@paper') this.built.set(s.index, cache.get(s.scene)); });
  }

  // Everything is built up front; never dispose mid-song.
  async prepare() {}

  localT(shot, T) {
    const span = Math.max(1, (shot.until ?? T + 10) - shot.start);
    const rate = clamp(LOCAL_SPAN / span, 0.35, 1);
    const p = this.clock.beatPhase(T);
    // Motion speeds up right after each beat and settles before the next one.
    const surge = 0.35 * (easeOutCubic(p) - p);
    return clamp((T - shot.start) * rate + surge * rate, -3, 14);
  }

  renderShot(shot, T, raw, graded, camAdd) {
    const c = this.cam;
    if (!c) return super.renderShot(shot, T, raw, graded, camAdd);
    const a = camAdd || {};
    return super.renderShot(shot, T, raw, graded, {
      x: (a.x || 0) + c.x, y: (a.y || 0) + c.y, dolly: (a.dolly || 0) + c.dolly,
      zoom: (a.zoom ?? 1) * c.zoom, roll: (a.roll || 0) + c.roll,
    });
  }
}

export class PaintingLayer {
  constructor({ scale = 0.5 } = {}) {
    this.canvas = document.createElement('canvas');
    this.engine = new Engine(this.canvas, { scale });
    this.cache = new Map();
    this.film = null;
  }

  static supported() {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch (_) {
      return false;
    }
  }

  async build(ids, onProgress = () => {}) {
    let i = 0;
    for (const id of ids) {
      if (!this.cache.has(id)) {
        onProgress(i / ids.length, id);
        await new Promise((r) => setTimeout(r, 0));
        const mod = await SCENES[id]();
        this.cache.set(id, await this.engine.buildScene(mod, {}));
      }
      i++;
    }
    onProgress(1);
  }

  // segments: [{start, end, id, calm}] in song order (painting segments only).
  setSegments(segments, clock, rnd) {
    const shots = [{ scene: '@paper', start: -10 }];
    let prevEnd = -1;
    for (const s of segments) {
      const adjacent = Math.abs(s.start - prevEnd) < 0.05;
      if (adjacent) {
        const dur = Math.min(2.2, (s.end - s.start) * 0.4);
        shots.push({ scene: s.id, start: s.start - dur / 2, until: s.end, in: { type: rnd.pick(SEAMS), dur } });
      } else {
        // A painting arriving from another kind of visual paints itself in from bare paper.
        const dur = s.calm ? Math.min(3, (s.end - s.start) * 0.35) : 0.6;
        shots.push({ scene: '@paper', start: s.start - 0.02 });
        shots.push({ scene: s.id, start: s.start, until: s.end, in: { type: 'bloom', dur } });
      }
      prevEnd = s.end;
    }
    this.film = new MusicFilm(this.engine, { shots, overlays: [], duration: 1e6 }, this.cache, clock);
  }

  render(T, cam) {
    if (!this.film) return null;
    this.film.cam = cam;
    this.film.renderAt(T);
    return this.canvas;
  }
}

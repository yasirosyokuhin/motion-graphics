// The hand that paints with the ink simulation: it drops water and ink where
// the picture still needs it (dark, unpainted areas first), steady with the
// groove, a heavier drop on every beat and a large bloom on each downbeat.

import { clamp } from '../util.js';
import { sharedInkSim } from '../gl/inksim.js';

const PARAMS = {
  sumi: { mode: 0, evap: 0.0035, diffusion: 0.95, flow: 0.35, pull: 0.035, deposit: 0.012, free: 0, paper: [0.94, 0.915, 0.86] },
  water: { mode: 1, evap: 0.0045, diffusion: 0.9, flow: 0.4, pull: 0.06, deposit: 0.016, free: 0, paper: [0.975, 0.965, 0.935] },
};

export class InkWash {
  constructor(w, h, rnd, kind = 'sumi') {
    this.w = w; this.h = h; this.rnd = rnd;
    this.P = PARAMS[kind];
    this.sim = sharedInkSim(w, h);
    this.gw = 48;
    this.gh = Math.max(8, Math.round((48 * h) / w));
    this.cov = new Float32Array(this.gw * this.gh);
    this.imp = new Float32Array(this.gw * this.gh);
    this.small = document.createElement('canvas');
    this.small.width = this.gw; this.small.height = this.gh;
    this.sctx = this.small.getContext('2d', { willReadFrequently: true });
    this.acc = 0;
    this.lastImp = -1;
  }

  importance(src) {
    this.sctx.drawImage(src, 0, 0, this.gw, this.gh);
    const d = this.sctx.getImageData(0, 0, this.gw, this.gh).data;
    for (let i = 0; i < this.imp.length; i++) {
      const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      this.imp[i] = this.P.mode === 0 ? clamp((0.9 - l) * 1.45) : clamp((1 - l) * 0.85 + sat * 0.55);
    }
  }

  // A spot that still needs paint, weighted by how dark the picture is there.
  pick() {
    let total = 0;
    for (let i = 0; i < this.imp.length; i++) total += this.imp[i] * (1 - this.cov[i]) ** 2 + 0.004;
    let r = this.rnd() * total;
    for (let i = 0; i < this.imp.length; i++) {
      r -= this.imp[i] * (1 - this.cov[i]) ** 2 + 0.004;
      if (r <= 0) return [((i % this.gw) + this.rnd()) / this.gw, (Math.floor(i / this.gw) + this.rnd()) / this.gh];
    }
    return [this.rnd(), this.rnd()];
  }

  drop(r, water, ink, at) {
    const [x, y] = at || this.pick();
    this.sim.drop(x, y, r, water, ink, this.rnd() * 100);
    // mark the neighbourhood as painted
    const rx = Math.ceil(r * 2.2 * this.gh * (this.w / this.h)), ry = Math.ceil(r * 2.2 * this.gh);
    const cx = Math.floor(x * this.gw), cy = Math.floor(y * this.gh);
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      const gx = cx + i, gy = cy + j;
      if (gx < 0 || gy < 0 || gx >= this.gw || gy >= this.gh) continue;
      const k = 1 - Math.hypot(i / (rx + 1), j / (ry + 1));
      if (k > 0) this.cov[gy * this.gw + gx] = Math.min(1, this.cov[gy * this.gw + gx] + k * 0.9);
    }
  }

  paint(f, src) {
    const sim = this.sim;
    if (sim.owner !== this) {
      // a new painting starts on a clean, dry sheet
      sim.reset();
      sim.owner = this;
      this.cov.fill(0);
      this.lastImp = -1;
    }
    sim.setTarget(src);
    if (f.t - this.lastImp > 0.4 || this.lastImp < 0 || f.t < this.lastImp) { this.importance(src); this.lastImp = f.t; }
    const dt = Math.min(0.1, f.dt);
    // once the sheet is mostly painted, let old areas be re-wetted so it keeps breathing
    let mean = 0;
    for (const c of this.cov) mean += c;
    mean /= this.cov.length;
    if (mean > 0.6) for (let i = 0; i < this.cov.length; i++) this.cov[i] *= 1 - dt * 0.15;
    const start = f.segT < 2.5 ? 6 : 0;
    this.acc += dt * (2.5 + f.energy * 9 + start);
    while (this.acc >= 1) { this.acc -= 1; this.drop(0.03 + this.rnd() * 0.04, 0.7, 0.45); }
    if (f.beat.onBeat) this.drop(0.05 + this.rnd() * 0.04, 1.0, 0.65);
    if (f.beat.onDownbeat) this.drop(0.11 + this.rnd() * 0.08 + f.section.intensity * 0.04, 1.5, 0.9);
    if (f.hit > 0.75) for (let i = 0; i < 5; i++) this.drop(0.01 + this.rnd() * 0.015, 0.4, 1.0);
    const iters = Math.round(clamp(dt * 60 * 4, 2, 8));
    sim.advance(iters, this.P);
    return sim.draw(this.P.mode, this.P.paper);
  }
}

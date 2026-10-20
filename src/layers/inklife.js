// Animated ink drawn over the shanshui paintings so they never sit still:
// a flapping flock, falling snow / maple / bamboo leaves, drifting mist,
// fireflies, rain, and ink blots that burst open on the accents.

import { clamp, rgbToCss } from '../util.js';
import { Flock, Drift } from './living.js';

const TAU = Math.PI * 2;

// What lives in each painting (vendor/shanshui scene ids).
const CAST = {
  s01: { birds: 9, drift: null, mist: 3 },
  s02: { birds: 7, drift: 'leaf', leaf: '#b8862b', mist: 2 },
  s03: { birds: 4, drift: null, fireflies: 40, mist: 2 },
  s04: { birds: 8, drift: null, mist: 4 },
  s05: { birds: 6, drift: 'petal', leaf: '#c0392b', mist: 2 },
  s06: { birds: 3, drift: 'snow', leaf: '#ffffff', mist: 2 },
  s07: { birds: 4, drift: 'leaf', leaf: '#2f4a2a', mist: 3 },
  s08: { birds: 5, drift: 'snow', leaf: '#f4f1ea', mist: 4 },
  s09: { birds: 8, drift: null, mist: 5 },
  s10: { birds: 4, drift: 'leaf', leaf: '#b5332a', mist: 2 },
};

export class InkLife {
  constructor(w, h, rnd, id) {
    this.w = w; this.h = h; this.rnd = rnd;
    this.cast = CAST[id] || CAST.s01;
    this.k = w / 320; // living.js particles are tuned for a 320 px wide picture
    this.flock = new Flock(rnd, this.cast.birds, 320, Math.round(320 * h / w), [0.08, 0.4]);
    this.drift = this.cast.drift ? new Drift(rnd, 70, 320, Math.round(320 * h / w), this.cast.drift) : null;
    this.mist = Array.from({ length: this.cast.mist }, () => ({ x: rnd() * w, y: h * (0.35 + rnd() * 0.5), r: w * (0.25 + rnd() * 0.3), v: 0.5 + rnd() }));
    this.flies = Array.from({ length: this.cast.fireflies || 0 }, () => ({ x: rnd() * w, y: h * (0.5 + rnd() * 0.45), p: rnd() * TAU }));
    this.blots = [];
    this.rain = new Drift(rnd, 120, 320, Math.round(320 * h / w), 'rain');
  }

  blot(f) {
    const r = this.rnd;
    const n = 14 + Math.floor(r() * 10);
    this.blots.push({
      x: f.w * (0.15 + r() * 0.7), y: f.h * (0.15 + r() * 0.7), t: 0, R: Math.min(f.w, f.h) * (0.05 + f.hit * 0.08),
      rays: Array.from({ length: n }, () => ({ a: r() * TAU, l: 1.2 + r() * 2.2, s: 0.08 + r() * 0.12 })),
      seed: r() * 100,
    });
  }

  draw(g, f) {
    const dt = Math.min(0.05, f.dt), k = this.k;
    // mist banks drift through the valleys
    for (const m of this.mist) {
      m.x += (20 + f.energy * 70) * m.v * dt * k;
      if (m.x - m.r > f.w) m.x = -m.r;
      const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
      gr.addColorStop(0, 'rgba(244,240,232,0.55)');
      gr.addColorStop(1, 'rgba(244,240,232,0)');
      g.save(); g.translate(m.x, m.y); g.scale(1, 0.22); g.translate(-m.x, -m.y);
      g.fillStyle = gr; g.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      g.restore();
    }
    g.save();
    g.scale(k, k);
    // the flock flaps on the beat
    this.flock.update(dt, 22 + f.energy * 30, f.beat.phase);
    this.flock.draw(g, 'rgba(24,22,20,0.9)', 1.1);
    if (this.drift) {
      this.drift.update(dt, 12 + f.energy * 40 + f.pulse * 30, this.cast.drift === 'snow' ? 18 + f.energy * 14 : 14);
      if (this.cast.drift === 'snow') { g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 2; }
      this.drift.draw(g, this.cast.leaf, 1.3);
      g.shadowBlur = 0;
    }
    if (f.section.intensity > 0.75) {
      this.rain.update(dt, -20, 200 + f.energy * 100);
      this.rain.draw(g, 'rgba(30,30,34,0.35)');
    }
    g.restore();
    for (const q of this.flies) {
      const x = q.x + Math.sin(f.mt * 0.7 + q.p) * 20, y = q.y + Math.cos(f.mt * 0.9 + q.p) * 12;
      const a = clamp(0.3 + 0.5 * Math.sin(f.mt * 4 + q.p) + f.pulse * 0.4);
      const gr = g.createRadialGradient(x, y, 0, x, y, 10 * k);
      gr.addColorStop(0, `rgba(255,220,120,${a})`); gr.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = gr; g.fillRect(x - 10 * k, y - 10 * k, 20 * k, 20 * k);
    }
    // ink bursts open on the accents and seep away
    if (f.hit > 0.6 && (!this.lastBlot || f.t - this.lastBlot > 0.4)) { this.blot(f); this.lastBlot = f.t; }
    for (const b of this.blots) {
      b.t += dt;
      const grow = 1 - Math.pow(1 - clamp(b.t / 0.35), 3);
      const fade = clamp(1 - (b.t - 0.6) / 1.4);
      g.fillStyle = `rgba(16,15,14,${0.85 * fade})`;
      g.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * TAU;
        const rr = b.R * grow * (0.75 + 0.35 * Math.sin(a * 5 + b.seed) * Math.sin(a * 3 + b.seed * 2));
        const x = b.x + Math.cos(a) * rr, y = b.y + Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.fill();
      for (const r of b.rays) {
        const d = b.R * r.l * grow;
        g.beginPath(); g.arc(b.x + Math.cos(r.a) * d, b.y + Math.sin(r.a) * d, b.R * r.s * grow, 0, TAU); g.fill();
      }
    }
    this.blots = this.blots.filter((b) => b.t < 2.1);
  }
}

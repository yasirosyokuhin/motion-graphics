// Living scenes: small animated pictures full of moving things (rising moon,
// crashing waves, flocks, traffic, blooming flowers). They are redrawn every
// frame at low resolution; the painters then render them in a brush style.

import { clamp, lerp, makeNoise } from '../util.js';

const TAU = Math.PI * 2;

// A gull / crane silhouette with wings flapping at phase p (0..1).
export function bird(g, x, y, s, p, dir = 1) {
  const flap = Math.sin(p * TAU);
  g.beginPath();
  g.moveTo(x - s * dir, y - s * 0.6 * flap);
  g.quadraticCurveTo(x - s * 0.4 * dir, y - s * 0.2 - s * 0.3 * flap, x, y);
  g.quadraticCurveTo(x + s * 0.4 * dir, y - s * 0.2 - s * 0.3 * flap, x + s * dir, y - s * 0.6 * flap);
  g.stroke();
}

export class Flock {
  constructor(rnd, n, W, H, band = [0.1, 0.45]) {
    this.rnd = rnd; this.W = W; this.H = H; this.band = band;
    this.birds = [];
    this.spawn(n);
  }
  spawn(n) {
    const dir = this.rnd() < 0.5 ? 1 : -1;
    const y0 = this.H * lerp(this.band[0], this.band[1], this.rnd());
    const x0 = dir > 0 ? -20 : this.W + 20;
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      this.birds.push({ x: x0 - dir * row * 7, y: y0 + side * row * 4 + (this.rnd() - 0.5) * 2, dir, p: this.rnd(), s: 2.2 + this.rnd() * 1.2 });
    }
  }
  update(dt, speed, beatPhase) {
    for (const b of this.birds) {
      b.x += b.dir * speed * dt;
      b.y += Math.sin(b.x * 0.05 + b.p * 6) * 4 * dt;
      b.ph = (beatPhase * 2 + b.p * 0.3) % 1;
    }
    this.birds = this.birds.filter((b) => b.x > -60 && b.x < this.W + 60);
    if (!this.birds.length) this.spawn(5 + Math.floor(this.rnd() * 8));
  }
  draw(g, color, scale = 1) {
    g.strokeStyle = color;
    g.lineWidth = 1.2 * scale;
    for (const b of this.birds) bird(g, b.x, b.y, b.s * scale, b.ph ?? 0, b.dir);
  }
}

// Falling / blowing particles: snow, petals, leaves, rain, sparks.
export class Drift {
  constructor(rnd, n, W, H, kind) {
    this.rnd = rnd; this.W = W; this.H = H; this.kind = kind;
    this.p = Array.from({ length: n }, () => this.make(true));
  }
  make(any) {
    const r = this.rnd;
    return { x: r() * this.W * 1.2 - this.W * 0.1, y: any ? r() * this.H : -5, s: 0.6 + r() * 1.4, a: r() * TAU, v: 0.6 + r() * 0.8 };
  }
  update(dt, wind, fall) {
    for (const q of this.p) {
      q.x += (wind * q.v + Math.sin(q.a) * 8) * dt;
      q.y += fall * q.v * dt;
      q.a += dt * (1 + q.v);
      if (q.y > this.H + 5 || q.x > this.W + 10 || q.x < -10) Object.assign(q, this.make(false), this.kind === 'petal' && wind > 0 ? { x: -5, y: this.rnd() * this.H } : {});
    }
  }
  draw(g, color, scale = 1) {
    g.fillStyle = color;
    g.strokeStyle = color;
    for (const q of this.p) {
      const s = q.s * scale;
      if (this.kind === 'rain') { g.lineWidth = 0.6 * scale; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - 1.5 * scale, q.y + 6 * s); g.stroke(); continue; }
      g.save();
      g.translate(q.x, q.y);
      g.rotate(q.a);
      if (this.kind === 'snow') { g.beginPath(); g.arc(0, 0, s * 0.8, 0, TAU); g.fill(); }
      else if (this.kind === 'leaf') { g.beginPath(); g.ellipse(0, 0, s * 2.2, s * 0.9, 0, 0, TAU); g.fill(); }
      else { g.beginPath(); g.ellipse(0, 0, s * 1.4, s * 0.8 * Math.abs(Math.cos(q.a * 2)) + 0.2, 0, 0, TAU); g.fill(); }
      g.restore();
    }
  }
}

export const SUBJECTS = ['night', 'sunset', 'mountains', 'flowers', 'city', 'wave', 'starry'];

export class Composition {
  constructor(subject, w, h, rnd, res = 320) {
    this.subject = subject;
    this.w = w; this.h = h;
    this.cw = res;
    this.ch = Math.round((res * h) / w);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cw; this.canvas.height = this.ch;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.noise = makeNoise(Math.floor(rnd() * 1e9));
    this.rnd = rnd;
    const W = this.cw, H = this.ch;
    this.stars = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * H * 0.6, r: 0.5 + rnd() * 1.3, p: rnd() * TAU }));
    this.big = Array.from({ length: 9 }, () => ({ x: rnd() * W, y: rnd() * H * 0.5, r: 2 + rnd() * 4, p: rnd() * TAU }));
    this.clouds = Array.from({ length: 6 }, (_, i) => ({ x: rnd() * W, y: H * (0.08 + rnd() * 0.35), w: 30 + rnd() * 50, v: 4 + rnd() * 8, k: i }));
    this.flock = new Flock(rnd, 7, W, H);
    this.fireflies = Array.from({ length: 34 }, () => ({ x: rnd() * W, y: H * (0.55 + rnd() * 0.4), p: rnd() * TAU }));
    this.flowers = Array.from({ length: 170 }, () => ({ x: rnd() * W, y: H * (0.6 + rnd() * 0.4), c: rnd.pick(['#e63946', '#ffd166', '#ffffff', '#9b5de5', '#f4a261', '#ff8fab']), p: rnd() * TAU, born: -1 }));
    this.flowers.sort((a, b) => a.y - b.y);
    this.butterflies = Array.from({ length: 5 }, () => ({ x: rnd() * W, y: H * (0.3 + rnd() * 0.4), p: rnd() * TAU, c: rnd.pick(['#ffd166', '#ffffff', '#ff8fab']) }));
    this.petals = new Drift(rnd, 60, W, H, 'petal');
    this.rain = new Drift(rnd, 140, W, H, 'rain');
    this.buildings = [];
    for (let x = -5; x < W; ) {
      const bw = 10 + rnd() * 26;
      this.buildings.push({ x, w: bw, h: H * (0.2 + rnd() * 0.45), seed: Math.floor(rnd() * 1e6), sign: rnd() < 0.25 });
      x += bw + rnd() * 3;
    }
    this.cars = Array.from({ length: 14 }, (_, i) => ({ x: rnd() * W, lane: i % 2, v: 30 + rnd() * 40 }));
    this.train = null;
    this.spray = [];
    this.shoot = null;
    this.flash = 0;
    this.boat = { x: rnd() * W };
    this.data = null;
    // where the sky ends (fraction of height) and what glows, for the painters
    this.horizon = { night: 0.66, sunset: 0.62, mountains: 0.42, flowers: 0.58, city: 0.3, wave: 0.5, starry: 0.72 }[subject] ?? 0.6;
    this.lights = [];
  }

  ridge(y0, amp, scale, seed, sway = 0) {
    const g = this.ctx, W = this.cw, H = this.ch;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 2) g.lineTo(x, y0 - this.noise.fbm(x * scale + seed, seed, sway, 4) * amp);
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  }

  grad(stops, y0 = 0, y1 = this.ch) {
    const gr = this.ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    return gr;
  }

  glow(x, y, r, color, a) {
    const g = this.ctx;
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    gr.addColorStop(0, color.replace('A', a));
    gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  cloud(c, color, edge) {
    const g = this.ctx;
    g.fillStyle = color;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.ellipse(c.x + k * c.w * 0.18, c.y + Math.sin(k * 1.7) * 2, c.w * 0.22, c.w * 0.09 + (k % 2) * 2, 0, 0, TAU);
      g.fill();
    }
    if (edge) { g.fillStyle = edge; g.fillRect(c.x, c.y + c.w * 0.07, c.w * 0.9, 1); }
  }

  moveClouds(dt, speed) {
    for (const c of this.clouds) {
      c.x += c.v * speed * dt;
      if (c.x > this.cw + 10) { c.x = -c.w - 10; c.y = this.ch * (0.08 + this.rnd() * 0.35); }
    }
  }

  shootingStar(f) {
    const W = this.cw, H = this.ch, g = this.ctx;
    if (!this.shoot && f.beat.onDownbeat && f.section.intensity > 0.35 && this.rnd() < 0.6) {
      this.shoot = { x: this.rnd() * W * 0.6, y: this.rnd() * H * 0.25, t: 0, dx: 1 + this.rnd(), dy: 0.5 + this.rnd() * 0.3 };
    }
    if (this.shoot) {
      const s = this.shoot;
      s.t += f.dt;
      const k = s.t / 0.7;
      const hx = s.x + s.dx * k * W * 0.5, hy = s.y + s.dy * k * W * 0.5;
      const tr = g.createLinearGradient(hx - s.dx * 30, hy - s.dy * 30, hx, hy);
      tr.addColorStop(0, 'rgba(255,255,255,0)');
      tr.addColorStop(1, `rgba(255,255,230,${1 - k})`);
      g.strokeStyle = tr; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(hx - s.dx * 30, hy - s.dy * 30); g.lineTo(hx, hy); g.stroke();
      if (k >= 1) this.shoot = null;
    }
  }

  update(f) {
    const g = this.ctx, W = this.cw, H = this.ch, m = Math.min(W, H);
    const t = f.mt, dt = Math.min(0.05, f.dt), pulse = f.pulse, bass = f.bass, energy = f.energy;
    const grow = clamp(f.segT / 16);
    g.globalAlpha = 1;
    g.lineCap = 'round';
    switch (this.subject) {
      case 'night': {
        const hy = H * 0.66;
        g.fillStyle = this.grad([[0, '#060f2a'], [1, '#2a4c86']], 0, hy); g.fillRect(0, 0, W, hy);
        for (const s of this.stars) { g.fillStyle = `rgba(255,250,220,${clamp(0.35 + 0.5 * Math.sin(t * 3 + s.p) + pulse * 0.35)})`; g.fillRect(s.x, s.y, s.r, s.r); }
        this.shootingStar(f);
        // the moon rises over the section
        const mx = W * (0.62 + grow * 0.1), my = lerp(hy - m * 0.05, H * 0.2, grow), mr = m * 0.085;
        this.glow(mx, my, mr * (3 + bass * 1.5), 'rgba(255,240,190,A)', 0.35 + bass * 0.35);
        g.fillStyle = '#fff4cf'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
        this.lights = [{ x: mx, y: my, r: mr }];
        this.moveClouds(dt, 1 + energy * 2);
        for (const c of this.clouds) this.cloud(c, 'rgba(40,60,100,0.85)', 'rgba(255,240,200,0.5)');
        this.flock.update(dt, 25 + energy * 30, f.beat.phase);
        this.flock.draw(g, '#0a1428');
        g.fillStyle = '#1b2f58'; this.ridge(hy - H * 0.05, H * 0.22, 0.012, 3);
        g.fillStyle = '#0c1830'; this.ridge(hy + 1, H * 0.12, 0.02, 9);
        g.fillStyle = this.grad([[0, '#17305c'], [1, '#081226']], hy, H); g.fillRect(0, hy, W, H - hy);
        for (let y = hy + 2; y < H; y += 3) {
          const k = (y - hy) / (H - hy), wv = Math.sin(y * 0.9 + t * 4) * (3 + k * 8);
          g.fillStyle = `rgba(255,240,200,${0.7 - k * 0.5})`;
          g.fillRect(mx - mr * (0.6 + k) + wv, y, mr * (1.2 + 2 * k) * (0.5 + 0.5 * Math.sin(y * 0.37 + t * 2)), 1.4);
        }
        // a lantern boat drifts across the lake
        this.boat.x = (this.boat.x + dt * (6 + energy * 6)) % (W + 40);
        const bx = this.boat.x - 20, by = hy + (H - hy) * 0.45 + Math.sin(t * 2) * 1.2;
        g.fillStyle = '#050a14'; g.beginPath(); g.moveTo(bx - 10, by); g.lineTo(bx + 10, by); g.lineTo(bx + 7, by + 3); g.lineTo(bx - 7, by + 3); g.fill();
        this.glow(bx + 3, by - 4, 5 + pulse * 3, 'rgba(255,190,90,A)', 0.9);
        for (const q of this.fireflies) {
          const x = q.x + Math.sin(t * 0.7 + q.p) * 6, y = q.y + Math.cos(t * 0.9 + q.p) * 4;
          this.glow(x, y, 2.5 + pulse * 2, 'rgba(255,240,120,A)', clamp(0.4 + 0.5 * Math.sin(t * 4 + q.p) + pulse * 0.4));
        }
        break;
      }
      case 'sunset': {
        const hy = H * 0.62;
        g.fillStyle = this.grad([[0, '#2d1b5e'], [0.55, '#ff6f61'], [1, '#ffc371']], 0, hy); g.fillRect(0, 0, W, hy);
        this.moveClouds(dt, 1 + energy);
        for (const c of this.clouds) { g.fillStyle = 'rgba(255,170,140,0.6)'; g.fillRect(c.x, c.y, c.w, 1.6); g.fillRect(c.x + 6, c.y + 3, c.w * 0.6, 1); }
        // the sun sinks into the sea over the section
        const sr = m * (0.12 + bass * 0.02), sx = W * 0.5, sy = lerp(H * 0.25, hy + sr * 0.3, grow);
        this.glow(sx, sy, sr * 3.2, 'rgba(255,220,150,A)', 0.55);
        g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
        this.lights = sy < hy ? [{ x: sx, y: sy, r: sr * 0.8 }] : [];
        this.flock.update(dt, 30 + energy * 40, f.beat.phase);
        this.flock.draw(g, '#3a1a3a');
        g.fillStyle = '#6b2f57'; this.ridge(hy + 1, H * 0.1, 0.015, 5);
        g.fillStyle = this.grad([[0, '#c0485e'], [1, '#2a163a']], hy, H); g.fillRect(0, hy, W, H - hy);
        // swells rolling toward the viewer
        for (let i = 0; i < 12; i++) {
          const z = ((i + t * 0.6) % 12) / 12, y = hy + (H - hy) * z * z;
          g.fillStyle = `rgba(255,200,170,${0.15 + z * 0.25})`;
          g.fillRect(0, y, W, 0.8 + z * 1.5);
        }
        for (let y = hy + 2; y < H; y += 2.5) {
          const k = (y - hy) / (H - hy);
          g.fillStyle = `rgba(255,225,160,${0.8 - k * 0.6})`;
          const wdt = sr * (0.6 + k * 2.2) * (0.6 + 0.4 * Math.sin(y * 0.5 + t * 3));
          g.fillRect(sx - wdt / 2 + Math.sin(y + t * 5) * 3, y, wdt, 1.2);
        }
        // a sailboat crosses, rocking on the swell
        this.boat.x = (this.boat.x + dt * (10 + energy * 10)) % (W + 40);
        const bx = this.boat.x - 20, by = hy + 10 + Math.sin(t * 2.5) * 1.5, rock = Math.sin(t * 2.5) * 0.12;
        g.save(); g.translate(bx, by); g.rotate(rock);
        g.fillStyle = '#2a1028'; g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.lineTo(6, 3); g.lineTo(-6, 3); g.fill();
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -16); g.lineTo(8, -2); g.fill();
        g.restore();
        break;
      }
      case 'mountains': {
        g.fillStyle = this.grad([[0, '#86b6e6'], [1, '#eaf3fb']]); g.fillRect(0, 0, W, H);
        this.moveClouds(dt, 1.5 + energy * 3);
        const layers = [['#a9bdd2', 0.42, 0.28], ['#7f9bb6', 0.55, 0.25], ['#4f7a6e', 0.7, 0.2], ['#2f5d3a', 0.86, 0.14]];
        layers.forEach(([c, y, a], i) => {
          g.fillStyle = c; this.ridge(H * y, H * a, 0.01 + i * 0.006, i * 11);
          // cloud banks stream through the valleys between ranges
          const band = H * (y + 0.02);
          for (let k = 0; k < 4; k++) {
            const x = ((k * 97 + t * (8 + i * 6) * (1 + energy)) % (W + 120)) - 60;
            g.fillStyle = `rgba(255,255,255,${0.55 - i * 0.08})`;
            g.beginPath(); g.ellipse(x, band, 40, 5 + i, 0, 0, TAU); g.fill();
          }
        });
        // a waterfall on the near cliff
        const wx = W * 0.7;
        for (let k = 0; k < 18; k++) {
          const y = H * 0.55 + ((k * 7 + t * 60) % (H * 0.3));
          g.fillStyle = 'rgba(240,250,255,0.85)';
          g.fillRect(wx + Math.sin(k) * 2, y, 3, 5);
        }
        this.glow(wx + 2, H * 0.86, 14 + pulse * 6, 'rgba(255,255,255,A)', 0.6);
        // an eagle circles
        const ea = t * 0.6;
        g.strokeStyle = '#1e2a20'; g.lineWidth = 1.4;
        bird(g, W * 0.35 + Math.cos(ea) * W * 0.15, H * 0.25 + Math.sin(ea) * H * 0.08, 5, (f.beat.phase + 0.2) % 1, Math.sin(ea) > 0 ? -1 : 1);
        // grass in the wind
        g.strokeStyle = '#3e6b2f'; g.lineWidth = 1;
        for (let x = 0; x < W; x += 3) {
          const sway = Math.sin(x * 0.1 + t * 3) * (2 + energy * 4) + pulse * 2;
          g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x, H - 6, x + sway, H - 10 - (x % 4)); g.stroke();
        }
        break;
      }
      case 'flowers': {
        g.fillStyle = this.grad([[0, '#7fb8f5'], [1, '#e6f4ff']], 0, H * 0.6); g.fillRect(0, 0, W, H * 0.6);
        this.moveClouds(dt, 1 + energy);
        for (const c of this.clouds) this.cloud(c, 'rgba(255,255,255,0.9)');
        g.fillStyle = '#7fae5a'; this.ridge(H * 0.6, H * 0.08, 0.01, 2);
        g.fillStyle = this.grad([[0, '#5c9a3d'], [1, '#2f6a24']], H * 0.58, H); g.fillRect(0, H * 0.62, W, H);
        // flowers open in waves on the beat
        if (f.beat.onBeat) {
          const n = 6 + Math.round(energy * 14);
          for (let i = 0, c = 0; i < this.flowers.length && c < n; i++) {
            const fl = this.flowers[Math.floor(this.rnd() * this.flowers.length)];
            if (fl.born < 0) { fl.born = f.t; c++; }
          }
        }
        g.strokeStyle = '#2f6a24'; g.lineWidth = 0.8;
        for (const fl of this.flowers) {
          const k = (fl.y - H * 0.58) / (H * 0.42);
          const sway = Math.sin(t * 2 + fl.p) * 2 * (1 + energy);
          const open = fl.born < 0 ? 0 : clamp((f.t - fl.born) / 0.4);
          g.beginPath(); g.moveTo(fl.x, fl.y + 3 + k * 4); g.lineTo(fl.x + sway, fl.y); g.stroke();
          if (!open) continue;
          const r = (1 + k * 4.5) * (0.3 + 0.7 * open) * (1 + pulse * 0.2);
          g.fillStyle = fl.c;
          for (let p = 0; p < 5; p++) { const a = p * 1.2566 + t * 0.5; g.beginPath(); g.arc(fl.x + sway + Math.cos(a) * r * 0.6, fl.y + Math.sin(a) * r * 0.6, r * 0.55, 0, TAU); g.fill(); }
          g.fillStyle = '#ffe680'; g.beginPath(); g.arc(fl.x + sway, fl.y, r * 0.3, 0, TAU); g.fill();
        }
        for (const b of this.butterflies) {
          b.x += Math.cos(t * 0.8 + b.p) * 20 * dt + 6 * dt; b.y += Math.sin(t * 1.3 + b.p) * 14 * dt;
          if (b.x > W + 5) b.x = -5;
          const wing = Math.abs(Math.sin(t * 14 + b.p)) * 3 + 0.5;
          g.fillStyle = b.c;
          g.beginPath(); g.ellipse(b.x - wing / 2, b.y, wing, 2.5, 0.3, 0, TAU); g.fill();
          g.beginPath(); g.ellipse(b.x + wing / 2, b.y, wing, 2.5, -0.3, 0, TAU); g.fill();
        }
        this.petals.update(dt, 25 + energy * 60, 10 + energy * 10);
        this.petals.draw(g, 'rgba(255,190,210,0.9)', 1.2);
        break;
      }
      case 'city': {
        const hy = H * 0.8;
        if (f.hit > 0.8 && f.section.intensity > 0.6) this.flash = 1;
        this.flash *= Math.exp(-dt * 12);
        g.fillStyle = this.grad([[0, '#1a0b3d'], [0.7, '#7a2a8c'], [1, '#ff5f8f']], 0, hy); g.fillRect(0, 0, W, hy);
        if (this.flash > 0.05) { g.fillStyle = `rgba(230,220,255,${this.flash * 0.8})`; g.fillRect(0, 0, W, hy); }
        // searchlights sweep the sky
        for (let i = 0; i < 3; i++) {
          const ox = W * (0.2 + i * 0.3), a = -Math.PI / 2 + Math.sin(t * (0.5 + i * 0.2) + i) * 0.6;
          g.fillStyle = 'rgba(200,220,255,0.12)';
          g.beginPath(); g.moveTo(ox, hy - H * 0.4); g.lineTo(ox + Math.cos(a - 0.05) * H, hy - H * 0.4 + Math.sin(a - 0.05) * H); g.lineTo(ox + Math.cos(a + 0.05) * H, hy - H * 0.4 + Math.sin(a + 0.05) * H); g.fill();
        }
        const tick = f.beat.index;
        for (const b of this.buildings) {
          g.fillStyle = '#120a26';
          g.fillRect(b.x, hy - b.h, b.w, b.h);
          for (let wy = hy - b.h + 3; wy < hy - 3; wy += 4) for (let wx = b.x + 2; wx < b.x + b.w - 2; wx += 4) {
            const hsh = Math.sin(wx * 12.9 + wy * 78.2 + b.seed + (tick % 9) * 0.37) * 43758.5;
            if (hsh - Math.floor(hsh) < 0.25 + energy * 0.3) { g.fillStyle = (b.seed % 5) ? '#ffd27f' : '#7fe8ff'; g.fillRect(wx, wy, 2, 2); }
          }
          if (b.sign && (Math.floor(t * 4 + b.seed) % 3 || f.pulse > 0.5)) { g.fillStyle = b.seed % 2 ? '#ff3c9d' : '#3cf5ff'; g.fillRect(b.x + 2, hy - b.h - 4, b.w - 4, 2.5); }
        }
        // elevated train on the downbeats
        if (!this.train && f.beat.onDownbeat && this.rnd() < 0.5) this.train = { x: -W * 0.6, dir: 1 };
        const ry = hy - H * 0.12;
        g.fillStyle = '#0b0618'; g.fillRect(0, ry + 5, W, 2);
        if (this.train) {
          this.train.x += dt * (W * 0.9 + energy * W);
          const tx = this.train.x;
          g.fillStyle = '#251a3d'; g.fillRect(tx, ry, W * 0.55, 5);
          for (let x = tx + 2; x < tx + W * 0.55 - 2; x += 5) { g.fillStyle = '#fff2b0'; g.fillRect(x, ry + 1.5, 3, 1.5); }
          if (tx > W) this.train = null;
        }
        g.fillStyle = this.grad([[0, '#2a1240'], [1, '#09040f']], hy, H); g.fillRect(0, hy, W, H - hy);
        for (const c of this.cars) {
          c.x += (c.lane ? -1 : 1) * c.v * (1 + energy) * dt;
          if (c.x > W + 10) c.x = -10; if (c.x < -10) c.x = W + 10;
          const y = hy + 6 + c.lane * 8;
          this.glow(c.x, y, 6, c.lane ? 'rgba(255,60,60,A)' : 'rgba(255,250,210,A)', 0.9);
          g.fillStyle = c.lane ? 'rgba(255,60,60,0.35)' : 'rgba(255,250,210,0.3)';
          g.fillRect(c.lane ? c.x : c.x - 18, y + 6 + c.lane * 2, 18, 1);
        }
        this.rain.update(dt, -10, 160 + energy * 120);
        this.rain.draw(g, 'rgba(200,210,255,0.45)');
        break;
      }
      case 'wave': {
        const hy = H * 0.55;
        g.fillStyle = this.grad([[0, '#e9d7ad'], [1, '#f6ecd2']], 0, hy); g.fillRect(0, 0, W, hy);
        this.moveClouds(dt, 0.8);
        for (const c of this.clouds) this.cloud(c, 'rgba(255,250,235,0.9)');
        const fx = W * 0.72;
        g.fillStyle = '#4f6688'; g.beginPath(); g.moveTo(fx - W * 0.12, hy); g.lineTo(fx, hy - H * 0.16); g.lineTo(fx + W * 0.12, hy); g.fill();
        g.fillStyle = '#f7f4ec'; g.beginPath(); g.moveTo(fx - W * 0.035, hy - H * 0.11); g.lineTo(fx, hy - H * 0.16); g.lineTo(fx + W * 0.035, hy - H * 0.11); g.fill();
        g.fillStyle = '#2b4c7e'; g.fillRect(0, hy, W, H - hy);
        // the great wave rises over two bars and crashes on the downbeat
        const cyc = ((f.beat.bar % 2) + f.beat.barPhase) / 2;
        const rise = Math.sin(clamp(cyc / 0.85) * Math.PI / 2);
        const crash = cyc > 0.85 ? (cyc - 0.85) / 0.15 : 0;
        const amp = H * (0.2 + 0.45 * rise * (1 - crash * 0.6) + energy * 0.08);
        const cx = W * (0.1 + 0.3 * cyc);
        if (cyc < this.lastCyc) for (let i = 0; i < 60; i++) this.spray.push({ x: cx + W * 0.1 + this.rnd() * 40, y: H - amp * 0.4, vx: (this.rnd() - 0.2) * 80, vy: -40 - this.rnd() * 90, life: 1 });
        this.lastCyc = cyc;
        g.fillStyle = '#1d3a66';
        g.beginPath(); g.moveTo(-10, H);
        for (let x = -10; x <= W * 0.95; x += 2) {
          const d = (x - cx) / (W * 0.2);
          g.lineTo(x, H - Math.exp(-d * d) * amp - Math.sin(x * 0.08 + t * 2) * 3);
        }
        g.lineTo(W * 0.95, H); g.closePath(); g.fill();
        g.strokeStyle = '#9fc0dd'; g.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          g.beginPath();
          for (let x = -10; x <= W * 0.9; x += 3) {
            const d = (x - cx) / (W * 0.2);
            const y = H - Math.exp(-d * d) * amp * (1 - k * 0.18) + k * 6;
            x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        }
        // foam claws curling over the crest
        g.fillStyle = '#f7f4ec';
        const curl = 0.6 + rise * 0.6;
        for (let i = 0; i < 30; i++) {
          const a = (i / 30) * Math.PI * curl + t * 0.6;
          const r = amp * 0.22 * (0.7 + 0.3 * Math.sin(i * 1.7 + t * 4));
          const px = cx + W * 0.07 + Math.cos(a + Math.PI) * r, py = H - amp + amp * 0.2 + Math.sin(a + Math.PI) * r * 0.8;
          g.beginPath(); g.arc(px, py, 1.5 + (i % 3), 0, TAU); g.fill();
        }
        for (const s of this.spray) {
          s.vy += 140 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 0.8;
          g.fillStyle = `rgba(250,248,240,${clamp(s.life)})`;
          g.beginPath(); g.arc(s.x, s.y, 1.6, 0, TAU); g.fill();
        }
        this.spray = this.spray.filter((s) => s.life > 0 && s.y < H + 5);
        // fishing boats pitched by the swell
        for (let i = 0; i < 2; i++) {
          const bx = W * (0.55 + i * 0.2), d = (bx - cx) / (W * 0.2), by = H - Math.exp(-d * d) * amp * 0.7 - 4;
          g.save(); g.translate(bx, by); g.rotate(-d * 0.3 * rise);
          g.fillStyle = '#efe3c8'; g.fillRect(-12, -2, 24, 3);
          g.fillStyle = '#1a1a1a'; for (let r = -9; r <= 9; r += 4) g.fillRect(r, -4, 1.5, 2);
          g.restore();
        }
        break;
      }
      default: { // starry
        const hy = H * 0.72;
        g.fillStyle = this.grad([[0, '#0b2466'], [1, '#2f5aa8']], 0, hy); g.fillRect(0, 0, W, hy);
        g.strokeStyle = 'rgba(160,200,255,0.4)'; g.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          const cx = W * (0.3 + k * 0.22) + Math.sin(t * 0.3 + k) * 8, cy = H * (0.28 + (k % 2) * 0.08);
          for (let r = 6; r < 40; r += 7) { g.beginPath(); g.arc(cx, cy, r, t * (0.8 + f.energy) + k + r * 0.05, t * (0.8 + f.energy) + k + r * 0.05 + 4.4); g.stroke(); }
        }
        for (const s of this.big) {
          const pulseR = 1 + 0.25 * Math.sin(t * 3 + s.p) + pulse * 0.5;
          this.glow(s.x, s.y, s.r * 4 * pulseR, 'rgba(255,230,120,A)', 0.6);
          g.fillStyle = '#ffe36a'; g.beginPath(); g.arc(s.x, s.y, s.r * pulseR, 0, TAU); g.fill();
        }
        this.shootingStar(f);
        g.fillStyle = '#ffe066'; g.beginPath(); g.arc(W * 0.86, H * 0.14, m * 0.07, 0, TAU); g.fill();
        g.fillStyle = '#163a7a'; g.beginPath(); g.arc(W * 0.875, H * 0.13, m * 0.06, 0, TAU); g.fill();
        this.lights = [{ x: W * 0.86, y: H * 0.14, r: m * 0.07 }, ...this.big.filter((s) => s.r > 3.5).map((s) => ({ x: s.x, y: s.y, r: s.r * 1.4 }))];
        g.fillStyle = '#1e3d72'; this.ridge(hy, H * 0.1, 0.015, 4);
        g.fillStyle = '#16264a'; g.fillRect(0, hy, W, H - hy);
        for (let i = 0; i < 14; i++) {
          const x = W * 0.35 + i * W * 0.045, y = hy + 4 + (i % 3) * 3;
          g.fillStyle = '#2b3d66'; g.fillRect(x, y, 9, 7);
          g.fillStyle = (Math.floor(t * 2 + i * 1.7) % 4) ? '#ffd34d' : '#6a5a2a'; g.fillRect(x + 3, y + 3, 2, 2);
        }
        // the cypress flickers like a flame
        const sway = 4 + f.energy * 6 + pulse * 3;
        g.fillStyle = '#0f1d0f';
        g.beginPath(); g.moveTo(W * 0.08, H);
        for (let y = H; y > H * 0.18; y -= 4) { const k = (H - y) / (H * 0.82); g.lineTo(W * 0.12 - Math.sin(y * 0.2 + t * 3) * sway * k - (1 - k) * W * 0.05, y); }
        for (let y = H * 0.18; y < H; y += 4) { const k = (H - y) / (H * 0.82); g.lineTo(W * 0.12 + Math.sin(y * 0.23 + t * 3) * sway * k + (1 - k) * W * 0.05, y); }
        g.fill();
      }
    }
    this.data = g.getImageData(0, 0, W, H).data;
  }

  sample(x, y) {
    const cx = clamp(Math.floor((x / this.w) * this.cw), 0, this.cw - 1);
    const cy = clamp(Math.floor((y / this.h) * this.ch), 0, this.ch - 1);
    const i = (cy * this.cw + cx) * 4, d = this.data;
    return [d[i], d[i + 1], d[i + 2]];
  }
}

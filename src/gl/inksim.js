// Ink / watercolour soaking into wet paper, simulated on the GPU.
// State per cell: r = water, g = loose pigment riding the water, b = how far
// the picture has soaked in. Water seeps along the paper fibres; where it
// reaches, the picture bleeds in (blurred and dark while wet, sharpening as it
// dries). Loose pigment is dragged to the drying edge and settles there as the
// dark rims and backruns real ink and watercolour leave.

import { createGL, program, texture, target, upload, FULL_VS, fullscreen, NOISE_GLSL } from './glutil.js';

const MAX_DROPS = 24;

const STEP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uState, uTarget;
uniform vec2 uTexel;
uniform float uAspect, uEvap, uDiff, uFlow, uPull, uDep, uFade, uMode, uFree;
uniform vec4 uDrop[${MAX_DROPS}];   // x, y, radius, water
uniform vec2 uDropB[${MAX_DROPS}];  // ink, seed
uniform int uNDrops;
${NOISE_GLSL}
float fiber(vec2 p) {
  // long thin fibres in two directions: water creeps along them (feathered edges)
  return 0.55 * vnoise(p * vec2(260.0, 38.0)) + 0.45 * vnoise(p * vec2(42.0, 250.0) + 9.7);
}
void main() {
  vec4 s = texture(uState, vUv);
  float W = s.r, M = s.g, D = s.b;
  vec2 dx = vec2(uTexel.x, 0.0), dy = vec2(0.0, uTexel.y);
  vec4 n0 = texture(uState, vUv - dx), n1 = texture(uState, vUv + dx), n2 = texture(uState, vUv - dy), n3 = texture(uState, vUv + dy);
  vec2 p = vUv * vec2(uAspect, 1.0);
  float fb = fiber(p);
  float fx = 0.6 + 0.8 * vnoise(p * vec2(260.0, 38.0)), fy = 0.6 + 0.8 * vnoise(p * vec2(42.0, 250.0) + 9.7);
  // water seeps, faster along the fibres
  W += uDiff * 0.25 * (fx * (n0.r + n1.r - 2.0 * W) + fy * (n2.r + n3.r - 2.0 * W));
  // suspended pigment: diffuses inside the water, and capillary flow drags it toward drier cells
  float dM = 0.0;
  vec4 N[4] = vec4[4](n0, n1, n2, n3);
  for (int i = 0; i < 4; i++) {
    vec4 n = N[i];
    dM += uDiff * 0.6 * min(W, n.r) * (n.g - M);
    float g = n.r - W;
    dM += uFlow * (g > 0.0 ? g * n.g : g * M);
  }
  M += dM * 0.25;
  // brush: drops of water carrying a little loose ink, with torn edges
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uNDrops) break;
    vec4 d = uDrop[i];
    vec2 q = (vUv - d.xy) * vec2(uAspect, 1.0);
    float a = atan(q.y, q.x);
    float r = d.z * (0.75 + 0.5 * vnoise(vec2(a * 2.5, uDropB[i].y)) + 0.2 * fb);
    float k = exp(-dot(q, q) / (r * r));
    W += d.w * k;
    M += uDropB[i].x * k * 0.12;
  }
  // the picture soaks in wherever the water has been
  D += (1.0 - D) * uPull * smoothstep(0.02, 0.35, W) * (0.6 + 0.8 * fb);
  // loose pigment settles as the paper dries
  float dry = 1.0 - smoothstep(0.0, 0.2, W);
  M -= M * uDep * dry;
  W = max(W - uEvap * (0.5 + fb), 0.0);
  W *= 1.0 - uFade * 0.5; M *= 1.0 - uFade; D *= 1.0 - uFade;
  M = min(M, 0.6);
  o = vec4(clamp(W, 0.0, 2.0), clamp(M, 0.0, 1.6), clamp(D, 0.0, 1.6), 1.0);
}`;

const RENDER_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uState, uTarget;
uniform vec2 uRes;
uniform vec3 uPaper;
uniform float uMode;
${NOISE_GLSL}
void main() {
  vec4 s = texture(uState, vUv);
  float W = s.r, M = s.g, R = s.b;
  vec2 px = vUv * uRes;
  float grain = 0.55 * vnoise(px / 2.2) + 0.45 * vnoise(px / 6.0 + 3.0);
  float fibres = vnoise(px * vec2(0.9, 0.08)) * 0.5 + vnoise(px * vec2(0.08, 0.9)) * 0.5;
  vec3 paper = uPaper * (0.955 + 0.045 * fibres) * (0.985 + 0.015 * grain);
  // while wet the picture is blurred and heavier; it sharpens as it dries
  float wet = smoothstep(0.0, 0.7, W);
  vec3 sharp = texture(uTarget, vUv).rgb;
  vec3 soft = vec3(0.0);
  float rad = 2.0 + 9.0 * wet;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854 + grain;
    soft += texture(uTarget, vUv + vec2(cos(a), sin(a)) * rad / uRes).rgb;
  }
  soft /= 8.0;
  float inkiness = clamp((0.92 - dot(soft, vec3(0.299, 0.587, 0.114))) * 1.6, 0.0, 1.0);
  vec3 pic = mix(sharp, soft * (1.0 - 0.22 * wet * inkiness), wet);
  if (uMode > 0.5) {
    // watercolour never dries crisp: broad washes, uneven pigment, darker where colours meet
    vec3 wide = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854 + 0.4;
      wide += texture(uTarget, vUv + vec2(cos(a), sin(a)) * (7.0 + 8.0 * wet) / uRes).rgb;
    }
    wide /= 8.0;
    vec3 p = mix(sharp, wide, 0.72);
    float edge = max(dot(wide - sharp, vec3(0.333)), 0.0) + max(dot(sharp - wide, vec3(0.333)), 0.0) * 0.4;
    p *= 1.0 - clamp(edge * 1.6, 0.0, 0.35);
    float blot = 0.6 * vnoise(px / 46.0 + 7.0) + 0.4 * vnoise(px / 17.0);
    pic = p * (0.88 + 0.2 * blot);
  }
  // how much of the picture has arrived, broken up by the paper grain
  float rv = clamp(R * mix(0.8, 1.12, grain), 0.0, 1.0);
  rv = smoothstep(0.05, 0.95, rv);
  vec3 col;
  if (uMode < 0.5) col = mix(paper, pic, rv);
  else col = paper * mix(vec3(1.0), pic / max(uPaper, vec3(0.2)), rv);
  // dark rims of settled loose pigment
  vec3 rimInk = uMode < 0.5 ? vec3(0.08, 0.075, 0.07) : pic * 0.45;
  col = mix(col, rimInk, (1.0 - exp(-M * 2.2)) * (0.15 + 0.6 * inkiness));
  // wet paper: a touch darker and cooler, a faint sheen at the edge of the wash
  col *= 1.0 - 0.035 * wet;
  col += vec3(0.015, 0.02, 0.028) * smoothstep(0.03, 0.25, W) * (1.0 - smoothstep(0.25, 0.7, W));
  o = vec4(col, 1.0);
}`;

const CLEAR_FS = `#version 300 es
precision highp float;
out vec4 o;
void main() { o = vec4(0.0); }`;

export class InkSim {
  constructor(w, h, { simScale = 0.5 } = {}) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    const gl = (this.gl = createGL(this.canvas));
    this.sw = Math.round(w * simScale);
    this.sh = Math.round(h * simScale);
    this.state = [target(gl, this.sw, this.sh, { float: true }), target(gl, this.sw, this.sh, { float: true })];
    this.targetTex = texture(gl, 4, 4);
    this.step = program(gl, FULL_VS, STEP_FS);
    this.render = program(gl, FULL_VS, RENDER_FS);
    this.clear = program(gl, FULL_VS, CLEAR_FS);
    this.vao = fullscreen(gl);
    this.ping = 0;
    this.drops = [];
    this.fade = 0;
    this.reset();
  }

  static supported() {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      return !!(gl && gl.getExtension('EXT_color_buffer_float'));
    } catch (_) {
      return false;
    }
  }

  reset() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.clear.p);
    for (const t of this.state) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, this.sw, this.sh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this.drops = [];
  }

  setTarget(source) {
    upload(this.gl, this.targetTex, source);
  }

  // x, y in 0..1 of the frame, r as a fraction of the frame height
  drop(x, y, r, water = 1, ink = 0.6, seed = Math.random() * 100) {
    if (this.drops.length < MAX_DROPS) this.drops.push([x, y, r, water, ink, seed]);
  }

  wash(amount) {
    this.fade = amount;
  }

  advance(iterations, P) {
    const gl = this.gl, u = this.step.u;
    gl.bindVertexArray(this.vao);
    gl.useProgram(this.step.p);
    gl.viewport(0, 0, this.sw, this.sh);
    gl.uniform2f(u.uTexel, 1 / this.sw, 1 / this.sh);
    gl.uniform1f(u.uAspect, this.w / this.h);
    gl.uniform1f(u.uMode, P.mode);
    gl.uniform1f(u.uEvap, P.evap);
    gl.uniform1f(u.uDiff, P.diffusion);
    gl.uniform1f(u.uFlow, P.flow);
    gl.uniform1f(u.uPull, P.pull);
    gl.uniform1f(u.uDep, P.deposit);
    gl.uniform1f(u.uFree, P.free);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.targetTex);
    gl.uniform1i(u.uTarget, 1);
    const flat = new Float32Array(MAX_DROPS * 4), flatB = new Float32Array(MAX_DROPS * 2);
    this.drops.forEach((d, i) => { flat.set(d.slice(0, 4), i * 4); flatB.set(d.slice(4, 6), i * 2); });
    for (let it = 0; it < iterations; it++) {
      const src = this.state[this.ping], dst = this.state[1 - this.ping];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(u.uState, 0);
      gl.uniform1i(u.uNDrops, it === 0 ? this.drops.length : 0);
      gl.uniform4fv(u.uDrop, flat);
      gl.uniform2fv(u.uDropB, flatB);
      gl.uniform1f(u.uFade, it === 0 ? this.fade : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.ping = 1 - this.ping;
    }
    this.drops = [];
    this.fade = 0;
  }

  draw(mode, paper) {
    const gl = this.gl, u = this.render.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.render.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.state[this.ping].tex);
    gl.uniform1i(u.uState, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.targetTex);
    gl.uniform1i(u.uTarget, 1);
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform3f(u.uPaper, paper[0], paper[1], paper[2]);
    gl.uniform1f(u.uMode, mode);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}

// One simulation per output size, shared by whichever segment is on screen.
const shared = new Map();
export function sharedInkSim(w, h) {
  const k = w + 'x' + h;
  if (!shared.has(k)) shared.set(k, new InkSim(w, h));
  return shared.get(k);
}

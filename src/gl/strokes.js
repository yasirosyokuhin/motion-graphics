// Instanced brushstrokes on the GPU. Each stroke is a curved quad shaded as
// loaded paint: bristle grooves along its length, a ragged dry-brush tail,
// and impasto relief lit from the upper left. Kinds: 0 = paint stroke,
// 1 = thin dark contour, 2 = round dab (pointillism).

import { createGL, program, texture, upload, FULL_VS, fullscreen, NOISE_GLSL } from './glutil.js';

export const STRIDE = 12; // x, y, angle, length | width, r, g, b | seed, bend, alpha, kind

const STROKE_VS = `#version 300 es
in vec2 aCorner;
in vec4 iA;
in vec4 iB;
in vec4 iC;
uniform vec2 uRes;
out vec2 vUv;
out vec3 vCol;
out vec3 vMeta;
void main() {
  float u = aCorner.x, v = aCorner.y;
  vec2 dir = vec2(cos(iA.z), sin(iA.z));
  vec2 nrm = vec2(-dir.y, dir.x);
  float len = iA.w, wid = iB.x;
  float bend = iC.y * (u * u - 0.25) * len;
  vec2 p = iA.xy + dir * u * (len + wid * 0.3) + nrm * (v * wid + bend);
  vec2 c = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  vUv = vec2(u + 0.5, v + 0.5);
  vCol = iB.yzw;
  vMeta = iC.xzw;
}`;

const STROKE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec3 vCol;
in vec3 vMeta;   // seed, alpha, kind
out vec4 o;
${NOISE_GLSL}
void main() {
  float seed = vMeta.x, kind = vMeta.z;
  float u = vUv.x, v = vUv.y * 2.0 - 1.0;
  float cover, height;
  if (kind > 1.5) {
    vec2 q = vec2(u * 2.0 - 1.0, v);
    float r = length(q) + (vnoise(q * 3.0 + seed) - 0.5) * 0.35;
    cover = 1.0 - smoothstep(0.75, 0.95, r);
    height = cover * (1.0 - r * 0.6);
  } else {
    float bristle = vnoise(vec2(v * (kind > 0.5 ? 6.0 : 13.0) + seed * 7.0, u * 1.5 + seed));
    float fine = vnoise(vec2(v * 40.0 + seed, u * 4.0));
    float across = 1.0 - pow(abs(v), 2.5);
    float head = smoothstep(0.0, 0.1 + 0.08 * vnoise(vec2(v * 5.0, seed)), u);
    // paint runs out toward the tail: the bristles separate (dry brush)
    float tail = 1.0 - smoothstep(0.62 + 0.25 * bristle, 1.0, u);
    float dry = smoothstep(0.45, 1.0, u) * (1.0 - bristle) * 0.9;
    cover = across * head * tail - dry - (1.0 - fine) * 0.12;
    height = cover * (0.55 + 0.35 * bristle + 0.1 * fine);
  }
  float a = smoothstep(0.02, 0.22, cover) * vMeta.y;
  if (a < 0.003) discard;
  float k = kind > 0.5 && kind < 1.5 ? 0.6 : 2.2;
  vec3 n = normalize(vec3(-dFdx(height) * k * 8.0, dFdy(height) * k * 8.0, 1.0));
  vec3 L = normalize(vec3(-0.5, 0.6, 0.65));
  float shade = 0.8 + 0.3 * dot(n, L);
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 18.0) * 0.22;
  vec3 col = vCol * shade + spec;
  o = vec4(col * a, a);
}`;

const BG_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uImg;
uniform vec2 uRes;
uniform float uMix;
uniform vec3 uGround;
${NOISE_GLSL}
void main() {
  vec3 c = texture(uImg, vUv).rgb;
  // a scumbled underpainting: the picture, toned and broken by canvas weave
  vec2 px = vUv * uRes;
  float weave = 0.5 + 0.25 * sin(px.x * 1.6) * sin(px.y * 1.6) + 0.25 * vnoise(px * 0.15);
  c = mix(uGround, c, uMix) * (0.9 + 0.12 * weave);
  o = vec4(c, 1.0);
}`;

export class StrokeRenderer {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    const gl = (this.gl = createGL(this.canvas));
    this.prog = program(gl, STROKE_VS, STROKE_FS);
    this.bg = program(gl, FULL_VS, BG_FS);
    this.full = fullscreen(gl);
    this.img = texture(gl, 4, 4);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corners = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    const loc = (n) => gl.getAttribLocation(this.prog.p, n);
    gl.enableVertexAttribArray(loc('aCorner'));
    gl.vertexAttribPointer(loc('aCorner'), 2, gl.FLOAT, false, 0, 0);
    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    ['iA', 'iB', 'iC'].forEach((n, i) => {
      const l = loc(n);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(l, 1);
    });
    gl.bindVertexArray(null);
  }

  // image: the underpainting source; data: Float32Array of strokes (STRIDE floats each)
  draw(image, data, count, { ground = [0.5, 0.45, 0.4], mix = 0.8 } = {}) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);
    upload(gl, this.img, image);
    gl.useProgram(this.bg.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.img);
    gl.uniform1i(this.bg.u.uImg, 0);
    gl.uniform2f(this.bg.u.uRes, this.w, this.h);
    gl.uniform1f(this.bg.u.uMix, mix);
    gl.uniform3f(this.bg.u.uGround, ground[0], ground[1], ground[2]);
    gl.bindVertexArray(this.full);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog.p);
    gl.uniform2f(this.prog.u.uRes, this.w, this.h);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    gl.bindVertexArray(null);
    return this.canvas;
  }
}

const shared = new Map();
export function sharedStrokes(w, h) {
  const k = w + 'x' + h;
  if (!shared.has(k)) shared.set(k, new StrokeRenderer(w, h));
  return shared.get(k);
}

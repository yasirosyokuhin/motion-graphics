// WebGL post: feedback trails, RGB split, slice glitch (pass 1, kept for the
// next frame's feedback) then bloom, flash, scanlines, grain, vignette (pass 2).

const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS1 = `precision highp float;
varying vec2 uv;
uniform sampler2D uScene, uPrev;
uniform float uTime, uRgb, uGlitch, uFeedback, uZoom, uRot;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 q = uv;
  float slice = floor(q.y * 36.0);
  float tick = floor(uTime * 24.0);
  float on = step(1.0 - uGlitch * 0.35, hash(vec2(slice, tick)));
  q.x += on * (hash(vec2(slice, tick + 7.0)) - 0.5) * 0.25 * uGlitch;
  vec2 d = (q - 0.5) * uRgb * 0.012 + vec2(uRgb * 0.003, 0.0);
  vec3 col = vec3(texture2D(uScene, q + d).r, texture2D(uScene, q).g, texture2D(uScene, q - d).b);
  vec2 f = q - 0.5;
  float c = cos(uRot), s = sin(uRot);
  f = mat2(c, -s, s, c) * f / (1.0 + uZoom);
  vec3 prev = texture2D(uPrev, f + 0.5).rgb;
  col = max(col, prev * uFeedback);
  gl_FragColor = vec4(col, 1.0);
}`;

const FS2 = `precision highp float;
varying vec2 uv;
uniform sampler2D uSrc;
uniform vec2 uRes;
uniform float uTime, uBloom, uFlash, uInvert, uScan, uGrain, uVig;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 col = texture2D(uSrc, uv).rgb;
  vec3 b = vec3(0.0);
  vec2 px = 1.0 / uRes;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853981;
    vec2 o = vec2(cos(a), sin(a));
    b += texture2D(uSrc, uv + o * px * 6.0).rgb + texture2D(uSrc, uv + o * px * 14.0).rgb;
  }
  b /= 16.0;
  col += max(b - 0.45, 0.0) * uBloom * 1.4;
  col = mix(col, 1.0 - col, uInvert);
  col += uFlash;
  col *= 1.0 - uScan * 0.35 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159));
  col += (hash(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * uGrain;
  vec2 v = uv - 0.5;
  col *= 1.0 - uVig * dot(v, v) * 1.6;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Post {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;
    this.p1 = compile(gl, VS, FS1);
    this.p2 = compile(gl, VS, FS2);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.sceneTex = this.tex();
    this.targets = [];
  }

  tex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  resize(w, h) {
    const gl = this.gl;
    this.canvas.width = w; this.canvas.height = h;
    this.w = w; this.h = h;
    this.targets = [0, 1].map(() => {
      const tex = this.tex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fb };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.ping = 0;
  }

  // params: rgb, glitch, feedback, zoom, rot, bloom, flash, invert, scan, grain, vig
  render(source, t, P) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    const cur = this.targets[this.ping], prev = this.targets[1 - this.ping];
    gl.viewport(0, 0, this.w, this.h);
    // pass 1 -> cur
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb);
    gl.useProgram(this.p1.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev.tex);
    const u1 = this.p1.u;
    gl.uniform1i(u1.uScene, 0); gl.uniform1i(u1.uPrev, 1);
    gl.uniform1f(u1.uTime, t); gl.uniform1f(u1.uRgb, P.rgb); gl.uniform1f(u1.uGlitch, P.glitch);
    gl.uniform1f(u1.uFeedback, P.feedback); gl.uniform1f(u1.uZoom, P.zoom); gl.uniform1f(u1.uRot, P.rot);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // pass 2 -> screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.p2.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur.tex);
    const u2 = this.p2.u;
    gl.uniform1i(u2.uSrc, 0); gl.uniform2f(u2.uRes, this.w, this.h); gl.uniform1f(u2.uTime, t);
    gl.uniform1f(u2.uBloom, P.bloom); gl.uniform1f(u2.uFlash, P.flash); gl.uniform1f(u2.uInvert, P.invert);
    gl.uniform1f(u2.uScan, P.scan); gl.uniform1f(u2.uGrain, P.grain); gl.uniform1f(u2.uVig, P.vig);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.ping = 1 - this.ping;
  }
}

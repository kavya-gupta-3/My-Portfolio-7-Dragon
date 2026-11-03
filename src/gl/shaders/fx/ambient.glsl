// Atmosphere: one buffer holding a small cloud per world; only the world on
// screen is drawn. Every particle is analytic (position = f(seed, time)), so
// it costs one draw and no CPU. Behaviour and look switch per stage:
// 0 embers · 1 pixels · 2 storm sparks · 3 crystal motes · 4 gold dust · 5 stars · 6 ash
#include "../lib/common.glsl"

varying vec3 vColor;
varying float vKind;
varying float vAlpha;
varying float vSeed;

#ifdef VERTEX
attribute vec4 aSeed;
uniform float uTime;
uniform float uGap;
uniform float uPixelRatio;
uniform float uSize;
uniform vec3 uCam;
uniform float uPhase;

void main() {
  float stage = floor(aSeed.x * 7.0);
  int si = int(stage);
  vec3 r = hash33(aSeed.yzw * 113.0);
  vec3 base = vec3((aSeed.y - 0.5) * 70.0, (aSeed.z - 0.5) * 50.0, -32.0 + aSeed.w * 44.0);
  vec3 p = base;
  float t = uTime;
  float range = 50.0;
  vec3 col = vec3(1.0);
  float size = 1.0;
  if (si == 0) {
    p.y = mod(base.y + uPhase * (1.0 + r.x * 2.2), range) - range * 0.5;
    p.x += sin(t * 0.7 + r.y * 20.0 + p.y * 0.2) * 0.8;
    col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.75, 0.3), r.z);
    size = 0.6 + r.x * 1.2;
  } else if (si == 1) {
    p.x = mod(base.x + t * (0.6 + r.x) * 2.0, 70.0) - 35.0;
    col = mix(vec3(1.0, 0.17, 0.84), vec3(0.17, 0.94, 1.0), step(0.5, r.z));
    size = 0.8 + r.x;
  } else if (si == 2) {
    p.y = mod(base.y - t * (14.0 + r.x * 10.0), range) - range * 0.5;
    p.x += (p.y) * 0.12;
    col = vec3(0.45, 0.85, 1.0);
    size = 0.5 + r.x * 0.5;
  } else if (si == 3) {
    p += vec3(sin(t * 0.3 + r.x * 9.0), sin(t * 0.25 + r.y * 7.0), cos(t * 0.2 + r.z * 5.0)) * 1.5;
    col = mix(vec3(0.2, 1.0, 0.6), vec3(0.85, 1.0, 0.6), r.z);
    size = 0.7 + r.x * 1.1;
  } else if (si == 4) {
    p.y = mod(base.y - t * (0.8 + r.x * 1.5), range) - range * 0.5;
    p.x += sin(t * 0.5 + r.y * 10.0) * 0.6;
    col = mix(vec3(1.0, 0.75, 0.25), vec3(1.0, 0.95, 0.7), r.z);
    size = 0.5 + r.x * 1.2;
  } else if (si == 5) {
    p += vec3(sin(t * 0.05 + r.x * 6.0), cos(t * 0.04 + r.y * 6.0), 0.0) * 2.0;
    col = mix(vec3(0.75, 0.6, 1.0), vec3(1.0, 0.8, 0.95), r.z);
    size = 0.4 + pow(r.x, 3.0) * 2.5;
  } else {
    p.y = mod(base.y + uPhase * (0.5 + r.x * 1.2), range) - range * 0.5;
    p.x += sin(t * 0.9 + r.y * 14.0 + p.y * 0.3) * 1.2;
    col = mix(vec3(1.0, 0.15, 0.08), vec3(0.35, 0.3, 0.3), step(0.7, r.z));
    size = 0.5 + r.x * 1.3;
  }
  p.y += stage * uGap;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float dist = -mv.z;
  float near = smoothstep(1.5, 6.0, dist);
  float far = 1.0 - smoothstep(55.0, 80.0, dist);
  vAlpha = near * far;
  vColor = col;
  vKind = stage;
  vSeed = r.y;
  gl_PointSize = vAlpha > 0.001 ? min(size * uSize * uPixelRatio * 42.0 / max(dist, 1.0), 26.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}
#else
uniform float uTime;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a;
  int k = int(vKind + 0.5);
  if (k == 1) {
    a = step(max(abs(c.x), abs(c.y)), 0.32) * (0.6 + 0.4 * step(0.5, fract(uTime * 3.0 + vSeed * 7.0)));
  } else if (k == 2) {
    a = smoothstep(0.08, 0.0, abs(c.x + c.y * 0.12)) * smoothstep(0.5, 0.2, abs(c.y)) * 1.5;
  } else if (k == 3 || k == 4) {
    float star = smoothstep(0.06, 0.0, abs(c.x) * abs(c.y) * 18.0) + pow(smoothstep(0.5, 0.0, d), 3.0);
    a = star * (0.5 + 0.5 * sin(uTime * 4.0 + vSeed * 40.0));
  } else {
    a = pow(smoothstep(0.5, 0.0, d), 2.2);
  }
  a *= vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * a * 1.6, 1.0);
}
#endif

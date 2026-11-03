// The ground of each world. Noise and Voronoi are far too expensive to run on
// half the pixels of every frame, so BAKE paints one seamless tile into a
// texture when a world opens, and the floor itself is little more than a
// texture lookup. Mipmaps also keep the horizon from shimmering.
#include "../lib/common.glsl"

varying vec3 vWorld;
varying vec2 vUv;

#ifdef VERTEX
void main() {
  vUv = uv;
#ifdef BAKE
  gl_Position = vec4(position.xy, 0.0, 1.0);
#else
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
#endif
}
#else
uniform int uWorld;

#ifdef BAKE
// Worley cells that wrap every `period` cells in both directions.
vec3 cells(vec2 x, float period) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 c = mod(n + g, period);
    vec2 r = g + hash22(c) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = hash12(c); }
    else if (d < f2) { f2 = d; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}

// Smooth noise that wraps every `period` cells.
float wrapNoise(vec2 x, float period) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(mod(i, period));
  float b = hash12(mod(i + vec2(1.0, 0.0), period));
  float c = hash12(mod(i + vec2(0.0, 1.0), period));
  float d = hash12(mod(i + vec2(1.0, 1.0), period));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float wrapFbm(vec2 uv, float period) {
  return wrapNoise(uv * period, period) * 0.55 + wrapNoise(uv * period * 2.0, period * 2.0) * 0.3 + wrapNoise(uv * period * 4.0, period * 4.0) * 0.15;
}

void main() {
  vec2 uv = vUv;
  vec2 warp = vec2(wrapFbm(uv, 4.0), wrapFbm(uv + 0.37, 4.0)) - 0.5;
  vec4 c = vec4(0.0);
  if (uWorld == 0) {
    vec3 v = cells(uv * 9.0 + warp * 1.6, 9.0);
    c = vec4(smoothstep(0.1, 0.0, v.y - v.x), v.z, wrapFbm(uv, 3.0), 0.0);
  } else if (uWorld == 3) {
    vec3 v = cells(uv * 12.0, 12.0);
    vec2 tilt = hash22(vec2(v.z * 91.0, 1.0));
    c = vec4(smoothstep(0.08, 0.0, v.y - v.x), v.z, tilt);
  } else if (uWorld == 4) {
    vec3 coin = cells(uv * 34.0, 34.0);
    vec3 mound = cells(uv * 6.0, 6.0);
    c = vec4(smoothstep(0.12, 0.0, coin.y - coin.x), coin.z, smoothstep(0.0, 0.9, mound.x), 0.0);
  } else {
    float dune = wrapFbm(uv, 4.0) * 0.8 + wrapFbm(uv, 12.0) * 0.2;
    c = vec4(dune, 0.0, 0.0, 0.0);
  }
  gl_FragColor = c;
}
#else
uniform sampler2D tBake;
uniform float uTime;
uniform float uFlash;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uGlowPos;
uniform vec3 uGlowCol;
uniform vec3 uFar;
uniform float uDim;
uniform float uPulse;
uniform float uRing;

vec3 lava(vec2 p) {
  vec4 t = texture2D(tBake, p / 72.0);
  // most of the sea has crusted over; only some seams still run
  float seam = textureLod(tBake, p / 230.0 + vec2(uTime * 0.008, -uTime * 0.005), 3.0).b;
  float pulse = textureLod(tBake, p / 60.0 - vec2(uTime * 0.02, 0.0), 3.0).b;
  vec3 crust = mix(vec3(0.014, 0.009, 0.009), vec3(0.05, 0.02, 0.012), t.g);
  float flow = smoothstep(0.42, 0.66, seam) * (0.5 + pulse);
  return crust + mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.68, 0.2), t.r * t.r) * t.r * flow * 1.4;
}

vec3 grid(vec2 w) {
  vec2 p = w * 0.5 + vec2(0.0, uTime * 1.6);
  vec2 g = abs(fract(p) - 0.5) / fwidth(p);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  float major = 1.0 - min(min(abs(fract(p.x * 0.2) - 0.5) / fwidth(p.x * 0.2), abs(fract(p.y * 0.2) - 0.5) / fwidth(p.y * 0.2)), 1.0);
  return mix(uColA, uColB, smoothstep(-40.0, 40.0, w.x)) * (line * 0.7 + major * 1.5) + vec3(0.01, 0.004, 0.02);
}

vec3 water(vec2 p, vec3 V) {
  float h = sin(p.x * 0.7 + uTime * 0.6) * sin(p.y * 0.9 - uTime * 0.4) + sin(p.x * 2.1 - uTime) * sin(p.y * 1.7 + uTime * 0.7) * 0.4;
  vec3 N = normalize(vec3(dFdx(h) * 5.0, 1.0, dFdy(h) * 5.0));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  return vec3(0.004, 0.012, 0.022) + vec3(0.2, 0.55, 0.8) * fres * (0.06 + uFlash * 1.6);
}

vec3 crystal(vec2 p, vec3 V) {
  vec4 t = texture2D(tBake, p / 28.0);
  vec3 N = normalize(vec3(t.b - 0.5, 1.2, t.a - 0.5));
  float glint = pow(max(dot(reflect(-normalize(vec3(0.4, 0.8, 0.3)), N), V), 0.0), 30.0);
  return mix(vec3(0.002, 0.03, 0.02), vec3(0.01, 0.13, 0.08), t.g) + vec3(0.2, 1.0, 0.6) * t.r * 0.5 + vec3(0.5, 1.0, 0.75) * glint * 2.2;
}

vec3 hoard(vec2 p) {
  vec4 t = texture2D(tBake, p / 22.0);
  float mound = 0.45 + 0.55 * t.b;
  vec3 c = mix(vec3(0.34, 0.16, 0.03), vec3(0.95, 0.6, 0.18), t.g * mound) * (1.0 - t.r * 0.8);
  float glit = step(0.975, fract(t.g * 37.0 + floor(uTime * 4.0 + t.g * 9.0) * 0.618));
  return c * 0.42 + vec3(1.0, 0.82, 0.45) * glit * 1.8 * (1.0 + uPulse * 2.0);
}

vec3 ash(vec2 p) {
  float dune = texture2D(tBake, p / 140.0).r;
  return mix(vec3(0.006, 0.002, 0.003), vec3(0.09, 0.012, 0.012), smoothstep(0.32, 0.64, dune));
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  vec3 col;
  if (uWorld == 0) col = lava(vWorld.xz);
  else if (uWorld == 1) col = grid(vWorld.xz);
  else if (uWorld == 2) col = water(vWorld.xz, V);
  else if (uWorld == 3) col = crystal(vWorld.xz, V);
  else if (uWorld == 4) col = hoard(vWorld.xz);
  else col = ash(vWorld.xz);
  vec2 d = vWorld.xz - uGlowPos.xz;
  col += uGlowCol * exp(-dot(d, d) * 0.018) * 0.55;
  // a surge of light rolls out across the floor from under the dragon
  float rd = length(d) - uRing;
  float ring = exp(-rd * rd * 0.016) * uPulse;
  col = col * (1.0 + ring * 2.6) + uGlowCol * ring * 0.45;
  col *= uDim;
  float fade = smoothstep(170.0, 34.0, dist);
  gl_FragColor = vec4(mix(uFar, col, fade), fade * fade);
}
#endif
#endif

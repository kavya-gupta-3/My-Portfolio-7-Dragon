// The world's sky: one sky per dragon plus the conclave. Painted into a small
// target (see Sky.ts) and sampled as the backdrop of the scene.
#include "../lib/common.glsl"

varying vec3 vDir;

#ifdef VERTEX
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
void main() {
  vec4 view = uInvProj * vec4(position.xy, 1.0, 1.0);
  view /= view.w;
  vDir = (uCamWorld * vec4(view.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
#else

uniform float uW[7];
uniform float uConclave;
uniform float uGain;
uniform float uTime;
uniform float uFlash;
uniform float uPulse;
uniform vec3 uMeteorA;
uniform vec3 uMeteorB;
uniform float uMeteorT;
uniform vec3 uMoonDir;
uniform vec3 uHobbyA;
uniform vec3 uHobbyB;
// how far the opening shot's far world has turned round the seven (radians)
uniform float uYaw;
uniform sampler3D tNoise;

// Soft value noise. The maths version hashes eight corners for every octave of
// every pixel; a small tiling volume of random values gives the same clouds
// for one texture read, and the sky is the biggest thing on the screen.
float cloudNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return texture(tNoise, (i + f + 0.5) / 32.0).r;
}

float clouds(vec3 p) {
  float s = (cloudNoise(p) * 2.0 - 1.0) * 0.5;
  p = p * 2.07 + vec3(5.3, 11.9, 1.7);
  s += (cloudNoise(p) * 2.0 - 1.0) * 0.25;
  p = p * 2.07 + vec3(5.3, 11.9, 1.7);
  return s + (cloudNoise(p) * 2.0 - 1.0) * 0.125;
}

float starField(vec3 d, float density, float threshold, float size) {
  vec3 p = d * density;
  vec3 c = floor(p);
  vec3 f = fract(p) - 0.5;
  vec3 h = hash33(c);
  float b = step(threshold, h.x) * (h.x - threshold) / (1.0 - threshold);
  vec3 o = (h - 0.5) * 0.7;
  float dist = length(f - o);
  float tw = 0.55 + 0.45 * sin(uTime * (0.8 + h.y * 3.0) + h.z * TAU);
  return smoothstep(size, 0.0, dist) * b * tw;
}

vec3 skyIgnis(vec3 d) {
  float below = smoothstep(0.15, -0.85, d.y);
  vec3 c = mix(vec3(0.008, 0.005, 0.007), vec3(0.075, 0.016, 0.005), below);
  float smoke = clouds(d * 3.2 + vec3(0.0, -uTime * 0.05, uTime * 0.02));
  float smoke2 = clouds(d * 7.0 + vec3(uTime * 0.03, -uTime * 0.08, 0.0));
  c += vec3(0.4, 0.09, 0.015) * smoothstep(0.05, 0.7, smoke + smoke2 * 0.3) * below * (0.35 + uPulse * 1.5);
  c += vec3(0.05, 0.014, 0.008) * smoothstep(-0.1, 0.6, smoke) * (1.0 - below) * 0.35;
  // distant ember sparks
  c += vec3(1.0, 0.45, 0.1) * starField(d + vec3(0.0, uTime * 0.01, 0.0), 90.0, 0.985, 0.18) * 1.5;
  return c;
}

vec3 skyPixel(vec3 d) {
  float h = d.y;
  vec3 c = mix(vec3(0.018, 0.003, 0.03), vec3(0.005, 0.002, 0.012), smoothstep(-0.1, 0.7, h));
  float horizon = exp(-abs(h + 0.05) * 9.0);
  c += mix(uHobbyA, uHobbyB, 0.5 + 0.5 * sin(atan(d.x, d.z) * 2.0 + uTime * 0.3)) * horizon * (0.16 + uPulse * 0.55);
  // pixel stars on a square lattice
  vec2 q = vec2(atan(d.x, d.z) * 40.0, h * 40.0);
  vec2 cell = floor(q);
  float r = hash12(cell);
  vec2 f = abs(fract(q) - 0.5);
  float px = step(max(f.x, f.y), 0.12) * step(0.965, r) * (0.5 + 0.5 * sin(uTime * 3.0 + r * 40.0));
  c += mix(uHobbyA, uHobbyB, hash12(cell + 3.1)) * px * 1.2 * smoothstep(-0.05, 0.2, h);
  // scan bands
  c *= 0.92 + 0.08 * sin(h * 220.0 - uTime * 2.0);
  return c;
}

vec3 skyVolt(vec3 d) {
  float cl = clouds(d * 2.6 + vec3(uTime * 0.04, 0.0, uTime * 0.02));
  float cl2 = clouds(d * 6.0 - vec3(0.0, uTime * 0.03, 0.0));
  vec3 c = mix(vec3(0.006, 0.012, 0.025), vec3(0.03, 0.06, 0.1), smoothstep(-0.3, 0.6, cl));
  c += vec3(0.1, 0.5, 0.8) * pow(sat(cl2 + 0.2), 3.0) * 0.12;
  c += vec3(0.6, 0.85, 1.0) * uFlash * smoothstep(-0.2, 0.7, cl + cl2 * 0.5) * 1.6;
  c += vec3(0.5, 0.9, 1.0) * starField(d, 70.0, 0.992, 0.12) * 0.6;
  return c;
}

vec3 skyJade(vec3 d) {
  vec3 c = mix(vec3(0.0, 0.02, 0.018), vec3(0.0, 0.006, 0.01), smoothstep(-0.2, 0.8, d.y));
  float a = atan(d.x, d.z);
  float curtain = clouds(vec3(a * 3.0, d.y * 2.0, uTime * 0.08));
  float band = smoothstep(0.05, 0.35, d.y) * smoothstep(0.95, 0.4, d.y);
  float rays = pow(sat(0.5 + 0.5 * sin(a * 26.0 + curtain * 6.0 + uTime * 0.2)), 3.0);
  c += mix(vec3(0.05, 0.9, 0.5), vec3(0.6, 1.0, 0.3), sat(d.y * 1.5)) * band * rays * smoothstep(-0.2, 0.5, curtain) * (0.35 + uPulse * 1.1);
  c += vec3(0.7, 1.0, 0.85) * starField(d, 80.0, 0.99, 0.13) * 0.7;
  return c;
}

vec3 skyAurum(vec3 d) {
  vec3 sun = normalize(vec3(0.15, 0.85, -0.5));
  float s = max(dot(d, sun), 0.0);
  vec3 c = mix(vec3(0.03, 0.014, 0.003), vec3(0.008, 0.004, 0.002), smoothstep(-0.3, 0.9, d.y));
  c += vec3(1.0, 0.65, 0.2) * pow(s, 10.0) * 0.28 + vec3(1.0, 0.85, 0.5) * pow(s, 96.0) * 1.4;
  // god rays radiating from the sun
  vec3 t = normalize(cross(sun, vec3(0.0, 0.0, 1.0)));
  vec3 bt = cross(sun, t);
  float ang = atan(dot(d, bt), dot(d, t));
  float rays = pow(sat(vnoise(vec2(ang * 9.0, uTime * 0.1)) * 1.2 - 0.2), 2.0);
  c += vec3(1.0, 0.7, 0.25) * rays * pow(s, 3.0) * (0.16 + uPulse * 0.6);
  c += vec3(1.0, 0.8, 0.4) * starField(d + vec3(0.0, -uTime * 0.004, 0.0), 120.0, 0.985, 0.12) * 0.8;
  return c;
}

vec3 skyAstra(vec3 d) {
  vec3 c = vec3(0.004, 0.002, 0.012);
  // value-noise fbm: a fraction of simplex's cost at full screen
  float n = clouds(d * 1.6 + vec3(0.0, uTime * 0.01, 0.0)) + clouds(d * 3.3 + 4.0) * 0.4;
  float n2 = clouds(d * 4.0 + n);
  c += mix(vec3(0.25, 0.05, 0.45), vec3(0.85, 0.2, 0.55), sat(n2 + 0.5)) * pow(sat(n + 0.35), 2.6) * 0.2;
  c += vec3(0.1, 0.25, 0.6) * pow(sat(-n + 0.1), 3.0) * 0.1;
  // galactic band
  float band = exp(-pow(dot(d, normalize(vec3(0.3, 1.0, 0.2))) * 3.2, 2.0));
  c += vec3(0.6, 0.45, 0.9) * band * (0.08 + 0.14 * sat(n2 + 0.4));
  c += vec3(1.0) * starField(d, 140.0, 0.97, 0.16) * 1.4;
  c += vec3(0.8, 0.85, 1.0) * starField(d.zxy, 60.0, 0.993, 0.1) * 2.5;
  c += vec3(0.5, 0.3, 0.9) * band * uPulse * 0.35;
  // a shooting star: a thin line of light, brightest at its head
  if (uMeteorT > 0.0) {
    vec3 head = normalize(mix(uMeteorA, uMeteorB, uMeteorT));
    vec3 ab = normalize(mix(uMeteorA, uMeteorB, max(uMeteorT - 0.26, 0.0))) - head;
    float along = sat(dot(d - head, ab) / max(dot(ab, ab), 1e-6));
    float r = length(d - head - ab * along) / (0.0028 * (1.0 - along * 0.7));
    float line = exp(-r * r) * pow(1.0 - along, 1.6);
    c += mix(vec3(0.6, 0.45, 1.0), vec3(1.0, 0.96, 1.0), 1.0 - along) * line * 3.2 * sin(uMeteorT * PI);
  }
  return c;
}

// The opening shot: a black throne room of a sky with one soft pool of colour
// behind each of the seven, and a low molten horizon they all rise out of.
const vec3 THRONES[7] = vec3[7](
  vec3(-0.1709, -0.0201, -0.9851),
  vec3(0.1903, -0.0200, -0.9815),
  vec3(-0.4185, -0.0498, -0.9068),
  vec3(0.4185, -0.0498, -0.9068),
  vec3(0.0000, 0.2000, -0.9798),
  vec3(-0.2703, 0.1502, -0.9510),
  vec3(0.2703, 0.1502, -0.9510)
);
const vec3 THRONE_COLS[7] = vec3[7](
  vec3(1.0, 0.33, 0.08),
  vec3(0.9, 0.12, 0.72),
  vec3(0.1, 0.62, 1.0),
  vec3(0.08, 0.85, 0.42),
  vec3(1.0, 0.62, 0.14),
  vec3(0.5, 0.26, 1.0),
  vec3(1.0, 0.12, 0.2)
);

/** How far round from straight ahead each of the seven stands. */
const float THRONE_AZ[7] = float[7](-0.1718, 0.1915, -0.4324, 0.4324, 0.0000, -0.2769, 0.2769);

/** A direction turned `a` round the vertical, the way a camera pans to the right. */
vec3 turn(vec3 d, float a) {
  float c = cos(a), s = sin(a);
  return vec3(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
}

vec3 skyConclave(vec3 d) {
  // The far world (smoke, mountains, stars) turns slowly round the seven, as
  // if the camera were circling them. The lights behind each dragon stay with
  // it, so the line-up holds still in front of a moving world.
  vec3 w = turn(d, uYaw);
  float smoke = clouds(w * 2.4 + vec3(uTime * 0.02, -uTime * 0.03, 0.0));
  float wisp = cloudNoise(w * 5.5 + vec3(0.0, -uTime * 0.05, uTime * 0.02) + smoke) - 0.5;
  vec3 c = mix(vec3(0.012, 0.009, 0.016), vec3(0.002, 0.002, 0.005), smoothstep(-0.2, 0.55, d.y));
  for (int i = 0; i < 7; i++) {
    float a = max(dot(d, THRONES[i]), 0.0);
    float a2 = a * a;
    float a4 = a2 * a2;
    float a8 = a4 * a4;
    float a16 = a8 * a8;
    float a26 = a16 * a8 * a2;
    float a52 = a26 * a26;
    c += THRONE_COLS[i] * (a52 * a52 * a16 * 0.035 + a26 * 0.008) * (1.0 + wisp * 1.6);
  }
  float horizon = smoothstep(0.1, -0.5, d.y);
  c += vec3(0.42, 0.1, 0.02) * horizon * (0.05 + 0.12 * sat(smoke + 0.5));
  // a nebula wheeling overhead, ember and violet: the plainest sign the world turns
  float neb = clouds(w * 1.7 + vec3(3.1, 0.0, 1.7));
  float vein = cloudNoise(w * 4.6 + vec3(neb * 2.2, 1.3, uTime * 0.01));
  float overhead = smoothstep(0.02, 0.45, d.y) * (1.0 - smoothstep(0.8, 1.0, d.y));
  vec3 nebula = mix(vec3(0.42, 0.1, 0.62), vec3(1.0, 0.36, 0.1), smoothstep(0.35, 0.75, vein));
  c += nebula * pow(sat(neb + 0.3), 2.2) * (0.6 + 0.8 * vein) * overhead * 0.16;
  // seven pillars of light, one rising behind each of them
  float az = atan(d.x, -d.z);
  for (int i = 0; i < 7; i++) {
    float off = (az - THRONE_AZ[i]) * 16.0;
    float pillar = exp(-off * off) * smoothstep(-0.04, 0.12, d.y) * (1.0 - smoothstep(0.1, 0.75, d.y));
    c += THRONE_COLS[i] * pillar * (0.05 + 0.04 * sin(uTime * 0.8 + float(i) * 1.7)) * (1.0 + wisp);
  }
  // a ring of far mountains, black against the lava glow behind them, read
  // round a circle so the ridge joins up all the way round
  vec2 ring = normalize(w.xz + vec2(0.0, 1e-5));
  float ridge = -0.035 + 0.05 * cloudNoise(vec3(ring.x * 2.4, 0.5, ring.y * 2.4)) + 0.024 * cloudNoise(vec3(ring.x * 7.0, 3.1, ring.y * 7.0)) + 0.008 * cloudNoise(vec3(ring.x * 22.0, 1.0, ring.y * 22.0));
  float mountain = smoothstep(ridge + 0.002, ridge - 0.003, d.y);
  vec3 rock = vec3(0.012, 0.007, 0.008) + vec3(0.22, 0.05, 0.01) * smoothstep(ridge - 0.06, ridge, d.y) * 0.25;
  c = mix(c, rock, mountain);
  c += vec3(1.0, 0.34, 0.07) * exp(-abs(d.y - ridge) * 160.0) * (1.0 - mountain * 0.6) * 0.28;
  c += vec3(1.0, 0.45, 0.12) * starField(w + vec3(0.0, uTime * 0.012, 0.0), 80.0, 0.988, 0.2) * smoothstep(0.5, -0.2, d.y) * 1.2;
  c += vec3(0.8, 0.85, 1.0) * starField(w, 130.0, 0.985, 0.14) * smoothstep(-0.05, 0.5, d.y) * 0.8;
  return c;
}

vec3 skyCrimson(vec3 d) {
  vec3 c = mix(vec3(0.03, 0.002, 0.006), vec3(0.004, 0.0, 0.002), smoothstep(-0.2, 0.8, d.y));
  vec3 m = normalize(uMoonDir);
  float md = dot(d, m);
  float disc = smoothstep(0.9954, 0.9962, md);
  if (disc > 0.0) {
    // the disc in its own coordinates: a lit sphere, seas and craters
    vec3 tn = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
    vec3 bn = cross(m, tn);
    vec2 mp = vec2(dot(d, tn), dot(d, bn)) / 0.092;
    float round_ = sqrt(max(1.0 - dot(mp, mp), 0.0));
    float seas = clouds(vec3(mp * 2.4 + 3.0, 1.0));
    float pits = vnoise(mp * 9.0) * 0.55 + vnoise(mp * 21.0) * 0.45;
    float rock = smoothstep(-0.25, 0.4, seas) * 0.6 + pits * 0.4;
    vec3 surface = mix(vec3(0.3, 0.012, 0.016), vec3(1.25, 0.26, 0.08), rock);
    surface *= 0.3 + 0.7 * round_ * smoothstep(-1.1, 0.5, mp.x * 0.6 + mp.y * 0.8);
    c = mix(c, surface * (1.0 + uPulse * 0.9), disc);
  }
  c += vec3(1.0, 0.1, 0.05) * pow(max(md, 0.0), 260.0) * (0.3 + uPulse * 1.4) * (1.0 - disc) + vec3(0.6, 0.03, 0.03) * pow(max(md, 0.0), 22.0) * (0.13 + uPulse * 0.45);
  float haze = clouds(d * 3.0 + vec3(uTime * 0.03, 0.0, 0.0));
  c += vec3(0.2, 0.01, 0.02) * smoothstep(0.0, 0.7, haze) * 0.22;
  c += vec3(1.0, 0.5, 0.4) * starField(d, 90.0, 0.99, 0.12) * 0.5;
  return c;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 c = vec3(0.0);
  if (uConclave > 0.001) c += skyConclave(d) * uConclave;
  if (uW[0] > 0.001) c += skyIgnis(d) * uW[0] * (1.0 - uConclave);
  if (uW[1] > 0.001) c += skyPixel(d) * uW[1];
  if (uW[2] > 0.001) c += skyVolt(d) * uW[2];
  if (uW[3] > 0.001) c += skyJade(d) * uW[3];
  if (uW[4] > 0.001) c += skyAurum(d) * uW[4];
  if (uW[5] > 0.001) c += skyAstra(d) * uW[5];
  if (uW[6] > 0.001) c += skyCrimson(d) * uW[6];
  gl_FragColor = vec4(c * uGain, 1.0);
}
#endif

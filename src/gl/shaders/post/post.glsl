// Post-processing passes, selected with #defines. One file, seven programs:
// PREFILTER → DOWN × n → UP × n → STREAK → COMPOSITE, plus WIPE (the elemental
// section transitions) and COPY (freezing the outgoing frame).
#include "../lib/common.glsl"

varying vec2 vUv;

#ifdef VERTEX
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
#else

#if defined(PREFILTER) || defined(DOWN) || defined(UP) || defined(STREAK) || defined(COPY) || defined(SHAFTS)
uniform sampler2D tInput;
uniform vec2 uTexel;
#endif

#ifdef COPY
void main() { gl_FragColor = vec4(texture2D(tInput, vUv).rgb, 1.0); }
#endif

#if defined(PREFILTER) || defined(DOWN)
vec3 tap(vec2 uv) { return texture2D(tInput, uv).rgb; }

vec3 downsample13(vec2 uv) {
  vec2 t = uTexel;
  vec3 a = tap(uv + t * vec2(-2.0, 2.0));
  vec3 b = tap(uv + t * vec2(0.0, 2.0));
  vec3 c = tap(uv + t * vec2(2.0, 2.0));
  vec3 d = tap(uv + t * vec2(-2.0, 0.0));
  vec3 e = tap(uv);
  vec3 f = tap(uv + t * vec2(2.0, 0.0));
  vec3 g = tap(uv + t * vec2(-2.0, -2.0));
  vec3 h = tap(uv + t * vec2(0.0, -2.0));
  vec3 i = tap(uv + t * vec2(2.0, -2.0));
  vec3 j = tap(uv + t * vec2(-1.0, 1.0));
  vec3 k = tap(uv + t * vec2(1.0, 1.0));
  vec3 l = tap(uv + t * vec2(-1.0, -1.0));
  vec3 m = tap(uv + t * vec2(1.0, -1.0));
#ifdef PREFILTER
  // Karis average per 2x2 block kills single-pixel fireflies.
  vec3 g0 = (a + b + d + e) * 0.25;
  vec3 g1 = (b + c + e + f) * 0.25;
  vec3 g2 = (d + e + g + h) * 0.25;
  vec3 g3 = (e + f + h + i) * 0.25;
  vec3 g4 = (j + k + l + m) * 0.25;
  float w0 = 1.0 / (1.0 + luma(g0));
  float w1 = 1.0 / (1.0 + luma(g1));
  float w2 = 1.0 / (1.0 + luma(g2));
  float w3 = 1.0 / (1.0 + luma(g3));
  float w4 = 1.0 / (1.0 + luma(g4));
  return (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5)
    / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
#else
  return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
#endif
}
#endif

#ifdef PREFILTER
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = min(downsample13(vUv), vec3(64.0));
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * uKnee + 1e-4;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * contrib, 1.0);
}
#endif

#ifdef DOWN
void main() { gl_FragColor = vec4(downsample13(vUv), 1.0); }
#endif

#ifdef UP
uniform sampler2D tBase;
uniform float uRadius;
void main() {
  vec4 d = uTexel.xyxy * vec4(1.0, 1.0, -1.0, 0.0) * uRadius;
  vec3 s = texture2D(tInput, vUv - d.xy).rgb;
  s += texture2D(tInput, vUv - d.wy).rgb * 2.0;
  s += texture2D(tInput, vUv - d.zy).rgb;
  s += texture2D(tInput, vUv + d.zw).rgb * 2.0;
  s += texture2D(tInput, vUv).rgb * 4.0;
  s += texture2D(tInput, vUv + d.xw).rgb * 2.0;
  s += texture2D(tInput, vUv + d.zy).rgb;
  s += texture2D(tInput, vUv + d.wy).rgb * 2.0;
  s += texture2D(tInput, vUv + d.xy).rgb;
  gl_FragColor = vec4(texture2D(tBase, vUv).rgb + s / 16.0, 1.0);
}
#endif

#ifdef STREAK
// Anamorphic lens flare: bright pixels smeared along the horizontal, the look
// of a wide cinema lens. Two passes over a blurred mip: `uTexel.x` sets the
// reach, and the short pass fills the gaps between the long pass's samples.
void main() {
  vec3 s = vec3(0.0);
  float w = 0.0;
  for (int i = -8; i <= 8; i++) {
    float f = float(i) / 8.0;
    float k = pow(max(1.0 - abs(f), 0.0), 2.0);
    s += texture2D(tInput, vUv + vec2(f * uTexel.x, 0.0)).rgb * k;
    w += k;
  }
  gl_FragColor = vec4(s / w, 1.0);
}
#endif

#ifdef SHAFTS
// Light shafts: the bright parts of the picture smeared toward the light that
// makes them, at an eighth of the resolution, so rays cost almost nothing.
uniform vec2 uLight;
void main() {
  vec2 uv = vUv;
  vec2 step_ = (uLight - uv) * 0.058;
  vec3 s = vec3(0.0);
  float w = 1.0;
  for (int i = 0; i < 14; i++) {
    s += min(texture2D(tInput, uv).rgb, vec3(2.5)) * w;
    uv += step_;
    w *= 0.93;
  }
  gl_FragColor = vec4(s * 0.11, 1.0);
}
#endif

#ifdef WIPE
// The section change. `tPrev` is the frozen outgoing world, `tScene` the live
// incoming one; each pair of dragons hands over through its own element. The
// edges are HDR, so they light the bloom on their way across the frame.
uniform sampler2D tScene;
uniform sampler2D tPrev;
uniform float uP;
uniform int uKind;
uniform float uAspect;
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
// an entrance can start in the dark, and the old world mustn't darken with it
uniform float uGain;

vec3 incoming(vec2 uv) { return texture2D(tScene, uv).rgb * uGain; }

vec3 wipeFire(vec2 uv, vec2 q, float p) {
  // a wall of flame climbs the frame; the old world chars ahead of it
  float n = fbmLite(vec3(q * vec2(3.2, 2.2) + vec2(0.0, -uTime * 1.5), uTime * 0.5));
  float fine = fbmLite(vec3(q * vec2(9.0, 5.0) + vec2(0.0, -uTime * 2.6), uTime));
  float d = uv.y + n * 0.34 + fine * 0.08 - mix(-0.42, 1.46, p);
  vec2 heat = vec2(fine * 0.02, n * 0.05) * smoothstep(0.6, 0.0, abs(d));
  vec3 a = texture2D(tPrev, uv + heat).rgb;
  a *= 1.0 - smoothstep(0.42, 0.02, d) * 0.92;
  vec3 b = incoming(uv + heat * 0.5);
  vec3 col = mix(a, b, smoothstep(0.02, -0.02, d));
  float body = smoothstep(0.3, 0.0, abs(d));
  col += mix(uColA * 1.6, vec3(1.0, 0.86, 0.55) * 7.0, pow(body, 3.0)) * pow(body, 1.5) * 1.7;
  // embers thrown clear of the front
  vec2 e = q * 26.0 + vec2(sin(q.y * 7.0 + uTime) * 0.8, -uTime * 7.0);
  float spark = step(0.965, hash12(floor(e))) * smoothstep(0.5, 0.05, length(fract(e) - 0.5));
  col += vec3(1.0, 0.55, 0.15) * spark * 5.0 * smoothstep(0.65, 0.05, abs(d));
  return col;
}

vec3 wipeMosaic(vec2 uv, float p) {
  // the world breaks into game tiles; they flip over in a sweep
  vec2 grid = vec2(uAspect, 1.0) * mix(9.0, 15.0, sat(abs(p - 0.5) * 2.0));
  vec2 cell = floor(uv * grid);
  vec2 f = fract(uv * grid);
  vec2 cuv = (cell + 0.5) / grid;
  float r = hash12(cell + 3.0);
  float delay = mix(r, 1.0 - uv.x, 0.62) * 0.66;
  float t = sat((p - delay) / 0.3);
  vec3 a = texture2D(tPrev, mix(uv, cuv, smoothstep(0.0, 0.4, p))).rgb;
  vec3 b = incoming(mix(cuv, uv, smoothstep(0.55, 1.0, p)));
  // the tile turns on its axis: squeeze it to a line, swap faces, open it
  float turn = abs(t * 2.0 - 1.0);
  float open = step(abs(f.x - 0.5) * 2.0, turn);
  vec3 col = mix(a, b, step(0.5, t));
  float mid = t * (1.0 - t) * 4.0;
  vec3 tint = mix(uColA, uColB, hash12(cell + 9.0));
  col = mix(tint * 0.3, col, open);
  float border = smoothstep(0.82, 1.0, max(abs(f.x - 0.5), abs(f.y - 0.5)) * 2.0);
  col += tint * mid * (0.4 + border * 3.6);
  return col;
}

vec3 wipeBolt(vec2 uv, float p) {
  // a strike splits the frame down the middle and the halves slide apart
  float seed = floor(uTime * 0.0) + 3.1;
  float bolt = 0.5 + (vnoise(vec2(uv.y * 3.2, seed)) - 0.5) * 0.34 + (vnoise(vec2(uv.y * 17.0, seed + 4.0)) - 0.5) * 0.09 + (vnoise(vec2(uv.y * 61.0, seed + 8.0)) - 0.5) * 0.022;
  float dist = abs(uv.x - bolt);
  float side = sign(uv.x - bolt);
  float open = pow(sat((p - 0.1) / 0.9), 2.1) * 0.92;
  vec3 a = texture2D(tPrev, vec2(uv.x - side * open * 0.62, uv.y)).rgb;
  vec3 b = incoming(uv);
  vec3 col = mix(a, b, smoothstep(open + 0.002, open - 0.002, dist));
  float arc = exp(-abs(dist - open) * 110.0);
  float core = exp(-dist * 170.0) * smoothstep(0.0, 0.05, p) * (1.0 - smoothstep(0.1, 0.34, p));
  col += (uColA * 3.0 + vec3(0.9, 0.98, 1.0) * 5.0 * arc) * arc * (1.0 - smoothstep(0.75, 1.0, p));
  col += vec3(0.8, 0.95, 1.0) * core * 26.0;
  col += vec3(0.75, 0.88, 1.0) * (1.0 - smoothstep(0.02, 0.2, p)) * smoothstep(0.0, 0.02, p) * 2.2;
  return col;
}

vec3 wipeShatter(vec2 uv, float p) {
  // the frame cracks into crystal: shards shrink and fly clear
  float z = 1.0 + p * p * 0.9;
  vec2 q = (uv - 0.5) / z + 0.5;
  vec2 g = vec2(q.x * uAspect, q.y) * 6.5;
  vec3 vo = voronoi(g);
  float edge = vo.y - vo.x;
  float delay = vo.z * 0.42 + length(uv - 0.5) * 0.3;
  float t = sat((p - delay) / 0.5);
  float keep = step(t * 1.15, edge * 1.5) * step(t, 0.999);
  vec2 shift = (vec2(hash11(vo.z * 91.0), hash11(vo.z * 37.0)) - 0.5) * t * 0.12;
  vec3 a = texture2D(tPrev, q + shift).rgb * (1.0 + t * 0.4);
  vec3 col = mix(incoming(uv), a, keep);
  float rim = smoothstep(0.1, 0.0, abs(edge - t * 0.77)) * step(0.001, t) * (1.0 - t);
  col += mix(uColA, vec3(0.8, 1.0, 0.9), 0.4) * rim * 7.0;
  float crack = smoothstep(0.035, 0.0, edge) * smoothstep(0.0, 0.1, p) * (1.0 - smoothstep(0.35, 0.7, p));
  col += uColA * crack * 6.0;
  return col;
}

vec3 wipeGold(vec2 uv, vec2 q, float p) {
  // molten gold pours down the frame, then thins into the next world
  float x = q.x;
  float drip = vnoise(vec2(x * 5.0, 1.3)) * 0.42 + vnoise(vec2(x * 15.0, 4.1)) * 0.17 + vnoise(vec2(x * 41.0, 7.7)) * 0.05;
  float front = mix(1.5, -0.8, smoothstep(0.0, 0.6, p));
  float cover = smoothstep(-0.008, 0.008, uv.y - front - drip * 0.9);
  float h = fbmLite(vec3(q * vec2(4.0, 2.6) + vec2(0.0, uTime * 0.7), uTime * 0.25));
  float thin = smoothstep(0.5, 1.0, p);
  float hole = smoothstep(0.0, 0.05, h * 0.75 + 0.5 - (1.25 - thin * 1.7));
  vec3 gold = mix(vec3(0.5, 0.2, 0.02), vec3(1.5, 0.95, 0.28), smoothstep(-0.35, 0.3, h));
  float gloss = pow(sat(1.0 - abs(h - 0.08) * 7.0), 4.0);
  gold += vec3(4.0, 3.2, 1.6) * gloss;
  vec3 a = texture2D(tPrev, uv + vec2(0.0, smoothstep(0.0, 0.55, p) * 0.1)).rgb;
  vec3 b = incoming(uv);
  vec3 col = mix(a, gold, cover);
  col = mix(col, b, hole * step(0.42, p));
  float lip = exp(-abs(uv.y - front - drip * 0.9) * 42.0) * (1.0 - smoothstep(0.42, 0.62, p));
  col += vec3(5.0, 3.6, 1.2) * lip;
  float rim = smoothstep(0.12, 0.0, abs(h * 0.75 + 0.5 - (1.25 - thin * 1.7))) * thin * (1.0 - thin) * 4.0;
  col += vec3(4.0, 2.6, 0.9) * rim;
  return col;
}

vec3 wipeWarp(vec2 uv, float p) {
  // the old sky collapses into a point; the new one is flung out of it
  vec2 d = uv - 0.5;
  vec2 da = vec2(d.x * uAspect, d.y);
  float r = length(da);
  float ang = atan(da.y, da.x);
  float pull = pow(p, 1.8);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float t = float(i) / 6.0;
    acc += texture2D(tPrev, 0.5 + d * (1.0 + pull * (2.2 + t * 0.9))).rgb;
  }
  vec3 a = acc / 7.0;
  float z = mix(0.12, 1.0, pow(smoothstep(0.3, 1.0, p), 1.4));
  vec3 b = incoming(0.5 + d * z);
  float iris = smoothstep(0.0, 0.03, pow(smoothstep(0.26, 0.92, p), 1.6) * 1.15 - r);
  vec3 col = mix(a * (1.0 - smoothstep(0.1, 0.5, p) * 0.75), b, iris);
  float ray = step(0.86, hash11(floor(ang * 34.0) + 7.0));
  float len = fract(hash11(floor(ang * 34.0)) * 7.0 + r * 0.5 - uTime * 2.2);
  float streak = ray * smoothstep(0.75, 1.0, len) * smoothstep(0.02, 0.3, r) * sin(p * PI);
  col += mix(uColA, uColB, len) * streak * 5.0;
  float ringR = pow(smoothstep(0.26, 0.92, p), 1.6) * 1.15;
  col += mix(uColB, vec3(1.0), 0.3) * exp(-abs(r - ringR) * 34.0) * 3.5 * sin(p * PI);
  return col;
}

vec3 wipeEclipse(vec2 uv, float p) {
  // a black disc swallows the old world, its rim burning like a blood moon
  vec2 da = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);
  float r = length(da);
  float reach = pow(p, 1.7) * (0.65 + 0.65 * uAspect);
  float lip = (fbmLite(vec3(da * 4.0, uTime * 0.6)) - 0.5) * 0.05;
  vec3 col = mix(texture2D(tPrev, uv).rgb, incoming(uv), smoothstep(0.012, -0.012, r + lip - reach));
  float glow = exp(-abs(r + lip - reach) * 26.0);
  col += (vec3(1.0, 0.1, 0.05) * 3.0 + vec3(1.0, 0.5, 0.2) * 7.0 * glow * glow) * glow * (1.0 - smoothstep(0.82, 1.0, p));
  return col;
}

void main() {
  vec2 q = vec2(vUv.x * uAspect, vUv.y);
  vec3 col;
  if (uKind == 0) col = wipeFire(vUv, q, uP);
  else if (uKind == 1) col = wipeMosaic(vUv, uP);
  else if (uKind == 2) col = wipeBolt(vUv, uP);
  else if (uKind == 3) col = wipeShatter(vUv, uP);
  else if (uKind == 4) col = wipeGold(vUv, q, uP);
  else if (uKind == 5) col = wipeWarp(vUv, uP);
  else if (uKind == 7) col = wipeEclipse(vUv, uP);
  else col = mix(texture2D(tPrev, vUv).rgb, incoming(vUv), uP);
  gl_FragColor = vec4(col, 1.0);
}
#endif

#ifdef COMPOSITE
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tStreak;
uniform sampler2D tShafts;
uniform sampler2D tDirt;
uniform float uShafts;
uniform float uDirt;
uniform float uBloom;
uniform float uStreak;
uniform vec3 uStreakTint;
uniform float uExposure;
uniform float uChroma;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uVignette;
uniform float uGrain;
uniform float uSharpen;
uniform float uTime;
uniform float uAspect;
uniform vec2 uPixel;
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uSaturation;
uniform float uFog;
uniform vec3 uFogColor;
uniform vec4 uShock;

vec3 aces(vec3 x) {
  return sat((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
}

float edgeLuma(vec3 c) {
  float l = luma(c);
  return l / (1.0 + l);
}

// FXAA: the edges of the dragons, smoothed after the fact for a sliver of the
// price of multisampling an HDR target.
vec3 antialias(vec2 uv) {
  vec3 m = texture2D(tScene, uv).rgb;
  vec3 nw = texture2D(tScene, uv + vec2(-1.0, -1.0) * uPixel).rgb;
  vec3 ne = texture2D(tScene, uv + vec2(1.0, -1.0) * uPixel).rgb;
  vec3 sw = texture2D(tScene, uv + vec2(-1.0, 1.0) * uPixel).rgb;
  vec3 se = texture2D(tScene, uv + vec2(1.0, 1.0) * uPixel).rgb;
  float lM = edgeLuma(m);
  float lNW = edgeLuma(nw);
  float lNE = edgeLuma(ne);
  float lSW = edgeLuma(sw);
  float lSE = edgeLuma(se);
  float lo = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float hi = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  // no hard edge here: the same four samples sharpen fine surface detail instead,
  // and less where it is already contrasty, so nothing gets a halo
  if (hi - lo < max(0.03, hi * 0.12)) {
    float amount = uSharpen * sqrt(sat(min(lo, 1.0 - hi) / max(hi, 1e-3)));
    return max(m + (m - (nw + ne + sw + se) * 0.25) * amount, vec3(0.0));
  }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), -8.0, 8.0) * uPixel;
  vec3 a = 0.5 * (texture2D(tScene, uv - dir / 6.0).rgb + texture2D(tScene, uv + dir / 6.0).rgb);
  vec3 b = 0.5 * a + 0.25 * (texture2D(tScene, uv - dir * 0.5).rgb + texture2D(tScene, uv + dir * 0.5).rgb);
  float lB = edgeLuma(b);
  return lB < lo || lB > hi ? a : b;
}

vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = vUv;
  // a roar's shockwave bends the picture as it passes
  if (uShock.w > 0.001) {
    vec2 d = (uv - uShock.xy) * vec2(uAspect, 1.0);
    float r = length(d);
    float ring = exp(-pow((r - uShock.z) * 7.0, 2.0));
    uv -= normalize(d + 1e-5) / vec2(uAspect, 1.0) * ring * uShock.w * 0.07;
  }
  vec2 dir = uv - 0.5;
  float d2 = dot(dir, dir);
  vec3 col;
  vec3 bloom;
  if (uChroma > 0.02) {
    vec2 off = dir * uChroma * (0.003 + d2 * 0.03);
    col = vec3(texture2D(tScene, uv + off).r, texture2D(tScene, uv).g, texture2D(tScene, uv - off).b);
    bloom = vec3(texture2D(tBloom, uv + off * 1.5).r, texture2D(tBloom, uv).g, texture2D(tBloom, uv - off * 1.5).b);
  } else {
    col = antialias(uv);
    bloom = texture2D(tBloom, uv).rgb;
  }
  // the lens: dust on the glass catches bright light, as in a real camera
  vec3 flare = bloom * uBloom;
  if (uDirt > 0.0) flare *= 1.0 + texture2D(tDirt, uv).r * uDirt;
  col += flare;
  col += texture2D(tStreak, uv).rgb * uStreakTint * uStreak;
  if (uShafts > 0.0) col += texture2D(tShafts, uv).rgb * uShafts;
  // ground mist: everything sinks into it at the bottom of the frame
  if (uFog > 0.001) {
    float roll = vnoise(vec2(uv.x * uAspect * 2.2 + uTime * 0.07, uv.y * 3.0 - uTime * 0.04));
    float mist = smoothstep(0.5, 0.0, uv.y + (roll - 0.5) * 0.3) * uFog;
    col = mix(col, uFogColor, mist);
  }
  col = col * uExposure * uTint + uLift;
  col += uFlash * uFlashColor;
  float l = luma(col);
  col = max(mix(vec3(l), col, uSaturation), 0.0);
  col = aces(col);
  float vig = smoothstep(1.25, 0.2, length(dir * vec2(uAspect, 1.0)) * 1.1);
  col *= mix(1.0, vig, uVignette);
  col = toSRGB(col);
  // grain doubles as the dither that keeps dark gradients from banding
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 913.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}
#endif
#endif // VERTEX

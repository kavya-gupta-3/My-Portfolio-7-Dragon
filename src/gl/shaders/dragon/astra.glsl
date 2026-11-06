// ASTRA — a dragon made of stars. Body points bend along the spine; wing
// points use the wing transform; constellation lines join the major stars.
// One file, three programs: BODY, WING, LINES (each with VERTEX/FRAGMENT).
// Summoned, every star falls out of the sky first, a shooting star that
// flares where it lands, and then the lines draw themselves between them.
#include "../lib/dragon_core.glsl"
#ifdef WING
#include "../lib/wing.glsl"
#endif

uniform float uReveal;
uniform float uEyeOpen;
uniform vec4 uHaze;
uniform float uRage;
uniform float uPixelRatio;
uniform float uSize;
uniform vec3 uStarA;
uniform vec3 uStarB;
uniform vec3 uStarC;
// 1 while an entrance plays: the stars fall into place and the lines draw in
uniform float uFall;
// how far the lines have joined up, from the tip of the tail to the head
uniform float uLink;
// height of the picture in pixels
uniform float uView;

varying vec4 vRand;
varying float vGlow;
varying float vPartF;
#ifndef LINES
// a star still falling: its trail across the sprite (xy) and how thick it is (z)
varying vec3 vTrail;
#endif

#ifdef VERTEX
#if defined(BODY)
attribute float aPart;
attribute vec4 aPivot;
#endif
#if defined(BODY) || defined(WING)
attribute vec4 aRand;
#endif
#ifdef WING
attribute float aExtra;
#endif

// where the storm comes from, and how far each star falls to its place
const vec3 RAIN = vec3(0.42, 1.0, -0.5);
const float FALL = 34.0;

void main() {
  vec3 wp;
  vec3 wn;
#if defined(BODY)
  deformPart(int(aPart + 0.5), aPivot, position, vec3(0.0, 1.0, 0.0), wp, wn);
  vRand = aRand;
  vPartF = aPart;
  float bright = aRand.z;
#elif defined(WING)
  float span;
  wingTransform(position, vec3(0.0, 1.0, 0.0), 1.0, wp, wn, span);
  vRand = aRand;
  vPartF = 20.0 + aExtra;
  float bright = aRand.z;
#else
  SpineFrame f;
  wp = spineBend(position, f);
  vRand = vec4(0.5, 0.5, 1.0, 0.5);
  vPartF = 30.0;
  float bright = 1.0;
#endif
  // stars breathe and drift a little around their place
  vec3 jitter = (hash33(vRand.xyw * 97.0) - 0.5) * 0.08;
  wp += jitter * sin(uTime * 0.6 + vRand.w * TAU);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float order = vRand.x * 0.6 + vRand.y * 0.4;
  float rv = smoothstep(order, order + 0.15, uReveal * 1.2) * step(0.001, uReveal);
  if (vPartF > 8.5 && vPartF < 9.5) rv = uEyeOpen;
  float flare = 0.0;
#ifdef LINES
  // the lines join the stars up one after another, from the tail to the head,
  // and the end still being drawn burns bright
  float front = uLink * 1.06 - (1.0 - position.x / uSpineLen);
  rv = mix(rv, smoothstep(0.0, 0.05, front), uFall);
  float g = (front - 0.025) * 34.0;
  flare = uFall * exp(-g * g) * step(0.001, uLink);
#else
  // each star comes in out of the storm along its own line: dark until it
  // lands, then it flares and settles
  float fell = sat((uReveal * 1.2 - order) / 0.09);
  float fly = (1.0 - fell) * uFall * step(0.001, uReveal);
  float since = uReveal * 1.2 - order - 0.09;
  flare = uFall * step(0.0, since) * exp(-since * 16.0);
  rv = mix(rv, step(1.0, fell), uFall);
#endif
  float tw = 0.65 + 0.35 * sin(uTime * (1.5 + vRand.y * 4.0) + vRand.w * TAU);
  // thousands of faint stars add up to a white blob from afar, so only the
  // brightest keep shining: the hide underneath carries the shape
  float near = smoothstep(46.0, 16.0, -mv.z);
  vGlow = rv * tw * (1.0 + uRage * 1.5) * (1.0 - uHaze.a * 0.8) * mix(0.12, 1.0, max(near * near, smoothstep(0.72, 0.98, bright) * step(bright, 0.99))) * (1.0 + flare * 3.0);
  float size = uSize * (0.45 + bright * 2.4) * (0.7 + 0.3 * tw) * (1.0 + flare);
  gl_PointSize = max(1.0, size * uPixelRatio * 48.0 / max(-mv.z, 0.5)) * rv;
  gl_Position = projectionMatrix * mv;
#ifndef LINES
  vTrail = vec3(0.0);
  if (fly > 0.0) {
    // in flight the sprite is its trail: from the head back up the line it fell
    vec3 from = normalize(RAIN + (hash33(vRand.wzx * 61.0) - 0.5) * 1.1);
    vec4 a = viewMatrix * vec4(wp + from * (FALL * fly), 1.0);
    vec4 b = viewMatrix * vec4(wp + from * (FALL * (fly + min(1.0 - fly, 0.3))), 1.0);
    float k = projectionMatrix[1][1] * uView * 0.5;
    vec2 d = b.xy * k / max(-b.z, 0.5) - a.xy * k / max(-a.z, 0.5);
    float big = smoothstep(0.2, 0.9, bright);
    d *= min(1.0, uView * mix(0.035, 0.13, big) / max(length(d), 1e-3));
    float w = uPixelRatio * mix(0.8, 1.5, big);
    float side = max(abs(d.x), abs(d.y)) + w * 8.0;
    vec4 clip = projectionMatrix * a;
    // the sprite sits halfway along the trail
    clip.xy += d * 0.5 * vec2(projectionMatrix[0][0], projectionMatrix[1][1]) / k * clip.w;
    gl_Position = clip;
    gl_PointSize = side * step(fly, 0.999);
    vTrail = vec3(vec2(d.x, -d.y) / side, w / side);
    // it catches light as it comes in, and burns brightest just before it lands
    vGlow = mix(0.3, 3.4, big) * (1.0 - smoothstep(0.7, 1.0, fly)) * (1.0 - uHaze.a * 0.8);
  }
#endif
}
#else
void main() {
#ifdef LINES
  gl_FragColor = vec4(mix(uStarB, uStarC, 0.5) * 1.6 * vGlow, 1.0);
#else
  vec2 c = gl_PointCoord - 0.5;
  if (vTrail.z > 0.0) {
    // a shooting star: a thread of light, white at its head, cooling up its trail
    vec2 q = c + vTrail.xy * 0.5;
    float along = sat(dot(q, vTrail.xy) / max(dot(vTrail.xy, vTrail.xy), 1e-6));
    float r = length(q - vTrail.xy * along) / vTrail.z;
    float glow = exp(-r * r) * pow(1.0 - along, 1.6) + exp(-dot(q, q) / (vTrail.z * vTrail.z * 5.0)) * 1.5;
    if (glow < 0.004) discard;
    vec3 col = mix(mix(uStarA, uStarB, vRand.x), uStarC, pow(1.0 - along, 3.0));
    gl_FragColor = vec4(col * glow * vGlow, 1.0);
    return;
  }
  float d = length(c);
  if (d > 0.5) discard;
  float core = pow(smoothstep(0.5, 0.0, d), 2.6);
  float bright = vRand.z;
  float flare = (smoothstep(0.06, 0.0, abs(c.x)) + smoothstep(0.06, 0.0, abs(c.y))) * smoothstep(0.5, 0.05, d) * smoothstep(0.85, 1.0, bright);
  vec3 col = mix(uStarA, uStarB, vRand.x);
  col = mix(col, uStarC, smoothstep(0.7, 1.0, bright) * 0.8);
  if (vPartF > 8.5 && vPartF < 9.5) col = vec3(1.0, 0.85, 1.0) * 3.0;
  float k = core * (0.35 + bright * 2.0) + flare * 1.5;
  gl_FragColor = vec4(col * k * vGlow * 1.4, 1.0);
#endif
}
#endif

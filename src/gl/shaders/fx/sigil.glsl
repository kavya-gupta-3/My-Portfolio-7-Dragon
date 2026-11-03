// The summoning circle behind the seven in the opening shot: rings of runes,
// a seven-pointed star and a seat for each dragon, lit as it wakes, with a
// line of fire running in from the seat to the heart of the circle.
#include "../lib/common.glsl"

varying vec2 vUv;

#ifdef VERTEX
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
#else
uniform float uTime;
uniform float uDraw;
uniform float uGlow;
uniform float uFocus;
uniform float uSeat[7];
uniform vec3 uSeatCol[7];

float line(float d, float w) {
  float aa = fwidth(d) * 1.2;
  return 1.0 - smoothstep(w, w + aa, d);
}

/** A line measured across the radius: `aa` is the radius's own blur, worked out once. */
float ring(float r, float at, float w, float aa) {
  return 1.0 - smoothstep(w, w + aa, abs(r - at));
}

float segment(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return line(length(pa - ba * h), w);
}

/** Where seat `k` is: the points of a seven-pointed star, the first at the top. */
vec2 seat(float k, float spin) {
  float a = 1.5707963 + k * 0.8975979 + spin;
  return vec2(cos(a), sin(a)) * 0.74;
}

void main() {
  vec2 p = vUv;
  float r = length(p);
  float aa = fwidth(r) * 1.2;
  if (r > 1.02) discard;
  float a = atan(p.y, p.x);
  // it draws itself on, sweeping round from the top
  float sweep = fract((1.5707963 - a) / 6.2831853 + 1.0);
  float on = 1.0 - smoothstep(uDraw * 1.08 - 0.08, uDraw * 1.08, sweep);
  if (on <= 0.0) discard;

  vec3 gold = vec3(1.0, 0.6, 0.26);
  vec3 col = vec3(0.0);
  // the frame: a double rim, a band of runes, inner rings
  col += gold * (ring(r, 0.985, 0.006, aa) * 0.9 + ring(r, 0.958, 0.0025, aa) * 0.6);
  col += gold * (ring(r, 0.822, 0.004, aa) * 0.7 + ring(r, 0.548, 0.0025, aa) * 0.5 + ring(r, 0.3, 0.003, aa) * 0.6);
  // light running round the rim
  float run = pow(0.5 + 0.5 * cos(a * 3.0 - uTime * 0.7), 60.0);
  col += vec3(1.0, 0.78, 0.45) * run * ring(r, 0.985, 0.012, aa) * 3.0;

  // runes, turning slowly the other way
  float band = (r - 0.84) / 0.1;
  if (band > 0.0 && band < 1.0) {
    float t = (a - uTime * 0.025) / 6.2831853 * 64.0;
    float cell = floor(t);
    vec2 q = vec2(fract(t) - 0.5, band - 0.5) * vec2(0.62, 1.0);
    float h1 = hash11(cell * 1.7 + 0.3);
    float h2 = hash11(cell * 3.1 + 0.5);
    float h3 = hash11(cell * 7.3 + 0.2);
    float g = segment(q, vec2(0.0, -0.32), vec2(0.0, 0.32), 0.035);
    g = max(g, h1 > 0.5 ? segment(q, vec2(-0.16, 0.22), vec2(0.16, -0.06), 0.03) : segment(q, vec2(-0.16, -0.18), vec2(0.16, 0.1), 0.03));
    if (h2 > 0.55) g = max(g, line(abs(length(q - vec2(0.0, h2 > 0.8 ? 0.2 : -0.2)) - 0.09), 0.025));
    if (h3 > 0.62) g = max(g, segment(q, vec2(-0.16, -0.32), vec2(0.16, -0.32), 0.028));
    col += gold * g * (0.3 + 0.3 * sin(cell * 1.3 + uTime * 1.5));
  }

  // ticks round the middle ring, like a dial
  float tick = fract((a + uTime * 0.04) / 6.2831853 * 84.0);
  col += gold * line(abs(tick - 0.5), 0.06) * step(0.56, r) * step(r, 0.6) * 0.45;

  // the seven-pointed star, turning very slowly. Each of its lines runs from
  // one seat to the third seat on, so every one lies the same distance from
  // the middle, square to the direction halfway between its two seats: one
  // dot product each finds how far this pixel is from it.
  float spin = uTime * 0.012;
  float star = 1.0;
  float half0 = 1.5707963 + spin + 1.3463969;
  for (int k = 0; k < 7; k++) {
    float h = half0 + float(k) * 0.8975979;
    star = min(star, abs(dot(p, vec2(cos(h), sin(h))) - 0.164666));
  }
  // the lines end at the seats
  col += gold * line(star, 0.0032) * (1.0 - smoothstep(0.738, 0.745, r)) * 0.4;

  // the seats, and the fire each one sends to the centre. Their light only
  // reaches a short way, so only the nearest seat can touch this pixel.
  float fk = mod(floor((a - 1.5707963 - spin) / 0.8975979 + 0.5), 7.0);
  int k = int(fk + 0.5);
  vec2 s = seat(fk, spin);
  float lit = uSeat[k] * (1.0 + step(abs(uFocus - fk), 0.1) * 1.4);
  float d = length(p - s);
  col += uSeatCol[k] * (line(abs(d - 0.034), 0.0035) * 1.1 + exp(-d * d * 2200.0) * 1.2) * (0.2 + lit);
  float spark = pow(0.5 + 0.5 * cos(dot(p - s, normalize(s)) * 40.0 + uTime * 6.0), 6.0);
  col += uSeatCol[k] * segment(p, s * 0.32, s * 0.94, 0.0028) * lit * (0.5 + spark);

  // a heart that turns
  float heart = ring(r, 0.12 + 0.004 * sin(uTime * 2.0), 0.004, aa) + ring(r, 0.165, 0.0025, aa) * (0.5 + 0.5 * sin(a * 6.0 + uTime));
  col += vec3(1.0, 0.72, 0.4) * heart * 0.8 + vec3(1.0, 0.5, 0.2) * exp(-r * r * 40.0) * 0.35;

  // quieter at the bottom, where the name stands in front of it
  col *= mix(0.4, 1.0, smoothstep(-0.75, 0.1, p.y));
  gl_FragColor = vec4(col * uGlow * on * 0.47, 1.0);
}
#endif

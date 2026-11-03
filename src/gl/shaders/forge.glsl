// Forges the name: one pass, once, at the exact resolution of the screen.
// The letters are read as a height field from a distance transform, so every
// stroke is cut like an inscription, then lit as polished gold in a studio.
#include "./lib/common.glsl"

varying vec2 vUv;

#ifdef VERTEX
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
#else
uniform sampler2D tDistance;
uniform sampler2D tMask;
uniform vec2 uTexel;
// what the distance gradient measures across one texel of a perfect field
uniform float uSlope;
uniform float uLines;
uniform float uHeight;

float field(vec2 uv) { return texture2D(tDistance, vec2(uv.x, 1.0 - uv.y)).r; }

// a photographer's studio, as seen in polished metal: a bright sky, a hard
// horizon and a dark floor, with tall strip lights either side
vec3 studio(vec3 r) {
  vec3 sky = mix(vec3(1.0, 0.7, 0.34), vec3(1.3, 1.08, 0.82), smoothstep(0.0, 0.85, r.y));
  vec3 ground = mix(vec3(0.1, 0.045, 0.02), vec3(0.62, 0.3, 0.1), smoothstep(-0.75, -0.02, r.y));
  vec3 c = mix(ground, sky, smoothstep(-0.014, 0.014, r.y));
  c += vec3(0.95, 0.72, 0.42) * smoothstep(0.55, 0.92, -r.x) * 0.9;
  c += vec3(0.7, 0.34, 0.12) * smoothstep(0.7, 0.96, r.x) * 0.5;
  return c;
}

void main() {
  vec2 e = uTexel;
  float d = field(vUv);
  float depth = max(-d, 0.0);
  float a = texture2D(tMask, vUv).r;
  vec2 g = vec2(field(vUv + vec2(e.x, 0.0)) - field(vUv - vec2(e.x, 0.0)), field(vUv + vec2(0.0, e.y)) - field(vUv - vec2(0.0, e.y)));
  // not normalised at the ridges, where it passes through zero: that keeps them antialiased
  g /= max(length(g), uSlope);

  // broad facets rising to a ridge, flat only in the widest strokes
  float bevel = 0.072;
  float slope = 1.0 - smoothstep(bevel * 0.9, bevel, depth);
  float lip = exp(-pow((depth - bevel) * 120.0, 2.0));
  vec3 N = normalize(vec3(g * (slope * 1.05 + lip * 0.18), 1.0));
  // brushed along the stroke of the polisher
  N.y += (vnoise(vec2(gl_FragCoord.x * 0.012, gl_FragCoord.y * 0.6)) - 0.5) * 0.03;
  N = normalize(N);

  // the view drifts down each line, so even flat metal sweeps through the studio
  float cap = (fract(((vUv.y - 0.5) * uHeight + uLines * 0.53) / 1.06) - 0.17) / 0.66;
  vec3 V = normalize(vec3((vUv.x - 0.5) * 0.4, 0.04 * sin(vUv.x * 7.0 + 1.0) - 0.26 - (cap - 0.5) * 0.8, 1.0));
  vec3 R = reflect(-V, N);
  vec3 metal = mix(vec3(1.0, 0.56, 0.16), vec3(1.0, 0.85, 0.52), clamp(cap, 0.0, 1.0));
  vec3 col = studio(R) * metal;
  // key and rim highlights
  vec3 L = normalize(vec3(-0.45, 0.7, 0.55));
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.92, 0.75) * pow(max(dot(N, H), 0.0), 140.0) * 2.2;
  col += vec3(1.0, 0.82, 0.55) * pow(1.0 - N.z, 3.0) * 0.5;
  // lava light rising under the letters, and a dark line where the cut begins
  col += vec3(1.0, 0.34, 0.06) * max(-N.y, 0.0) * slope * 1.1;
  col *= 0.8 + 0.2 * smoothstep(0.0, bevel * 0.2, depth);
  // a soft filmic shoulder keeps the highlights golden, not white
  col = 1.0 - exp(-col * 1.32);

  // layers from the back: a warm glow, a contact shadow, then the metal
  float out_ = max(d, 0.0);
  float glow = exp(-out_ * 9.0) * 0.5 * (1.0 - smoothstep(0.1, 0.36, out_));
  float shade = exp(-out_ * 24.0) * 0.62;
  vec4 p = vec4(vec3(1.0, 0.4, 0.1) * glow, glow);
  p = vec4(0.0, 0.0, 0.0, shade) + p * (1.0 - shade);
  p = vec4(col, 1.0) * a + p * (1.0 - a);
  vec3 rgb = p.rgb / max(p.a, 1e-3);
  rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(rgb, p.a);
}
#endif

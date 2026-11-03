// VOLT — gunmetal armour plates around a naked energy core. Circuit traces
// glow on every plate and a data pulse chases from head to tail.
#include "../lib/common.glsl"
#include "../lib/lighting.glsl"

uniform float uTime;
uniform float uReveal;
uniform float uRage;
uniform float uOpen;
uniform vec3 uVolt;
uniform vec3 uVolt2;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying vec3 vRest;
varying float vS;
varying vec4 vPivot;
varying float vExtra;

#define uOpenGlow uOpen

void main() {
  int part = int(vPart + 0.5);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float cell = hash13(floor(vRest * 5.0));
#ifdef SOLID
  const float burn = 0.0;
#else
  float front = uReveal * 1.7 - vS * 0.7 - cell * 0.45;
  if (front < 0.0) discard;
  float burn = smoothstep(0.1, 0.0, front);
#endif
  float energy = 1.0 + uRage * 1.8 + uOpenGlow * 1.2;

  if (part == 0) {
    float flow = 0.5 + 0.5 * sin(vUv.x * 140.0 - uTime * 16.0);
    float crackle = step(0.93, hash12(vec2(floor(vUv.x * 300.0), floor(uTime * 24.0))));
    vec3 e = mix(uVolt, vec3(0.85, 1.0, 1.0), flow * 0.5 + crackle) * (2.6 + 2.0 * flow) * energy;
    gl_FragColor = vec4(applyHaze(e), 1.0);
    return;
  }

  vec3 Nf = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(Nf, N) < 0.0) Nf = -Nf;
  vec3 albedo = vec3(0.11, 0.12, 0.14);
  float metal = 0.85;
  float rough = 0.36;
  vec3 emissive = vec3(0.0);

  if (part == 12) {
    float face = floor(vUv.x * 0.5 + 0.01);
    vec2 q = vec2(fract(vUv.x), vUv.y);
    float edge = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
    float rim = smoothstep(0.06, 0.0, edge);
    float trace = smoothstep(0.035, 0.0, abs(fract(q.y * 3.0 + 0.5) - 0.5) - 0.44) * step(face, 0.5);
    float chase = smoothstep(0.85, 1.0, fract(vPivot.w * 0.09 - uTime * 0.9));
    float blink = step(0.75, hash12(vec2(vPivot.w, floor(uTime * 3.0))));
    emissive = uVolt * (rim * (0.8 + chase * 3.0) + trace * (0.4 + blink * 0.8)) * energy;
    if (face > 3.5) emissive += uVolt2 * 1.4 * energy;
    if (face > 0.5 && face < 1.5) emissive += uVolt * 0.5 * (0.5 + 0.5 * sin(uTime * 6.0 + vPivot.w));
    albedo = mix(albedo, vec3(0.2, 0.22, 0.26), cell * 0.4);
  } else if (part == 1 || part == 2) {
    vec3 vo = voronoi(vRest.xy * 5.0 + vRest.z * 3.0);
    float seam = smoothstep(0.05, 0.0, vo.y - vo.x);
    emissive = uVolt * seam * 0.9 * energy;
    rough = 0.3;
  } else if (part == 3) {
    emissive = mix(uVolt, uVolt2, vUv.x) * smoothstep(0.6, 1.0, vUv.x) * 3.0 * energy;
    albedo = vec3(0.05);
  } else if (part == 4) {
    emissive = uVolt2 * smoothstep(0.3, 1.0, vUv.x) * 2.5 * energy;
  } else if (part == 5 || part == 11) {
    albedo = vec3(0.08, 0.085, 0.1);
    emissive = uVolt * smoothstep(0.9, 1.0, fract(vUv.x * 4.0)) * 0.6;
  } else if (part == 7 || part == 8) {
    albedo = vec3(0.7, 0.85, 0.9);
    emissive = uVolt * 0.6;
  }

  vec3 col = shadePBR(albedo, metal, rough, Nf, V, 1.0);
  col += emissive;
  // lightning in the world lights the armour; a charge runs down the plates
  col += uVolt * pow(1.0 - max(dot(Nf, V), 0.0), 2.0) * uPulse * 2.4;
  col += wavePulse(vS) * mix(uVolt, vec3(0.9, 1.0, 1.0), 0.5) * 4.5;
  col += uVolt * burn * 6.0;
  gl_FragColor = vec4(applyHaze(col), 1.0);
}

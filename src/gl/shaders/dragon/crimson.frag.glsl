// CRIMSON — glossy blood-red scales, a black dorsal stripe and a belly of
// ember plates that breathe with the dragon's fire.
#include "../lib/common.glsl"
#include "../lib/lighting.glsl"

uniform float uTime;
uniform float uReveal;
uniform float uRage;
uniform float uLen;
uniform vec3 uRed;
uniform vec3 uEmber;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying vec3 vRest;
varying float vS;
varying vec4 vPivot;
varying float vExtra;
varying vec3 vRestN;

void main() {
  int part = int(vPart + 0.5);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
#ifdef SOLID
  const float burn = 0.0;
#else
  float n0 = vnoise(vRest * 2.6 + 9.0);
  float front = uReveal * 1.7 - vS * 0.7 - n0 * 0.45;
  if (front < 0.0) discard;
  float burn = smoothstep(0.12, 0.0, front);
#endif
  float breath = 0.6 + 0.4 * sin(uTime * 2.0 - vS * 12.0);

  vec3 albedo = uRed;
  float rough = 0.28;
  float h = 0.0;
  vec3 emissive = vec3(0.0);

  float ao = 1.0;
  if (part == 0) {
    vec2 g = vec2(vUv.x * uLen * 3.6, vUv.y * 20.0);
    vec3 sc = imbricate(g, 20.0);
    h = sc.x;
    ao = 1.0 - sc.z * 0.75;
    float topBand = 1.0 - smoothstep(0.06, 0.2, min(vUv.y, 1.0 - vUv.y));
    float belly = 1.0 - smoothstep(0.1, 0.18, abs(vUv.y - 0.5));
    albedo = mix(uRed, uRed * vec3(0.55, 0.25, 0.3), sc.y * 0.7);
    albedo = mix(albedo, vec3(0.03, 0.005, 0.008), topBand);
    vec2 plates = bellyPlates(vUv.x * uLen * 2.6);
    emissive = uEmber * belly * (0.3 + plates.y * 1.6) * breath * (1.0 + uRage * 2.5);
    albedo = mix(albedo, vec3(0.25, 0.05, 0.02), belly);
    h = mix(h, plates.x, belly);
    rough = mix(0.2, 0.4, sc.y);
  } else if (part == 1 || part == 2) {
    vec3 vo = voronoi(vRest.xy * 7.5 + vRest.z * 4.0);
    h = 1.0 - smoothstep(0.0, 0.8, vo.x);
    albedo = mix(uRed, uRed * 0.5, vo.z);
    ao = 1.0 - smoothstep(0.06, 0.0, vo.y - vo.x) * 0.6;
    float mouth = mouthMask(part, vRest, vRestN);
    albedo = mix(albedo, vec3(0.22, 0.015, 0.02), mouth);
    emissive = uEmber * mouth * (0.5 + uRage * 3.0);
    h *= 1.0 - mouth;
  } else if (part == 3) {
    albedo = vec3(0.02, 0.012, 0.014);
    rough = 0.16;
    emissive = uEmber * smoothstep(0.7, 1.0, vUv.x) * 1.5;
  } else if (part == 4) {
    albedo = vec3(0.02, 0.01, 0.012);
    rough = 0.18;
    emissive = uEmber * smoothstep(0.5, 1.0, vUv.x) * 1.6 * breath;
  } else if (part == 5) {
    albedo = uRed * 0.6;
  } else if (part == 11) {
    albedo = vec3(0.04);
    rough = 0.25;
  } else if (part == 7 || part == 8) {
    albedo = vec3(0.9, 0.85, 0.78);
    emissive = uEmber * 0.15;
  }

  N = bumpNormal(vWorld, N, h * 0.05, 1.0);
  vec3 col = shadePBR(albedo, 0.0, rough, N, V, ao);
  col += emissive;
  col += wavePulse(vS) * uEmber * 3.0;
  col += uEmber * burn * 6.0;
  gl_FragColor = vec4(applyHaze(col), 1.0);
}

// AURUM — polished gold. Real GGX + an analytic studio environment give
// the metal its streaked reflections; scales are bump-mapped, the belly is
// plated in paler gold, horns are ivory.
#include "../lib/common.glsl"
#include "../lib/lighting.glsl"

uniform float uTime;
uniform float uReveal;
uniform float uRage;
uniform float uLen;
uniform vec3 uGold;
uniform vec3 uGoldPale;

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
  float n0 = vnoise(vRest * 2.5 + 1.0);
  float front = uReveal * 1.7 - vS * 0.7 - n0 * 0.45;
  if (front < 0.0) discard;
  float burn = smoothstep(0.12, 0.0, front);
#endif

  vec3 albedo = uGold;
  float rough = 0.24;
  float metal = 1.0;
  float h = 0.0;
  vec3 emissive = vec3(0.0);

  float ao = 1.0;
  if (part == 0) {
    vec2 g = vec2(vUv.x * uLen * 3.4, vUv.y * 24.0);
    vec3 sc = imbricate(g, 24.0);
    h = sc.x;
    ao = 1.0 - sc.z * 0.8;
    float belly = 1.0 - smoothstep(0.1, 0.19, abs(vUv.y - 0.5));
    vec2 plates = bellyPlates(vUv.x * uLen * 2.4);
    albedo = mix(uGold, uGold * vec3(1.06, 0.88, 0.66), sc.y * 0.6);
    rough = mix(0.16, 0.34, sc.y);
    albedo = mix(albedo, uGoldPale, belly);
    h = mix(h, plates.x, belly);
    ao = mix(ao, 1.0 - plates.y * 0.7, belly);
    rough = mix(rough, 0.26, belly);
    // seams catch a little warm light
    emissive = uGold * sc.z * 0.16 * (1.0 + uRage * 5.0);
  } else if (part == 1 || part == 2) {
    vec3 vo = voronoi(vRest.xy * 7.0 + vRest.z * 4.0);
    h = 1.0 - smoothstep(0.0, 0.8, vo.x);
    ao = 1.0 - smoothstep(0.06, 0.0, vo.y - vo.x) * 0.6;
    rough = 0.2;
    float mouth = mouthMask(part, vRest, vRestN);
    albedo = mix(albedo, vec3(0.32, 0.04, 0.03), mouth);
    metal = 1.0 - mouth;
    rough = mix(rough, 0.5, mouth);
    h *= 1.0 - mouth;
    emissive = vec3(1.0, 0.45, 0.1) * mouth * uRage * 2.5;
  } else if (part == 3) {
    albedo = vec3(0.93, 0.86, 0.7);
    metal = 0.35;
    rough = 0.3;
    h = 0.5 + 0.5 * sin(vUv.x * 50.0);
  } else if (part == 4) {
    albedo = mix(uGold, uGold * 0.55, vUv.x);
    rough = 0.2;
  } else if (part == 5) {
    vec3 vo = voronoi(vUv * vec2(10.0, 8.0));
    h = 1.0 - vo.x;
  } else if (part == 11) {
    albedo = vec3(0.12, 0.09, 0.06);
    metal = 0.3;
    rough = 0.3;
  } else if (part == 7 || part == 8) {
    albedo = vec3(0.95, 0.92, 0.82);
    metal = 0.0;
    rough = 0.35;
  }

  N = bumpNormal(vWorld, N, h * 0.05, 1.0);
  vec3 col = shadePBR(albedo, metal, rough, N, V, ao);
  col += emissive;
  col += wavePulse(vS) * uGoldPale * 2.4;
  col += uGoldPale * burn * 5.0;
  gl_FragColor = vec4(applyHaze(col), 1.0);
}

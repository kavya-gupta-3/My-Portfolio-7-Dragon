// ASTRA's hide — night sky made solid. Dark overlapping scales whose seams
// carry starlight, a nebula drifting slowly through them and pinpoint stars
// set into the skin, so the dragon reads as one solid animal from any side.
#include "../lib/common.glsl"
#include "../lib/lighting.glsl"

uniform float uTime;
uniform float uReveal;
uniform float uRage;
uniform float uLen;
uniform vec3 uDeep;
uniform vec3 uGlowA;
uniform vec3 uGlowB;

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
  const float forming = 0.0;
#else
  float n0 = vnoise(vRest * 3.0 + 4.0);
  float front = uReveal * 1.7 - vS * 0.7 - n0 * 0.45;
  if (front < 0.0) discard;
  float forming = smoothstep(0.14, 0.0, front);
#endif

  // a slow nebula, two sines folded into each other
  float neb = 0.5 + 0.5 * sin(vRest.x * 0.9 + 1.7 * sin(vRest.y * 1.6 + uTime * 0.25) + uTime * 0.18);
  vec3 nebula = mix(uGlowA, uGlowB, neb);
  vec3 albedo = uDeep;
  vec3 emissive = vec3(0.0);
  float ao = 1.0;
  float h = 0.0;
  float rough = 0.3;

  if (part == 0) {
    vec3 sc = imbricate(vec2(vUv.x * uLen * 3.0, vUv.y * 22.0), 22.0);
    h = sc.x;
    ao = 1.0 - sc.z * 0.7;
    float belly = 1.0 - smoothstep(0.1, 0.19, abs(vUv.y - 0.5));
    vec2 plates = bellyPlates(vUv.x * uLen * 2.4);
    albedo = mix(uDeep, uDeep * 2.4, sc.y * 0.7);
    albedo = mix(albedo, nebula * 0.3, belly);
    h = mix(h, plates.x, belly);
    emissive = nebula * (sc.z * 0.5 + 0.08) + nebula * belly * plates.y * 0.9;
  } else if (part == 1 || part == 2) {
    vec3 vo = voronoi(vRest.xy * 6.5 + vRest.z * 4.0);
    float seam = smoothstep(0.07, 0.0, vo.y - vo.x);
    h = 1.0 - smoothstep(0.0, 0.8, vo.x);
    ao = 1.0 - seam * 0.5;
    albedo = mix(uDeep * 1.4, uDeep * 3.0, vo.z);
    emissive = nebula * (seam * 0.65 + 0.1);
    float mouth = mouthMask(part, vRest, vRestN);
    albedo = mix(albedo, uGlowA * 0.2, mouth);
    emissive = mix(emissive, uGlowB * (0.6 + uRage * 2.0), mouth);
    h *= 1.0 - mouth;
  } else if (part == 3 || part == 4) {
    float tip = smoothstep(0.3, 1.0, vUv.x);
    albedo = uDeep * 2.0;
    rough = 0.16;
    emissive = mix(uGlowA, vec3(0.95, 0.9, 1.0), tip) * (0.2 + tip * tip * 2.6);
  } else if (part == 5) {
    albedo = uDeep * 1.6;
    emissive = nebula * 0.1;
  } else if (part == 11) {
    albedo = uDeep;
    emissive = vec3(0.8, 0.85, 1.0) * smoothstep(0.4, 1.0, vUv.x) * 1.2;
  } else if (part == 7 || part == 8) {
    albedo = vec3(0.7, 0.72, 0.92);
    emissive = uGlowA * 0.3;
    rough = 0.25;
  }

  // pinpoint stars set into the skin
  vec3 cell = floor(vRest * 11.0);
  float seed = hash13(cell);
  if (seed > 0.93 && part != 7 && part != 8) {
    float d = length(fract(vRest * 11.0) - 0.5 - (hash33(cell) - 0.5) * 0.5);
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.2 + seed * 3.0) + seed * 40.0);
    emissive += mix(vec3(0.85, 0.9, 1.0), uGlowB, seed - 0.93 > 0.04 ? 0.5 : 0.0) * smoothstep(0.17, 0.0, d) * twinkle * 3.4;
  }

  N = bumpNormal(vWorld, N, h * 0.05, 1.0);
  vec3 col = shadePBR(albedo, 0.15, rough, N, V, ao);
  col += emissive * (1.0 + uRage * 1.5);
  col += wavePulse(vS) * uGlowB * 2.6;
  col += uGlowB * forming * 6.0;
  gl_FragColor = vec4(applyHaze(col), 1.0);
}

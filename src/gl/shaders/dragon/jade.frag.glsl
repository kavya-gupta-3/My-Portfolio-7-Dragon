// JADE — a faceted emerald drake. Facets are flat-shaded from screen-space
// derivatives; a parallax-shifted vein field fakes depth inside the stone;
// facets glint as they catch the light.
#include "../lib/common.glsl"
#include "../lib/lighting.glsl"

uniform float uTime;
uniform float uReveal;
uniform float uRage;
uniform float uHeat;
uniform float uChain;
uniform vec3 uGem;
uniform vec3 uGemHi;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vPart;
varying vec3 vRest;
varying float vS;
varying vec4 vPivot;
varying float vExtra;

void main() {
  int part = int(vPart + 0.5);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 Nf = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(Nf, N) < 0.0) Nf = -Nf;

#ifdef SOLID
  const float grow = 0.0;
#else
  float n0 = vnoise(vRest * 2.2 + 7.0);
  float front = uReveal * 1.7 - vS * 0.7 - n0 * 0.45;
  if (front < 0.0) discard;
  float grow = smoothstep(0.12, 0.0, front);
#endif

  vec3 L = normalize(uKeyDir);
  float NoV = max(dot(Nf, V), 0.0);
  float fres = pow(1.0 - NoV, 3.0);
  // inner veins seen through the surface, shifted by the view direction
  vec3 inner = vRest * 2.6 - V * 0.35;
  vec3 vo = voronoi(inner.xy * 1.3 + inner.z * 0.7 + vec2(uTime * 0.02, 0.0));
  float vein = smoothstep(0.1, 0.0, vo.y - vo.x);
  float cloud = vnoise(inner * 1.2) * 0.9 - 0.45;
  // lit from the front too, so a face-on head still reads as solid stone
  float lit = max(dot(Nf, L), 0.0);
  float front_ = 0.3 + 0.7 * lit * lit;
  vec3 deep = uGem * 0.2 * front_;
  vec3 mid = uGem * 0.8 * front_;
  vec3 col = mix(deep, mid, sat(0.35 + cloud * 0.6 + vo.z * 0.35));
  col += uGemHi * vein * 0.5;
  // light passing through
  float trans = pow(max(dot(-Nf, L), 0.0), 2.0) * 0.6 + pow(max(dot(V, -L), 0.0), 4.0) * 0.4;
  col += uGem * trans * 0.9;
  // facet glints
  float facet = hash13(floor(Nf * 23.0) + floor(vRest * 1.5));
  float spec = pow(max(dot(reflect(-L, Nf), V), 0.0), 48.0);
  float twinkle = 0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * 2.4 + facet * 40.0), 6.0);
  col += uGemHi * spec * (1.5 + 3.0 * twinkle) ;
  col += mix(uGem, uGemHi, 0.5) * fres * 0.8;
  col += envAnalytic(reflect(-V, Nf), 0.15) * 0.3 * (0.15 + fres);

  if (part == 4 || part == 3) {
    float t = vUv.x;
    col = mix(col, uGemHi * (0.8 + 1.2 * t), 0.25 + 0.45 * t);
    col += uGemHi * smoothstep(0.75, 1.0, t) * (1.5 + uRage * 3.0);
    float caught = 1.0 - smoothstep(uChain - 0.1, uChain, vS);
    col += mix(uGem, uGemHi, t) * uHeat * caught * (0.8 + 3.2 * t * t) * (0.7 + 0.3 * sin(uTime * 6.0 + vRest.x * 2.0));
  } else if (part == 5 || part == 11) {
    col *= 0.6;
  } else if (part == 7 || part == 8) {
    col = mix(col, uGemHi * 1.2, 0.6);
  }
  col *= 1.0 + uRage * 0.6;
  col += wavePulse(vS) * uGemHi * 2.6;
  col += uGemHi * grow * 5.0;
  gl_FragColor = vec4(applyHaze(col), 1.0);
}

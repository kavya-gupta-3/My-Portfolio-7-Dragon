#include "../lib/dragon.glsl"

attribute float aExtra;

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
  vec3 wp;
  vec3 wn;
  dragonDeform(position, normal, wp, wn);
  vWorld = wp;
  vNormal = wn;
  vUv = uv;
  vPart = aPart;
  vRest = position;
  vRestN = normal;
  vPivot = aPivot;
  vExtra = aExtra;
  vS = isHeadPart(int(aPart + 0.5)) ? 0.0 : clamp(position.x / uSpineLen, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}

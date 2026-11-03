#include "../lib/dragon.glsl"

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vRest;
varying vec4 vPivot;

void main() {
  vec3 wp;
  vec3 wn;
  dragonDeform(position, normal, wp, wn);
  vWorld = wp;
  vNormal = wn;
  vRest = position;
  vPivot = aPivot;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}

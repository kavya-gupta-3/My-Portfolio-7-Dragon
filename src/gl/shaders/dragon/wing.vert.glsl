#include "../lib/dragon_core.glsl"
#include "../lib/wing.glsl"

attribute float aExtra;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vKind;
varying float vSpan;
varying vec3 vLocal;

void main() {
  vec3 wp;
  vec3 wn;
  float span;
  wingTransform(position, normal, aExtra > 1.5 ? 0.0 : 1.0, wp, wn, span);
  vWorld = wp;
  vNormal = wn;
  vUv = uv;
  vKind = aExtra;
  vSpan = span;
  vLocal = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}

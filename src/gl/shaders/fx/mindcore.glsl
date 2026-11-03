// The core of the mind: a small world of drifting light, deep at the centre
// and burning at the limb, turning slowly on itself.
#include "../lib/common.glsl"

varying vec3 vNormal;
varying vec3 vRest;

#ifdef VERTEX
void main() {
  vNormal = normalMatrix * normal;
  vRest = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
#else
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;

void main() {
  vec3 n = normalize(vNormal);
  float facing = max(n.z, 0.0);
  float limb = pow(1.0 - facing, 2.4);
  vec3 p = normalize(vRest);
  // clouds folded through clouds: nothing here keeps its shape for long
  float t = uTime;
  float warp = fbmLite(p * 1.7 + vec3(0.0, t * 0.05, t * 0.03));
  float swirl = fbmLite(p * 3.1 + vec3(warp * 3.2, -warp * 2.4, t * 0.07));
  float wisps = fbmLite(p * 7.2 + vec3(swirl * 3.0, t * 0.1, warp * 3.0));
  vec3 col = uB * 0.14;
  col = mix(col, uB * 0.95, smoothstep(-0.55, 0.3, swirl));
  col = mix(col, uA * 0.9, smoothstep(-0.1, 0.65, swirl + wisps * 0.55));
  col = mix(col, uC, smoothstep(0.1, 0.75, warp + wisps * 0.5) * 0.8);
  // bright threads where the clouds fold
  col += mix(uA, vec3(1.0), 0.5) * pow(sat(1.0 - abs(wisps) * 3.4), 5.0) * 0.5;
  // pinpoints of light under the surface
  vec3 cell = floor(p * 26.0);
  float star = hash13(cell);
  col += vec3(1.0) * step(0.965, star) * smoothstep(0.42, 0.0, length(fract(p * 26.0) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + star * 40.0)) * 1.4;
  // lit from the upper left, like everything else on the page
  float key = pow(max(dot(n, normalize(vec3(-0.5, 0.6, 0.62))), 0.0), 2.0);
  col *= 0.55 + key * 0.9;
  col += mix(uA, uC, 0.5 + 0.5 * n.y) * limb * 1.6;
  gl_FragColor = vec4(col, 1.0);
}
#endif

// A column of light from the sky. Brightest at its edges, where the eye looks
// through the most of it, with bands of light running down it.
#include "../lib/common.glsl"

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;

#ifdef VERTEX
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
#else
uniform vec3 uColor;
uniform float uPower;
uniform float uTime;
uniform float uBands;

void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vNormal), V));
  float edge = pow(1.0 - facing, 2.6) * 1.1 + 0.035;
  float bands = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(vUv.y * uBands + uTime * 14.0), 3.0);
  float flicker = 0.85 + 0.15 * sin(uTime * 37.0) * sin(uTime * 23.0);
  // fades out up into the sky and where it meets the ground
  float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  gl_FragColor = vec4(uColor * edge * bands * flicker * ends * uPower, 1.0);
}
#endif

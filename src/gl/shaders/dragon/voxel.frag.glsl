// Holographic voxels: glowing cube edges, view-dependent iridescence,
// travelling colour bands, scanlines and the odd dead pixel.
#include "../lib/common.glsl"

uniform vec3 uColA;
uniform vec3 uColB;
uniform float uTime;
uniform float uRage;
uniform vec4 uHaze;

varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vData;
varying float vHit;
varying float vFall;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  int part = int(vData.x + 0.5);
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.72, 0.94, max(e.x, e.y));
  float band = 0.5 + 0.5 * sin(vData.z * 0.45 - uTime * 3.2);
  vec3 base = mix(uColA, uColB, sat(band * 0.75 + vData.y * 0.45));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);
  vec3 irid = hsv2rgb(vec3(fract(fres * 0.7 + vData.y * 0.25 + uTime * 0.04), 0.65, 1.0));
  float lit = 0.22 + 0.78 * max(dot(N, normalize(vec3(0.35, 0.85, 0.45))), 0.0);
  vec3 col = base * lit * 0.55;
  col = mix(col, irid * 0.8, fres * 0.45);
  col += base * edge * 2.6;
  float dead = step(0.988, hash12(vec2(vData.y * 173.0, floor(uTime * 10.0))));
  col *= 1.0 - dead * 0.85;
  col *= 0.86 + 0.14 * sin(vWorld.y * 38.0 - uTime * 7.0);
  if (part == 9) col = mix(vec3(1.0), uColB, 0.3) * (1.9 + uRage * 2.0);
  if (part == 3) col += base * 0.6;
  col += mix(base, vec3(1.0), 0.3) * vHit * (0.7 + edge * 1.5);
  // a cube still falling into place burns white-hot
  col += mix(base, vec3(1.0), 0.6) * vFall * (1.2 + edge * 2.5);
  gl_FragColor = vec4(mix(col * (1.3 + uRage * 0.8), uHaze.rgb, uHaze.a), 1.0);
}

// Stage props, one file / two programs: CRYSTAL (floating jade shards) and
// COIN (falling ₹ coins).
#include "../lib/common.glsl"

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSeed;

uniform float uTime;
uniform float uWeight;
uniform float uBurst;

#ifdef VERTEX
attribute vec4 aSeed;
uniform vec3 uCenter;

mat3 rotAxis(vec3 axis, float a) {
  float s = sin(a), c = cos(a), oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c, oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
    oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z + axis.x * s,
    oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c);
}

void main() {
  vUv = uv;
#if defined(CRYSTAL)
  vec3 r = aSeed.xyz;
  vec3 pos = uCenter + vec3((r.x - 0.5) * 50.0, (r.y - 0.5) * 28.0, -14.0 - r.z * 24.0);
  pos.y += sin(uTime * 0.4 + aSeed.w * 6.28) * 0.8 + uBurst * (r.y - 0.3) * 6.0;
  vec3 axis = normalize(r - 0.5 + 0.01);
  mat3 R = rotAxis(axis, uTime * (0.15 + r.x * 0.3) + aSeed.w * 6.0);
  float s = (0.3 + r.z * 1.0) * uWeight;
  vec4 w = vec4(pos + R * (position * vec3(1.0, 2.2, 1.0) * s), 1.0);
  vNormal = R * normal;
  vSeed = aSeed.w;
#else
  vec3 r = aSeed.xyz;
  float fall = 2.5 + r.x * 3.5 + uBurst * 6.0;
  float y = mod(r.y * 40.0 - uTime * fall, 40.0) - 18.0;
  vec3 pos = uCenter + vec3((r.x - 0.5) * 40.0 + sin(uTime + r.z * 9.0) * 0.6, y, -7.0 - r.z * 22.0);
  vec3 axis = normalize(vec3(r.z - 0.5, 0.4, r.x - 0.5));
  mat3 R = rotAxis(axis, uTime * (2.0 + r.y * 5.0) + aSeed.w * 6.28);
  vec4 w = vec4(pos + R * (position * 0.42 * uWeight), 1.0);
  vNormal = R * normal;
  vSeed = aSeed.w;
#endif
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
#else

#if defined(CRYSTAL)
void main() {
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  float facet = hash13(floor(N * 9.0) + vSeed * 30.0);
  float glint = pow(max(dot(reflect(-normalize(vec3(0.4, 0.9, 0.3)), N), V), 0.0), 40.0);
  vec3 col = vec3(0.02, 0.4, 0.2) * (0.3 + facet * 0.7) + vec3(0.5, 1.0, 0.7) * (fres * 1.2 + glint * 3.0);
  col *= 0.65 * uWeight;
  gl_FragColor = vec4(col, 1.0);
}
#else
uniform sampler2D tRupee;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(0.3, 0.9, 0.5));
  float face = step(0.9, abs(N.y));
  float mark = texture2D(tRupee, vUv).r * face;
  vec3 gold = vec3(1.0, 0.74, 0.28);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 24.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = gold * (0.25 + 0.75 * diff) * (1.0 - mark * 0.45) + vec3(1.0, 0.9, 0.6) * (spec * 2.5 + fres * 0.8);
  col += gold * mark * 0.35;
  gl_FragColor = vec4(col * uWeight, 1.0);
}
#endif
#endif

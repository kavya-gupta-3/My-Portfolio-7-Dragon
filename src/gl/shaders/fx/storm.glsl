// The hoard taking to the air. Every coin's whole flight comes from its seed
// and four numbers: how much of the hoard has lifted, how far the spiral has
// turned, and how far the blast has thrown it.
#include "../lib/common.glsl"

varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying float vFace;
varying float vSeed;

#ifdef VERTEX
attribute vec4 aSeed;
uniform vec3 uCenter;
uniform float uRise;
uniform float uTurn;
uniform float uBlast;
uniform float uTime;

mat3 spin(vec3 axis, float a) {
  float s = sin(a), c = cos(a), oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c, oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
    oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z + axis.x * s,
    oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c);
}

void main() {
  float lift = smoothstep(aSeed.x * 0.75, aSeed.x * 0.75 + 0.25, uRise);
  float a0 = aSeed.w * 6.2831853;
  float r0 = 2.5 + aSeed.y * 15.0;
  vec3 lying = vec3(cos(a0) * r0, 0.0, sin(a0) * r0);
  // a funnel: tight and fast at the bottom, wide and slow at the top
  float h = aSeed.z * 30.0;
  float rv = 1.6 + h * 0.36 + aSeed.y * 1.6;
  float a1 = a0 + uTurn * (1.7 - aSeed.z * 0.9);
  vec3 spiral = vec3(cos(a1) * rv, h, sin(a1) * rv);
  vec3 p = mix(lying, spiral, smoothstep(0.0, 1.0, lift));
  p.y += sin(uTime * 3.0 + aSeed.w * 30.0) * 0.25 * lift;
  // the blast throws every coin out of the spiral and the sky rains them back
  vec3 out_ = normalize(vec3(p.x, 0.5 + aSeed.z * 1.4, p.z) + 1e-4);
  p += out_ * uBlast * (16.0 + aSeed.y * 30.0);
  p.y -= uBlast * uBlast * (6.0 + aSeed.x * 14.0);
  mat3 R = spin(normalize(aSeed.xyz - 0.5 + 0.01), uTime * (2.5 + aSeed.y * 7.0) * lift + aSeed.w * 6.28);
  float size = 0.46 * step(0.001, lift);
  vec3 w = uCenter + p + R * (position * size);
  vNormal = R * normal;
  vFace = abs(normal.y);
  vUv = uv;
  vSeed = aSeed.w;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
#else
uniform sampler2D tRupee;
uniform float uShine;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(0.15, 0.85, -0.5));
  float face = step(0.9, vFace);
  float mark = texture2D(tRupee, vUv).r * face;
  vec3 gold = vec3(1.0, 0.72, 0.26);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 30.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = gold * (0.2 + 0.8 * diff) * (1.0 - mark * 0.4) + vec3(1.0, 0.92, 0.65) * (spec * 3.0 + fres * 0.7);
  // now and then a coin turns its face right to the light
  col += vec3(1.0, 0.9, 0.6) * pow(spec, 4.0) * 6.0 * uShine;
  gl_FragColor = vec4(col, 1.0);
}
#endif

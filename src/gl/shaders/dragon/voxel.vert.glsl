// PIXEL — every cube is an instance. Its centre is bent along the spine
// (or carried by the head), the cube is oriented by the local frame, and
// the whole swarm can burst apart and snap back together.
#include "../lib/dragon_core.glsl"

attribute vec4 aVoxel;
attribute vec4 aVoxData;

uniform float uBurst;
uniform float uSwirl;
uniform float uReveal;
uniform float uEyeOpen;
uniform float uBeat;
uniform vec3 uHinge;
uniform float uDrift;
uniform float uWingS;
uniform float uFlap;
uniform vec4 uTouch[4];
uniform float uTouching;
// building in: cubes drop out of the sky into place, tail first (−1 when whole)
uniform float uBuild;

varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
varying vec4 vData;
varying float vHit;
varying float vFall;

void main() {
  int part = int(aVoxData.x + 0.5);
  vec3 center = aVoxel.xyz;
  if (part == P_JAW) center = rotZ(center - uHinge, uJaw) + uHinge;
  SpineFrame f;
  vec3 c;
  mat3 basis;
  if (part == P_WING) {
    // voxel wings hinge along the body, each cube riding its own span
    f = spineAt(uWingS);
    float side = sign(center.z);
    float span = abs(center.z);
    float a = uFlap * (0.3 + 0.7 * sat(span / 6.0));
    vec3 q = vec3(center.x - uWingS, span * sin(a) + center.y, side * span * cos(a));
    c = spineRigid(f, q);
    basis = mat3(f.T, f.N, f.B);
  } else if (isHeadPart(part)) {
    f = spineAt(0.0);
    c = spineRigid(f, center);
    basis = mat3(f.T, f.N, f.B);
  } else {
    c = spineBend(center, f);
    basis = mat3(f.T, f.N, f.B);
  }
  float shown = 1.0;
  vFall = 0.0;
  if (uBuild >= 0.0) {
    // tail first, a ring at a time; the head is built last
    float order = clamp(1.0 - aVoxData.w, 0.0, 1.2) / 1.2;
    float into = uBuild * 1.3 - order;
    float fall = 1.0 - sat(into / 0.3);
    vec3 drift = hash33(aVoxData.yzw * vec3(17.1, 0.37, 41.3)) - 0.5;
    c += vec3(drift.x * 4.0, 38.0, drift.z * 4.0) * fall * fall;
    shown = step(0.0, into);
    vFall = fall;
  }
  float hit = 0.0;
  // most frames nothing has knocked the cubes loose, and this can all be skipped
  if (uBurst + uDrift + uTouching > 0.0) {
    vec3 rd = normalize(hash33(aVoxData.yzw * vec3(91.7, 13.3, 57.1) + 3.1) - 0.5);
    float burst = uBurst * (0.45 + aVoxData.y);
    // a cloud that is still loading turns as a whole, each cube at its own rate
    if (uSwirl != 0.0) rd.xz = rot2(uSwirl * (0.4 + aVoxData.y * 0.6)) * rd.xz;
    c += rd * burst * 5.0 + vec3(0.0, burst * burst * 1.2, 0.0);
    // imagination: cubes float loose and drift like thoughts
    c += rd * uDrift * (0.6 + 0.6 * sin(uTime * 1.3 + aVoxData.y * 20.0));
    // the pointer shoves the cubes aside, and they take a moment to find their way back
    if (uTouching > 0.0) {
      vec3 push = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        vec3 away = c - uTouch[i].xyz;
        float r = length(away);
        float k = uTouch[i].w * exp(-r * r * 0.62);
        push += away / max(r, 0.25) * k;
        hit += k;
      }
      c += push / max(hit, 1.0) * 1.5 + rd * sat(hit) * 0.5;
    }
  }
  vHit = sat(hit);
  float beat = uBeat * (0.5 + 0.5 * sin(aVoxData.z * 0.9 - uTime * 9.0));
  float rv = smoothstep(0.0, 0.1, uReveal * 1.25 - aVoxData.w * 0.9 - aVoxData.y * 0.15);
  rv *= step(0.001, uReveal);
  if (part == P_EYE) rv = uEyeOpen;
  float size = aVoxel.w * f.scale * (1.0 + beat * 0.45 + vHit * 0.3) * (1.0 - uBurst * 0.35) * rv * shown;
  // turn the three faces this cube is made of toward the camera
  vec3 toCam = (cameraPosition - c) * basis;
  vec3 corner = vec3(toCam.x < 0.0 ? -1.0 : 1.0, toCam.y < 0.0 ? -1.0 : 1.0, toCam.z < 0.0 ? -1.0 : 1.0);
  vec3 wp = c + basis * (position * corner * size);
  vNormal = basis * (normal * corner);
  vWorld = wp;
  vUv = uv;
  vData = aVoxData;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}

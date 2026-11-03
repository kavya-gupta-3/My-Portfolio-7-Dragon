// Anatomy without attributes: any shader (merged mesh, instanced voxels,
// point clouds) can deform a rest-space point by part id.

#include "./common.glsl"
#include "./spine.glsl"

uniform float uJaw;
uniform vec4 uLegs;
uniform float uTime;
uniform float uFlow;
uniform float uBlink;
uniform float uOpen;

#define P_BODY 0
#define P_HEAD 1
#define P_JAW 2
#define P_HORN 3
#define P_SPIKE 4
#define P_LEG 5
#define P_WHISKER 6
#define P_TOOTH 7
#define P_TOOTH_LOW 8
#define P_EYE 9
#define P_MANE 10
#define P_CLAW 11
#define P_SEGMENT 12
#define P_WING 13

bool isHeadPart(int p) {
  return p == P_HEAD || p == P_JAW || p == P_HORN || p == P_WHISKER || p == P_TOOTH || p == P_TOOTH_LOW || p == P_EYE;
}

// Legs, spikes and mane are stiff: they ride on the frame where they join the
// body. Bending them vertex by vertex shears them around every curve.
bool isRidingPart(int p) {
  return p == P_LEG || p == P_CLAW || p == P_SPIKE || p == P_MANE;
}

vec3 rotZ(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
}

float legAngle(float index) {
  if (index < 0.5) return uLegs.x;
  if (index < 1.5) return uLegs.y;
  if (index < 2.5) return uLegs.z;
  return uLegs.w;
}

/** Deforms one rest-space point (and its normal) belonging to `part`. */
void deformPart(int part, vec4 pivot, vec3 pos, vec3 nor, out vec3 wpos, out vec3 wnor) {
  vec3 p = pos;
  vec3 n = nor;
  if (part == P_JAW || part == P_TOOTH_LOW) {
    p = rotZ(p - pivot.xyz, uJaw) + pivot.xyz;
    n = rotZ(n, uJaw);
  } else if (part == P_LEG || part == P_CLAW) {
    float a = legAngle(pivot.w);
    p = rotZ(p - pivot.xyz, a) + pivot.xyz;
    n = rotZ(n, a);
  } else if (part == P_WHISKER) {
    float d = length(p - pivot.xyz);
    float ph = uTime * 1.9 + d * 2.6 + pivot.w * 3.1;
    p += vec3(0.0, sin(ph) * 0.09, cos(ph * 0.8) * 0.12) * d * d;
  } else if (part == P_MANE) {
    float d = length(p - pivot.xyz);
    float ph = uTime * 3.2 + p.x * 1.7 + pivot.w;
    p += vec3(sin(ph) * 0.12, 0.0, cos(ph * 1.3) * 0.18) * d * (1.0 + uFlow);
  } else if (part == P_EYE) {
    // eyelids: the eye closes top and bottom toward its centre
    p.y = pivot.y + (p.y - pivot.y) * (1.0 - uBlink * 0.92);
  }

  if (isHeadPart(part)) {
    // the skull is bolted to the top of the neck: same frame, no joint to show
    SpineFrame f = spineAt(0.0);
    wpos = spineRigid(f, p);
    wnor = spineDir(f, n);
  } else if (part == P_SEGMENT) {
    // armour plates ride rigidly on the frame at their own arclength
    SpineFrame f = spineAt(pivot.x);
    // the armour can unlock and stand off the core, ring by ring
    vec3 local = p - vec3(pivot.x, 0.0, 0.0);
    float lift = uOpen * (0.5 + 0.5 * sin(pivot.w * 1.7 + uTime * 2.0));
    local.yz *= 1.0 + lift * 0.9;
    local.x += lift * 0.25 * sin(pivot.w);
    wpos = spineRigid(f, local);
    wnor = spineDir(f, n);
  } else if (isRidingPart(part)) {
    SpineFrame f = spineAt(pivot.x);
    wpos = spineRigid(f, p - vec3(pivot.x, 0.0, 0.0));
    wnor = spineDir(f, n);
  } else {
    SpineFrame f;
    wpos = spineBend(p, f);
    wnor = spineDir(f, n);
  }
}

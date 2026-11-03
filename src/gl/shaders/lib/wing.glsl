// Wing placement: the arm flaps from the shoulder, the hand bends at the wrist
// and lags behind it, then sweep, mirror, and ride on the shoulder frame.

uniform float uWingS;
uniform vec3 uWingRoot;
uniform float uSide;
uniform float uFlap;
uniform float uFold;
uniform float uSweep;
uniform float uSpan;
uniform float uDihedral;
// 0‥1: how firmly the pair is held level to the picture (in the line-up)
uniform float uLevel;

vec3 wRotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c + v.z * s, -v.y * s + v.z * c); }
vec3 wRotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 wTurn(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }

void wingTransform(vec3 pos, vec3 nor, float ripple, out vec3 wpos, out vec3 wnor, out float spanU) {
  vec3 p = pos;
  vec3 n = nor;
  float u = clamp(p.z / uSpan, 0.0, 1.0);
  spanU = u;
  float ang = uDihedral + uFlap * (0.55 + 0.45 * u) + uFold * smoothstep(0.24, 0.62, u);
  p = wRotX(p, ang);
  n = wRotX(n, ang);
  p.y += sin(uTime * 7.0 + u * 9.0 + p.x * 2.0) * 0.035 * u * ripple;
  p = wRotY(p, uSweep);
  n = wRotY(n, uSweep);
  p.z *= uSide;
  n.z *= uSide;
  vec3 root = vec3(uWingRoot.x, uWingRoot.y, uWingRoot.z * uSide);
  SpineFrame f = spineAt(uWingS);
  if (uLevel > 0.0) {
    // A head turned toward the middle twists the neck, and the twist reaches
    // the shoulders: each wing turns about the line of sight on its own root
    // until the span lies flat across the picture.
    vec3 camX = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camY = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 camZ = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    float tilt = atan(dot(f.B, camY), dot(f.B, camX));
    // a span is a line, so either end may be the one on the right
    tilt -= PI * floor(tilt / PI + 0.5);
    vec3 k = vec3(dot(camZ, f.T), dot(camZ, f.N), dot(camZ, f.B));
    p = wTurn(p, k, -tilt * uLevel);
    n = wTurn(n, k, -tilt * uLevel);
  }
  wpos = spineRigid(f, root + p);
  wnor = spineDir(f, n);
}

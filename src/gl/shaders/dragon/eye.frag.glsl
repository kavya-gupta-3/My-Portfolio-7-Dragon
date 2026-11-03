// Glowing reptilian eye with a vertical slit pupil that narrows as the
// dragon gets angry (uRage), plus a sweeping inner shimmer.
#include "../lib/common.glsl"

uniform vec3 uEyeColor;
uniform vec3 uEyeColor2;
uniform float uTime;
uniform float uRage;
uniform float uEyeOpen;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vRest;
varying vec4 vPivot;

void main() {
  if (uEyeOpen < 0.02) discard;
  vec3 d = normalize(vRest - vPivot.xyz);
  vec3 e = normalize(vec3(-0.55, 0.22, vPivot.w));
  vec3 h = normalize(cross(vec3(0.0, 1.0, 0.0), e));
  vec3 v = cross(e, h);
  float a = dot(d, h);
  float b = dot(d, v);
  float f = dot(d, e);
  float iris = smoothstep(0.15, 0.75, f);
  float slit = mix(0.11, 0.035, uRage);
  float pupil = smoothstep(slit, slit * 0.4, abs(a)) * smoothstep(0.75, 0.45, abs(b)) * step(0.35, f);
  float ring = 0.65 + 0.35 * sin(f * 38.0 - uTime * 2.4 + atan(b, a) * 3.0);
  vec3 col = mix(uEyeColor2, uEyeColor, iris) * (1.6 + 5.5 * iris * ring) * (1.0 + uRage * 1.5);
  col = mix(col, vec3(0.02, 0.0, 0.0), pupil);
  // dark limbal ring
  col *= smoothstep(-0.2, 0.25, f) * 0.85 + 0.15;
  gl_FragColor = vec4(col * uEyeOpen, 1.0);
}

// Fire breath. Every particle is born at the mouth with its own speed and
// spread, and the rest of its life is worked out here from its age: it slows
// in the air, rises as it cools, curls in the turbulence and swells. The
// colour follows the temperature, white at the jaws to red, then smoke.
#include "../lib/common.glsl"

varying float vAge;
varying vec4 vSeed;
varying float vNear;

#ifdef VERTEX
attribute float aBirth;
attribute vec3 aVel;
attribute vec4 aSeed;
uniform float uTime;
uniform float uProj;
uniform float uSize;

void main() {
  float life = mix(0.42, 0.8, aSeed.x);
  float age = uTime - aBirth;
  float u = age / life;
  vAge = u;
  vSeed = aSeed;
  if (u < 0.0 || u > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  // air drag: fast out of the jaws, then hanging and spreading
  float k = 2.6;
  vec3 p = position + aVel * (1.0 - exp(-k * age)) / k;
  p.y += age * age * (2.2 + aSeed.y * 2.4);
  float t = uTime * 2.6 + aSeed.z * 20.0;
  p += vec3(sin(t + p.y * 0.7), sin(t * 1.3 + p.x * 0.6), cos(t * 1.1 + p.z * 0.8)) * age * age * 3.2;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  float size = mix(0.28, 3.4, pow(u, 0.62)) * (0.7 + aSeed.w * 0.6) * uSize;
#ifdef SMOKE
  size *= 1.35;
#endif
  // right in front of the lens a puff is only a blur, and a costly one
  vNear = smoothstep(1.5, 7.0, depth);
  gl_PointSize = depth > 0.4 ? min(size * uProj / depth, 360.0) : 0.0;
  gl_Position = projectionMatrix * mv;
}
#else
uniform sampler2D tPuff;
uniform vec3 uCore;
uniform vec3 uFlame;
uniform vec3 uEmber;
uniform float uTime;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  // a turning, billowing puff rather than a disc
  float a = vSeed.z * 6.283 + vAge * (vSeed.y - 0.5) * 3.0;
  vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * c;
  float n = texture2D(tPuff, q * 0.9 + vSeed.xy + vAge * 0.25).r;
  float shape = smoothstep(0.5, 0.05, length(c) + (n - 0.5) * 0.5);
  if (shape <= 0.004) discard;
  float u = vAge;
#ifdef SMOKE
  // what is left once it has burnt: dark, and it hangs
  float alpha = shape * smoothstep(0.45, 0.75, u) * (1.0 - smoothstep(0.8, 1.0, u)) * 0.34 * vNear;
  gl_FragColor = vec4(vec3(0.05, 0.035, 0.03) * (0.6 + n * 0.5), alpha);
#else
  // dozens of puffs overlap in the stream, so each one is only a little light
  vec3 col = mix(uCore * 1.6, uFlame * 0.9, smoothstep(0.0, 0.16, u + (n - 0.5) * 0.1));
  col = mix(col, uEmber * 0.55, smoothstep(0.22, 0.55, u + (n - 0.5) * 0.24));
  col = mix(col, uEmber * 0.06, smoothstep(0.55, 0.9, u));
  // hotter in the middle of each puff, so a stream of them reads as a body of flame
  col *= 0.4 + 1.1 * pow(shape, 1.6) + (n - 0.5) * 0.6;
  float fade = smoothstep(0.0, 0.05, u) * pow(1.0 - u, 1.4);
  gl_FragColor = vec4(col * shape * fade * vNear, 1.0);
#endif
}
#endif

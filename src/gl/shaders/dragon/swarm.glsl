// PIXEL's swarm: single pixels riding around the body in a loose shell, each
// on its own slow orbit. They scatter from the pointer and drift back.
#include "../lib/dragon_core.glsl"

uniform vec3 uColA;
uniform vec3 uColB;
uniform float uPixelRatio;
uniform float uReveal;
uniform float uBurst;
uniform vec4 uHaze;

varying vec3 vColor;

#ifdef VERTEX
attribute vec4 aSeed;
uniform vec4 uTouch[4];
uniform float uTouching;
void main() {
  SpineFrame f = spineAt(aSeed.x * uSpineLen * 0.92);
  float a = aSeed.y * TAU + uTime * (0.25 + aSeed.w * 0.7) * (aSeed.w < 0.5 ? -1.0 : 1.0);
  float r = (1.15 + aSeed.z * aSeed.z * 2.6) * f.scale * (1.0 + uBurst * 2.2);
  vec3 p = f.P + (f.N * cos(a) + f.B * sin(a)) * r + f.T * sin(uTime * 0.6 + aSeed.y * 20.0) * 0.5;
  float hit = 0.0;
  if (uTouching > 0.0) {
    vec3 push = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec3 away = p - uTouch[i].xyz;
      float d = length(away);
      float k = uTouch[i].w * exp(-d * d * 0.16);
      push += away / max(d, 0.25) * k;
      hit += k;
    }
    p += push / max(hit, 1.0) * 2.6;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = (0.05 + aSeed.w * 0.06) * (1.0 + sat(hit) * 1.2);
  // a whole number of screen pixels: these should look like pixels
  gl_PointSize = floor(max(2.0, size * uPixelRatio * 760.0 / max(-mv.z, 0.5))) * step(0.5, uReveal);
  float blink = step(0.3, fract(aSeed.y * 7.0 + uTime * (0.4 + aSeed.w)));
  vColor = mix(mix(uColA, uColB, aSeed.z), vec3(1.0), sat(hit) * 0.5) * (0.5 + blink * 0.8 + sat(hit) * 1.6) * (1.0 - uHaze.a);
  gl_Position = projectionMatrix * mv;
}
#else
void main() {
  gl_FragColor = vec4(vColor, 1.0);
}
#endif

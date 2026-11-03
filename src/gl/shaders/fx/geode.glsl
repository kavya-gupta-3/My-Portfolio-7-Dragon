// The crystal JADE sleeps in. Every facet is its own triangle, so the shell can
// crack along its edges and then fly apart, each shard tumbling on its own.
#include "../lib/common.glsl"

varying vec3 vWorld;
varying vec3 vBary;
varying vec3 vSeed;
varying float vDepth;

#ifdef VERTEX
attribute vec3 aCentroid;
attribute vec3 aBary;
attribute vec3 aSeed;
uniform float uBurst;
uniform vec3 uCenter;

void main() {
  vec3 rel = position - aCentroid;
  vec3 c = aCentroid;
  if (uBurst > 0.0) {
    vec3 axis = normalize(aSeed - 0.5);
    float a = uBurst * (3.0 + aSeed.x * 8.0);
    rel = rel * cos(a) + cross(axis, rel) * sin(a) + axis * dot(axis, rel) * (1.0 - cos(a));
    c += normalize(aCentroid) * uBurst * (12.0 + aSeed.y * 34.0);
    c.y -= uBurst * uBurst * (3.0 + aSeed.z * 12.0);
    rel *= 1.0 - smoothstep(0.8, 1.3, uBurst);
  }
  vec3 w = uCenter + c + rel;
  vWorld = w;
  vBary = aBary;
  vSeed = aSeed;
  vDepth = length(position) / 9.0;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}
#else
uniform vec3 uGem;
uniform vec3 uGemHi;
uniform vec3 uCenter;
uniform float uHeart;
uniform float uCrack;
uniform float uBurst;
uniform float uFade;

void main() {
  vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.5, 0.7, 0.5));
  float NoV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NoV, 3.0);
  float spec = pow(max(dot(reflect(-L, N), V), 0.0), 40.0);
  // each facet its own depth of colour
  vec3 col = mix(uGem * 0.05, uGem * 0.32, vSeed.x) * (0.45 + 0.75 * max(dot(N, L), 0.0));
  col += uGemHi * spec * (0.5 + vSeed.y);
  col += mix(uGem, uGemHi, 0.4) * fres * 0.55;
  // the heart: light from the middle of the stone, brightest where you look through it
  vec3 toHeart = normalize(uCenter - vWorld);
  float through = pow(max(dot(toHeart, -V), 0.0), 5.0);
  col += mix(uGem, uGemHi, through) * through * uHeart * 5.0;
  col += uGem * uHeart * (0.35 + vSeed.z * 0.4);
  // cracks run along the facet edges, one facet at a time
  float edge = min(vBary.x, min(vBary.y, vBary.z));
  float open = step(vSeed.y, uCrack);
  float line = smoothstep(0.035, 0.0, edge) * open;
  col += mix(uGemHi, vec3(1.0), 0.4) * line * (2.4 + uHeart * 7.0);
  col += uGemHi * smoothstep(0.16, 0.0, edge) * open * 0.3 * (0.4 + uHeart * 1.4);
  float alpha = mix(0.8, 0.97, fres);
  // a shard catches the light as it tumbles, then burns out
  if (uBurst > 0.0) {
    col += uGem * (0.25 + vSeed.x * 0.75) + uGemHi * smoothstep(0.03, 0.0, edge) * 1.6;
    alpha = 1.0;
  }
  gl_FragColor = vec4(col, alpha * uFade);
}
#endif

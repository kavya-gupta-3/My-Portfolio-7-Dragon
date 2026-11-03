// CPU-simulated particles (fire breath, sparks, coin glints, shards,
// stardust). Kind: 0 fire, 1 spark, 2 glint (4-point star), 3 shard, 4 dust, 5 pixel.
#include "../lib/common.glsl"

varying vec3 vColor;
varying float vLife;
varying float vKind;
varying float vSeed;

#ifdef VERTEX
attribute vec3 aColor;
attribute vec4 aState; // x = age/life (0‥1, >1 dead), y = size, z = kind, w = seed
uniform float uPixelRatio;
void main() {
  vec4 mv = viewMatrix * vec4(position, 1.0);
  vLife = aState.x;
  vKind = aState.z;
  vSeed = aState.w;
  vColor = aColor;
  float alive = step(aState.x, 1.0);
  float grow = vKind < 0.5 ? (0.6 + aState.x * 1.6) : (1.0 - aState.x * 0.5);
  gl_PointSize = alive * aState.y * grow * uPixelRatio * 40.0 / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}
#else
uniform float uTime;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float t = vLife;
  float fade = smoothstep(0.0, 0.08, t) * pow(1.0 - sat(t), 1.4);
  float a;
  vec3 col = vColor;
  if (vKind < 0.5) {
    // fire: hot core cooling to red smoke
    a = pow(smoothstep(0.5, 0.0, d), 1.8);
    col = mix(vec3(1.0, 0.92, 0.6) * 3.0, vColor * 1.6, smoothstep(0.0, 0.35, t));
    col = mix(col, vec3(0.25, 0.02, 0.01), smoothstep(0.55, 1.0, t));
  } else if (vKind < 1.5) {
    a = pow(smoothstep(0.5, 0.0, d), 4.0) * 2.0;
    col *= 2.5;
  } else if (vKind < 2.5) {
    float star = smoothstep(0.08, 0.0, abs(c.x) * abs(c.y) * 30.0) + smoothstep(0.5, 0.0, d) * 0.6;
    a = star * (0.6 + 0.4 * sin(uTime * 20.0 + vSeed * 50.0));
    col *= 2.2;
  } else if (vKind < 3.5) {
    vec2 r = rot2(vSeed * 6.0 + uTime * 3.0) * c;
    a = step(abs(r.x) + abs(r.y) * 0.5, 0.42) * 1.2;
    col *= 1.8;
  } else if (vKind < 4.5) {
    a = pow(smoothstep(0.5, 0.0, d), 2.0);
  } else {
    // a hard-edged square that blinks out in steps, like an old sprite
    a = step(0.5, fract(t * 7.0 + 0.25) + (1.0 - t) * 1.2);
    fade = 1.0;
    col *= 1.9;
  }
  if (a * fade < 0.003) discard;
  gl_FragColor = vec4(col * a * fade, 1.0);
}
#endif

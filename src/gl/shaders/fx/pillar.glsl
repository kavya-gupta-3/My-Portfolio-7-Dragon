// The two pillars either side of the opening shot: black obsidian with a
// column of runes cut into each face, burning from the fire bowl on top.
#include "../lib/common.glsl"

varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;

#ifdef VERTEX
void main() {
  vLocal = position;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
#else
uniform float uTime;
uniform float uFire;
uniform float uTop;
uniform vec3 uGlow;
uniform float uOpacity;

float stroke(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  return 1.0 - smoothstep(w, w + fwidth(d) * 1.5, d);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  // polished black stone: a little key light, and the fire above catching every edge
  vec3 L = normalize(vec3(-0.45, 0.7, 0.55));
  float key = max(dot(N, L), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float nearFire = exp(-max(uTop - vLocal.y, 0.0) * 0.22) * uFire;
  vec3 col = vec3(0.012, 0.011, 0.014) + vec3(0.05, 0.045, 0.06) * key;
  col += uGlow * (rim * (0.15 + nearFire * 1.2) + max(N.y, 0.0) * nearFire * 0.8);
  col += vec3(0.5, 0.12, 0.03) * max(-N.y, 0.0) * 0.25;
  // runes down the middle of each side face, glowing up toward the flame
  vec3 a = abs(N);
  if (a.y < 0.5) {
    float across = a.x > a.z ? vLocal.z : vLocal.x;
    float cell = floor(vLocal.y / 1.15);
    vec2 q = vec2(across / 0.8, fract(vLocal.y / 1.15) - 0.5);
    if (abs(q.x) < 0.5 && vLocal.y > 1.6 && vLocal.y < uTop - 1.6) {
      float h1 = hash11(cell * 3.7 + (a.x > a.z ? 1.0 : 2.0));
      float h2 = hash11(cell * 1.3 + 0.7);
      float g = stroke(q, vec2(0.0, -0.32), vec2(0.0, 0.32), 0.035);
      g = max(g, h1 > 0.5 ? stroke(q, vec2(-0.22, 0.2), vec2(0.22, -0.08), 0.03) : stroke(q, vec2(-0.22, -0.16), vec2(0.22, 0.12), 0.03));
      if (h2 > 0.6) g = max(g, stroke(q, vec2(-0.2, -0.32), vec2(0.2, -0.32), 0.03));
      float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(vLocal.y * 0.6 - uTime * 2.2), 3.0);
      col += uGlow * g * pulse * (0.5 + nearFire) * 2.2 * uFire;
    }
  }
  gl_FragColor = vec4(col, uOpacity);
}
#endif

// Wing membranes. GOLD: translucent amber with veins and gold bones.
// FIRE: a living sheet of flame with a burning, tattered trailing edge.
#include "../lib/common.glsl"
#include "../lib/lighting.glsl"

uniform float uTime;
uniform float uReveal;
uniform float uRage;
uniform float uSide;
uniform float uPanels;
uniform vec3 uTintA;
uniform vec3 uTintB;

varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying float vKind;
varying float vSpan;
varying vec3 vLocal;

void main() {
  bool front = gl_FrontFacing;
  if (uSide < 0.0) front = !front;
  vec3 N = normalize(vNormal);
  if (!front) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
#ifdef SOLID
  const float burn = 0.0;
#else
  float n0 = vnoise(vLocal * 1.7);
  float reveal = uReveal * 1.5 - vSpan * 0.5 - n0 * 0.35;
  if (reveal < 0.0) discard;
  float burn = smoothstep(0.12, 0.0, reveal);
#endif
  vec3 L = normalize(uKeyDir);
  float back = pow(max(dot(-N, L), 0.0), 1.2) + pow(max(dot(-V, L), 0.0), 3.0) * 0.6;

  if (vKind > 1.5) {
    // bones
#if defined(FIRE)
    vec3 col = shadePBR(vec3(0.08, 0.01, 0.01), 0.2, 0.35, N, V, 1.0) + uTintA * 0.25;
#elif defined(STARS)
    vec3 col = shadePBR(uTintA * 0.2, 0.2, 0.3, N, V, 1.0) + uTintB * 1.5;
#else
    vec3 col = shadePBR(uTintB, 1.0, 0.28, N, V, 1.0);
#endif
    col += uTintA * burn * 5.0;
    gl_FragColor = vec4(applyHaze(col), 1.0);
    return;
  }

  float edge = vUv.y;
  // skin stretched between the fingers: it bellies out in the middle of each
  // panel and is pulled tight along the bones, so the wing has real volume
  float panel = fract(vUv.x * uPanels);
  float tight = smoothstep(0.0, 0.2, min(panel, 1.0 - panel));
  float thin = sin(panel * PI) * smoothstep(0.0, 0.32, edge);
  N = bumpNormal(vWorld, N, sqrt(thin) * 0.5, 1.0);
#if defined(FIRE)
  float f = (vnoise(vec2(vUv.x * 7.0, vUv.y * 2.4 - uTime * 1.3)) - 0.5) * 1.1 + (vnoise(vec2(vUv.x * 16.0 + uTime * 0.4, vUv.y * 6.0 - uTime * 2.2)) - 0.5) * 0.55;
  float tatter = 0.84 + f * 0.13 + sin(vUv.x * 90.0 + uTime * 3.0) * 0.012;
  if (edge > tatter) discard;
  float heat = sat(edge * 0.9 + f * 0.6 + 0.15);
  vec3 c0 = vec3(0.05, 0.0, 0.0);
  vec3 c1 = uTintA * 0.9;
  vec3 c2 = uTintB * 1.6;
  vec3 c3 = vec3(1.0, 0.85, 0.45) * 3.0;
  vec3 col = mix(c0, c1, smoothstep(0.1, 0.45, heat));
  col = mix(col, c2, smoothstep(0.45, 0.75, heat));
  col = mix(col, c3, smoothstep(0.82, 1.0, heat));
  // the skin chars black along the bones; the fire is the part that burns through
  float filament = pow(1.0 - min(abs(f) * 2.4, 1.0), 5.0);
  col *= mix(0.3, 1.0, tight);
  col += c2 * filament * smoothstep(0.3, 0.7, heat) * 0.7;
  col += c2 * smoothstep(tatter - 0.06, tatter, edge) * 2.0;
  col *= 1.0 + uRage * 0.8;
  float rim = pow(1.0 - abs(dot(N, V)), 3.0);
  col += uRimColor * rim * 0.8;
#elif defined(STARS)
  // a sheet of night sky: nebula colour, star dust and a burning trailing edge
  float neb = 0.5 + 0.5 * sin(vUv.x * 11.0 + uTime * 0.2 + 2.0 * sin(vUv.y * 5.0 - uTime * 0.13));
  vec3 col = mix(uTintA * 0.05, uTintB * 0.1, neb * (0.3 + 0.7 * edge)) * (0.45 + 0.55 * tight);
  vec2 dust = vec2(vUv.x * 300.0, vUv.y * 70.0);
  float star = hash12(floor(dust));
  float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + star * 50.0);
  col += vec3(0.85, 0.9, 1.0) * step(0.975, star) * smoothstep(0.5, 0.1, length(fract(dust) - 0.5)) * twinkle * 2.6;
  col += mix(uTintA, uTintB, neb) * pow(edge, 7.0) * 1.8;
  float rim = pow(1.0 - abs(dot(N, V)), 3.0);
  col += uTintB * rim * 0.6;
  col += vec3(0.5, 0.42, 0.9) * back * 0.1 * thin;
  // a highlight sliding over the curve of each panel
  col += uTintA * pow(max(dot(reflect(-L, N), V), 0.0), 12.0) * 0.5;
#else
  // veins: along fingers and fine branching
  float web = sin(vUv.x * 130.0 + sin(vUv.y * 21.0) * 2.0) * sin(vUv.y * 31.0 + sin(vUv.x * 37.0) * 2.0);
  float fine = smoothstep(0.12, 0.0, abs(web));
  // thick and dark near the bones, thin enough in the middle for light to come through
  vec3 skin = mix(uTintA * 0.12, uTintA * 0.6, 0.2 + 0.8 * thin);
  vec3 col = shadePBR(skin, 0.3, 0.44, N, V, 0.4 + 0.6 * tight);
  col += mix(uTintA, uTintB, 0.5) * back * (0.3 + 0.9 * thin) * (1.0 - fine * 0.35) * 0.8;
  col = mix(col, col * 0.45, fine * 0.5);
  col += uTintB * smoothstep(0.9, 1.0, edge) * 0.35;
#endif
  col += uTintB * burn * 5.0;
  gl_FragColor = vec4(applyHaze(col), 1.0);
}

// Shared lighting: a single key light, hemisphere ambient, rim light and an
// analytic environment for reflections. Each dragon sets its own colours, so
// the same model reads as molten obsidian in one stage and gold in another.

uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uRimColor;
uniform vec3 uEnvTop;
uniform vec3 uEnvHorizon;
uniform vec3 uEnvBottom;
uniform vec4 uHaze;
uniform float uPulse;
uniform float uWave;

/** A band of light that runs down the body when a dragon stirs. */
float wavePulse(float s) {
  if (uWave <= 0.0) return 0.0;
  float d = (s - uWave * 1.25 + 0.12) * 11.0;
  // the whole head counts as the start of the body: it gets a glint, not the full band
  return exp(-d * d) * (s > 0.0 ? 1.0 : 0.16);
}

/** Atmospheric perspective + the fade that keeps page text readable. */
vec3 applyHaze(vec3 c) { return mix(c, uHaze.rgb, uHaze.a); }

float D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-5);
}

float V_SmithGGX(float NoV, float NoL, float a) {
  float k = a * 0.5;
  return 0.25 / ((NoV * (1.0 - k) + k) * (NoL * (1.0 - k) + k) + 1e-5);
}

vec3 F_Schlick(vec3 f0, float c) { return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }

vec3 envAnalytic(vec3 r, float rough) {
  float y = r.y;
  vec3 c = y > 0.0 ? mix(uEnvHorizon, uEnvTop, pow(y, 0.55)) : mix(uEnvHorizon, uEnvBottom, pow(-y, 0.45));
  float sharp = mix(220.0, 6.0, rough);
  c += uKeyColor * pow(max(dot(r, uKeyDir), 0.0), sharp) * mix(5.0, 0.6, rough);
  // two long strip lights give metal its studio "streaks"
  float strip = smoothstep(0.82 + rough * 0.1, 1.0, abs(dot(r, normalize(vec3(0.9, 0.18, -0.35)))));
  float strip2 = smoothstep(0.86 + rough * 0.1, 1.0, abs(dot(r, normalize(vec3(-0.5, 0.65, 0.5)))));
  c += (strip * 0.5 + strip2 * 0.3) * (uEnvTop + uKeyColor * 0.25) * (1.0 - rough * 0.7);
  return c;
}

vec3 hemi(vec3 n) { return mix(uGroundColor, uSkyColor, n.y * 0.5 + 0.5); }

/**
 * Compact PBR: GGX specular + Lambert diffuse + hemisphere ambient +
 * analytic environment + rim. Returns linear HDR colour.
 */
vec3 shadePBR(vec3 albedo, float metal, float rough, vec3 N, vec3 V, float ao) {
  vec3 L = normalize(uKeyDir);
  vec3 H = normalize(L + V);
  float NoL = max(dot(N, L), 0.0);
  float NoV = max(dot(N, V), 1e-3);
  float NoH = max(dot(N, H), 0.0);
  float VoH = max(dot(V, H), 0.0);
  float a = max(rough * rough, 0.002);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F_Schlick(f0, VoH);
  vec3 spec = D_GGX(NoH, a) * V_SmithGGX(NoV, NoL, a) * F;
  vec3 kd = (1.0 - F) * (1.0 - metal);
  vec3 direct = (kd * albedo / PI + spec) * uKeyColor * NoL * PI;
  vec3 R = reflect(-V, N);
  vec3 Fe = F_Schlick(f0, NoV);
  vec3 env = envAnalytic(R, rough) * Fe * mix(1.0, 0.35, rough * (1.0 - metal));
  vec3 amb = hemi(N) * albedo * kd * ao;
  // a cool kicker from behind and to the side separates the animal from the dark
  vec3 K = normalize(vec3(-uKeyDir.x, 0.25, -uKeyDir.z));
  float kick = pow(max(dot(N, K), 0.0), 2.0);
  float rim = pow(1.0 - NoV, 3.0);
  vec3 sheen = (uRimColor + uEnvTop * 0.35) * kick * (0.35 + rim * 1.6);
  // a light event in the world catches every edge of the animal
  float lit = 1.0 + uPulse * 5.0;
  return direct + amb + env * ao + uRimColor * rim * ao * lit + sheen * ao * lit;
}

/** Screen-space bump mapping (Mikkelsen): perturbs n by the gradient of height h. */
vec3 bumpNormal(vec3 p, vec3 n, float h, float strength) {
  vec3 dpdx = dFdx(p);
  vec3 dpdy = dFdy(p);
  float dhdx = dFdx(h);
  float dhdy = dFdy(h);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  return normalize(abs(det) * n - strength * grad);
}

/** Voronoi that tiles every `period` cells along y (wraps around a tube). */
vec3 voronoiWrap(vec2 x, float period) {
  vec2 n = floor(x);
  vec2 f = fract(x);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 c = n + g;
    c.y = mod(c.y, period);
    vec2 o = hash22(c);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = hash12(c); }
    else if (d < f2) { f2 = d; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}

/**
 * Overlapping dragon scales, like roof tiles. `p.x` runs tailward, `p.y`
 * around the body and wraps every `period` columns. Returns (height, id,
 * crevice): height is domed with a keel down the middle of each scale.
 */
vec3 imbricate(vec2 p, float period) {
  float row = floor(p.x);
  for (int r = 2; r >= 0; r--) {
    float rx = row - float(r);
    float off = mod(rx, 2.0) * 0.5;
    float cy = floor(p.y - off);
    for (int c = 0; c < 2; c++) {
      float col = cy + float(c);
      vec2 q = vec2((p.x - rx) / 2.05, (p.y - off - col - 0.0) * 1.34 - 0.0);
      // tip of the scale points tailward; root hides under the row above
      float lx = q.x;
      float ly = q.y - 0.67;
      float d = lx * lx + ly * ly * (1.0 + lx * 1.4);
      if (d < 1.0 && lx >= -0.05) {
        float dome = sqrt(max(1.0 - d, 0.0));
        float keel = exp(-ly * ly * 34.0) * smoothstep(1.0, 0.1, lx);
        float id = hash12(vec2(rx, mod(col, period)));
        return vec3(dome * 0.72 + keel * 0.28, id, smoothstep(0.62, 1.0, d));
      }
    }
  }
  return vec3(0.0, 0.0, 1.0);
}

/** 1 on the inside of the mouth (palate and tongue bed), from the rest normal. */
float mouthMask(int part, vec3 rest, vec3 restN) {
  float behind = smoothstep(-0.35, -0.7, rest.x);
  if (part == 1) return smoothstep(0.5, 0.85, -restN.y) * behind;
  if (part == 2) return smoothstep(0.5, 0.85, restN.y) * behind;
  return 0.0;
}

/** Pale, armoured plates down the belly: returns (height, seam). */
vec2 bellyPlates(float x) {
  float f = fract(x);
  float seam = smoothstep(0.1, 0.0, min(f, 1.0 - f));
  return vec2(smoothstep(0.0, 0.5, f) * smoothstep(1.0, 0.72, f), seam);
}

/** Soft wrap lighting for stylised, emissive-heavy materials. */
float wrapDiffuse(vec3 N, float wrap) {
  return max((dot(N, normalize(uKeyDir)) + wrap) / (1.0 + wrap), 0.0);
}

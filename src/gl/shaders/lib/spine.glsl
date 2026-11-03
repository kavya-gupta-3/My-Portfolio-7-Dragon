// GPU spine deformation.
// Every dragon is modelled straight, in "spine space": x = arclength from the
// back of the skull (0) to the tip of the tail (uSpineLen), y = dorsal, z = side.
// Each frame the CPU writes the dragon's live spine into a float texture:
//   row 0: position.xyz + growth scale   row 1: tangent (tailward)   row 2: normal (dorsal)
// and the vertex shader bends the straight model along it.

uniform sampler2D uSpine;
uniform float uSpineCount;
uniform float uSpineLen;

struct SpineFrame {
  vec3 P;
  vec3 T;
  vec3 N;
  vec3 B;
  float scale;
};

SpineFrame spineAt(float s) {
  float u = clamp(s / uSpineLen, 0.0, 1.0) * (uSpineCount - 1.0);
  float fi = floor(u);
  int i0 = int(fi);
  int i1 = min(i0 + 1, int(uSpineCount) - 1);
  float f = u - fi;
  vec4 p0 = texelFetch(uSpine, ivec2(i0, 0), 0);
  vec4 p1 = texelFetch(uSpine, ivec2(i1, 0), 0);
  vec3 t = mix(texelFetch(uSpine, ivec2(i0, 1), 0).xyz, texelFetch(uSpine, ivec2(i1, 1), 0).xyz, f);
  vec3 n = mix(texelFetch(uSpine, ivec2(i0, 2), 0).xyz, texelFetch(uSpine, ivec2(i1, 2), 0).xyz, f);
  SpineFrame fr;
  fr.T = normalize(t);
  fr.N = normalize(n - fr.T * dot(n, fr.T));
  fr.B = cross(fr.T, fr.N);
  fr.scale = mix(p0.w, p1.w, f);
  // Beyond either end the body continues straight along the end tangent.
  fr.P = mix(p0.xyz, p1.xyz, f) + fr.T * (s - clamp(s, 0.0, uSpineLen)) * fr.scale;
  return fr;
}

vec3 spineDir(SpineFrame f, vec3 d) { return f.T * d.x + f.N * d.y + f.B * d.z; }

/** Rigidly places a local point in the frame (x along T, y along N, z along B). */
vec3 spineRigid(SpineFrame f, vec3 local) { return f.P + spineDir(f, local) * f.scale; }

/** Bends a spine-space point: its own x picks the frame. */
vec3 spineBend(vec3 rest, out SpineFrame f) {
  f = spineAt(rest.x);
  return f.P + (f.N * rest.y + f.B * rest.z) * f.scale;
}

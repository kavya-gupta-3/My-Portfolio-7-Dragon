// Vertex-side anatomy for merged dragon meshes: every vertex carries its
// part id and pivot as attributes.

#include "./dragon_core.glsl"

attribute float aPart;
attribute vec4 aPivot;

void dragonDeform(vec3 pos, vec3 nor, out vec3 wpos, out vec3 wnor) {
  deformPart(int(aPart + 0.5), aPivot, pos, nor, wpos, wnor);
}

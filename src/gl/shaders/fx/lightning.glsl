// Lightning ribbons: each bolt is a polyline expanded to a camera-facing
// strip in screen space, so arcs stay crisp at any distance.
varying float vSide;
varying float vAlpha;
varying float vT;

#ifdef VERTEX
attribute vec3 aNext;
attribute vec3 aPrev;
attribute float aSide;
attribute vec2 aInfo; // x = alpha, y = width (px)
uniform vec2 uResolution;
void main() {
  vec4 cp = projectionMatrix * viewMatrix * vec4(position, 1.0);
  vec4 cn = projectionMatrix * viewMatrix * vec4(aNext, 1.0);
  vec4 cv = projectionMatrix * viewMatrix * vec4(aPrev, 1.0);
  vec2 sp = cp.xy / cp.w * uResolution;
  vec2 sn = cn.xy / cn.w * uResolution;
  vec2 sv = cv.xy / cv.w * uResolution;
  vec2 dir = normalize((sn - sp) + (sp - sv) + 1e-5);
  vec2 normal = vec2(-dir.y, dir.x);
  cp.xy += normal * aSide * aInfo.y / uResolution * cp.w;
  vSide = aSide;
  vAlpha = aInfo.x;
  gl_Position = cp;
}
#else
uniform vec3 uColor;
void main() {
  float core = 1.0 - abs(vSide);
  float a = pow(core, 1.6) * vAlpha;
  vec3 col = mix(uColor, vec3(1.0), pow(core, 6.0)) * 4.0;
  gl_FragColor = vec4(col * a, 1.0);
}
#endif

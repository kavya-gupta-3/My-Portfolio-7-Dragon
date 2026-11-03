/**
 * Parametric dragon skulls. A head is a smooth union of cranium, snout,
 * brows, cheeks, nostrils and crest, carved by eye sockets and the mouth
 * line; the lower jaw is a separate hinged piece. Head space: origin at the
 * neck joint, snout toward −x, y up, z to the side.
 */
import { GeoBuilder, PART, bezier3, sphere, taper, tube, type V3 } from './anatomy';
import { sdEllipsoid, sdRoundCone, sdSphere, smax, smin, surfaceNets, type SDF } from './sdf';

export interface HeadSpec {
  len: number;
  w: number;
  h: number;
  snout: number;
  brow: number;
  cheek: number;
  jaw: number;
  neck: number;
  eye: number;
  crest?: number;
  nostril?: number;
  blend?: number;
  /** Extra downward hook at the snout tip (0‥1). */
  hook?: number;
  /** Gap between upper and lower jaw. */
  gap?: number;
}

export interface HeadInfo {
  eyes: V3[];
  hinge: V3;
  mouthCorner: V3;
  snoutTip: V3;
  mouth: (x: number) => number;
  snoutHalfWidth: (x: number) => number;
}

export function headInfo(s: HeadSpec): HeadInfo {
  const L = s.len;
  const xc = -0.34 * L;
  const yc = -0.24 * s.h;
  const xt = -0.98 * L;
  const yt = -0.12 * s.h - (s.hook ?? 0) * 0.08 * s.h;
  const mouth = (x: number) => yc + ((x - xc) / (xt - xc)) * (yt - yc);
  const r0 = Math.min(s.h, s.w) * 0.72;
  const snoutHalfWidth = (x: number) => {
    const t = Math.min(1, Math.max(0, (x - -0.5 * L) / (xt - -0.5 * L)));
    return r0 + (s.snout - r0) * t;
  };
  const eyes: V3[] = [
    [-0.47 * L, 0.36 * s.h, 0.74 * s.w],
    [-0.47 * L, 0.36 * s.h, -0.74 * s.w],
  ];
  return { eyes, hinge: [xc + 0.12 * L, yc, 0], mouthCorner: [xc, yc, 0], snoutTip: [xt, yt, 0], mouth, snoutHalfWidth };
}

export function headSDF(s: HeadSpec): SDF {
  const L = s.len;
  const k = s.blend ?? 0.12;
  const info = headInfo(s);
  const gap = s.gap ?? 0.035;
  const r0 = Math.min(s.h, s.w) * 0.72;
  const brow = s.brow;
  const cheek = s.cheek;
  const crest = s.crest ?? 0;
  const nos = s.nostril ?? 1;
  const hook = s.hook ?? 0;
  const [ex, ey, ez] = info.eyes[0];
  return (x, y, z) => {
    const az = Math.abs(z);
    let d = sdEllipsoid(x + 0.3 * L, y - 0.04 * s.h, z, 0.36 * L, s.h, s.w);
    // snout, slightly flattened
    const sy = 1.18;
    d = smin(d, sdRoundCone(x, y * sy, z, -0.46 * L, 0.02, 0, -0.96 * L + s.snout, -0.06 * s.h - hook * 0.1 * s.h, 0, r0, s.snout) / sy, k);
    // neck collar so the skull flows into the body
    d = smin(d, sdRoundCone(x, y, z, 0.25, -0.04, 0, -0.2 * L, 0.02, 0, s.neck, s.h * 0.85), k * 1.2);
    // brows: angry ridges over the eyes
    if (brow > 0) d = smin(d, sdEllipsoid(x - ex + 0.02 * L, y - ey - 0.3 * s.h, az - ez * 0.82, 0.24 * L * brow, 0.13 * s.h * brow, 0.17 * s.w), k * 0.6);
    // cheeks / jaw muscles
    if (cheek > 0) d = smin(d, sdEllipsoid(x + 0.24 * L, y + 0.16 * s.h, az - 0.62 * s.w, 0.22 * L, 0.52 * s.h, 0.34 * s.w * cheek), k);
    // sagittal crest
    if (crest > 0) d = smin(d, sdEllipsoid(x + 0.2 * L, y - 0.86 * s.h, z, 0.34 * L, 0.2 * s.h * crest, 0.1 * s.w), k * 0.8);
    // nostrils
    if (nos > 0) d = smin(d, sdEllipsoid(x + 0.9 * L, y - s.snout * 0.72, az - s.snout * 0.5, 0.09 * L * nos, s.snout * 0.32, s.snout * 0.34), k * 0.4);
    // eye sockets
    d = smax(d, -sdSphere(x - ex, y - ey, az - ez, s.eye * 1.15), 0.05);
    // nostril holes
    if (nos > 0) d = smax(d, -sdSphere(x + 0.93 * L, y - s.snout * 0.82, az - s.snout * 0.5, s.snout * 0.16), 0.02);
    // mouth: keep everything above the mouth line (only in front of the corner)
    const cut = info.mouth(x) + gap * 0.5 - y - Math.max(0, x - info.mouthCorner[0]) * 4;
    d = smax(d, cut, 0.025);
    return d;
  };
}

export function jawSDF(s: HeadSpec): SDF {
  const L = s.len;
  const info = headInfo(s);
  const gap = s.gap ?? 0.035;
  const [hx, hy] = info.hinge;
  const tipX = -0.94 * L;
  const tipY = info.mouth(tipX);
  const zs = 1.25;
  return (x, y, z) => {
    let d = sdRoundCone(x, y, z / zs, hx + 0.05, hy - s.jaw * 0.85, 0, tipX + s.jaw * 0.4, tipY - s.jaw * 0.55, 0, s.jaw, s.jaw * 0.42) * Math.min(1, zs);
    d = smin(d, sdEllipsoid(x - hx, y - hy + s.jaw * 0.2, Math.abs(z) - s.w * 0.45, 0.16 * L, s.jaw * 0.9, s.w * 0.26), 0.08);
    const cut = y - (info.mouth(x) - gap * 0.5);
    d = smax(d, cut, 0.02);
    return d;
  };
}

/**
 * Where a tooth stands on a jaw at `x`: in from the edge, rooted a little under
 * the gum. `dir` is the way the search walks, from the open mouth into the
 * bone. Null where there is no jaw left to stand on.
 */
function seat(sdf: SDF, x: number, from: number, dir: 1 | -1, reach: number, side: number) {
  const step = 0.004;
  const gum = (z: number) => {
    for (let k = 0, y = from; k * step < reach; k++, y += dir * step) if (sdf(x, y, z) < 0) return y;
    return null;
  };
  const middle = gum(0);
  if (middle === null) return null;
  // how wide the jaw is just inside its edge
  let w = 0;
  while (w < 2 && sdf(x, middle + dir * 0.03, w + step) < 0) w += step;
  const z = w * 0.66 * side;
  const y = gum(z);
  return y === null ? null : { y: y + dir * 0.025, z };
}

/** Meshes the skull + jaw and adds eyes and teeth. Returns the eye centres. */
export function addHead(
  b: GeoBuilder,
  eyes: GeoBuilder,
  s: HeadSpec,
  cell: number,
  opts: { teeth?: number; fangs?: boolean; flat?: boolean } = {},
): HeadInfo {
  const info = headInfo(s);
  const L = s.len;
  const pad = Math.max(s.h, s.w) * 0.6 + 0.2;
  const head = surfaceNets(headSDF(s), { min: [-L - 0.1, -s.h * 1.05, -s.w - pad * 0.5], max: [0.5, s.h * 1.6 + (s.crest ?? 0) * 0.3, s.w + pad * 0.5] }, cell, opts.flat);
  b.addMesh(head, PART.HEAD);
  const jaw = surfaceNets(jawSDF(s), { min: [-L - 0.05, -s.h * 1.2 - s.jaw, -s.w - 0.2], max: [0.3, s.h * 0.2, s.w + 0.2] }, cell, opts.flat);
  b.addMesh(jaw, PART.JAW, [info.hinge[0], info.hinge[1], info.hinge[2], 0]);

  // teeth along both jaws (hidden until the mouth opens), each one rooted in
  // the gum it grows from: the jaw narrows and drops toward the tip, so a row
  // laid along the mouth line would float beside and above it
  const n = opts.teeth ?? 7;
  const gap = s.gap ?? 0.035;
  const skull = headSDF(s);
  const lower = jawSDF(s);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = info.mouthCorner[0] + (info.snoutTip[0] + s.snout * 0.6 - info.mouthCorner[0]) * t;
      const big = opts.fangs && i === n - 2 ? 1.9 : 1;
      const len = (0.07 + 0.05 * Math.sin(i * 2.1) ** 2) * s.h * 1.4 * big;
      const up = seat(skull, x, info.mouth(x) + gap * 0.5 - 0.06, 1, s.h, side);
      if (up) tube(b, [[x, up.y, up.z], [x, up.y - len, up.z * 0.97]], [len * 0.28, 0], 4, PART.TOOTH, [0, 0, 0, 0]);
      const low = seat(lower, x + 0.03, info.mouth(x) - gap * 0.5 + 0.06, -1, s.jaw * 3 + 0.2, side);
      if (low) tube(b, [[x + 0.03, low.y, low.z], [x + 0.03, low.y + len * 0.85, low.z * 0.97]], [len * 0.26, 0], 4, PART.TOOTH_LOW, [info.hinge[0], info.hinge[1], info.hinge[2], 0]);
    }
  }
  for (const [i, e] of info.eyes.entries()) {
    sphere(eyes, e, [s.eye * 1.05, s.eye * 0.8, s.eye], 14, PART.EYE, [e[0], e[1], e[2], i === 0 ? 1 : -1]);
  }
  return info;
}

/** A pair of horns sweeping back from the crown. */
export function addHorns(
  b: GeoBuilder,
  s: HeadSpec,
  o: {
    base: V3;
    c1: V3;
    c2: V3;
    tip: V3;
    radius: number;
    ribs?: number;
    radial?: number;
    flat?: number;
    steps?: number;
    part?: number;
  },
) {
  for (const side of [1, -1]) {
    const m = (v: V3): V3 => [v[0] * s.len, v[1] * s.h, v[2] * s.w * side];
    const pts = bezier3(m(o.base), m(o.c1), m(o.c2), m(o.tip), o.steps ?? 12);
    tube(b, pts, taper(pts.length, o.radius, 0, 1.1, o.ribs ?? 0), o.radial ?? 7, o.part ?? PART.HORN, [0, 0, 0, side], { flat: o.flat ?? 1 });
  }
}

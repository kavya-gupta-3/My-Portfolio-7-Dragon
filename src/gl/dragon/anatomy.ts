/**
 * Procedural anatomy toolkit. Builds dragon parts as plain typed arrays in
 * spine space (x = arclength along the body, y = dorsal, z = side) or in
 * head space (origin at the neck joint, snout toward −x). Worker-safe.
 */
import type { Mesh } from './sdf';

export const PART = {
  BODY: 0,
  HEAD: 1,
  JAW: 2,
  HORN: 3,
  SPIKE: 4,
  LEG: 5,
  WHISKER: 6,
  TOOTH: 7,
  TOOTH_LOW: 8,
  EYE: 9,
  MANE: 10,
  CLAW: 11,
  SEGMENT_ID: 12,
  WING: 13,
} as const;

export type V3 = [number, number, number];

export interface PackedGeometry {
  attributes: Record<string, { array: Float32Array; itemSize: number }>;
  index?: Uint32Array;
  /** Present for instanced geometry. */
  instances?: { count: number; attributes: Record<string, { array: Float32Array; itemSize: number }> };
}

export type GeometryPack = Record<string, PackedGeometry> & { meta?: never };

/** Accumulates vertices for one merged mesh. */
export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private part: number[] = [];
  private pivot: number[] = [];
  private extra: number[] = [];
  private idx: number[] = [];

  get vertexCount() {
    return this.pos.length / 3;
  }

  vertex(p: V3, n: V3, u: number, v: number, part: number, pivot: [number, number, number, number], extra = 0) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(u, v);
    this.part.push(part);
    this.pivot.push(pivot[0], pivot[1], pivot[2], pivot[3]);
    this.extra.push(extra);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  /** Append an SDF mesh (already in the right space). */
  addMesh(mesh: Mesh, part: number, pivot: [number, number, number, number] = [0, 0, 0, 0], uvMode: 'xz' | 'xy' = 'xy') {
    const base = this.vertexCount;
    const { positions: p, normals: n, indices } = mesh;
    for (let i = 0; i < p.length; i += 3) {
      const u = p[i];
      const v = uvMode === 'xy' ? p[i + 1] : p[i + 2];
      this.vertex([p[i], p[i + 1], p[i + 2]], [n[i], n[i + 1], n[i + 2]], u, v, part, pivot);
    }
    for (let i = 0; i < indices.length; i++) this.idx.push(indices[i] + base);
  }

  pack(): PackedGeometry {
    const count = this.vertexCount;
    return {
      attributes: {
        position: { array: new Float32Array(this.pos), itemSize: 3 },
        normal: { array: new Float32Array(this.nor), itemSize: 3 },
        uv: { array: new Float32Array(this.uv), itemSize: 2 },
        aPart: { array: new Float32Array(this.part), itemSize: 1 },
        aPivot: { array: new Float32Array(this.pivot), itemSize: 4 },
        aExtra: { array: new Float32Array(this.extra), itemSize: 1 },
      },
      index: count > 0 ? new Uint32Array(this.idx) : undefined,
    };
  }
}

/* ------------------------------------------------------------------ body */

export interface BodySpec {
  length: number;
  /** Radius at normalised arclength t ∈ [0,1]. */
  radius: (t: number) => number;
  segments: number;
  radial: number;
  /** Vertical / horizontal radius ratio. */
  squash?: number;
  /** Sharp dorsal ridge height (fraction of radius). */
  ridge?: number;
  /** Flatten the belly (0‥1). */
  belly?: number;
  /** Start before the neck joint so the tube tucks into the skull. */
  start?: number;
  /** Angular jitter for faceted bodies. */
  facet?: number;
  seed?: number;
}

/** Cross-section point on the unit ring, with ridge + belly shaping. */
function ring(theta: number, spec: BodySpec): [number, number] {
  let y = Math.cos(theta);
  let z = Math.sin(theta);
  const ridge = spec.ridge ?? 0;
  if (ridge > 0) {
    const c = Math.max(0, Math.cos(theta));
    const r = 1 + ridge * Math.pow(c, 14);
    y *= r;
    z *= 1 + ridge * 0.15 * Math.pow(c, 4);
  }
  const belly = spec.belly ?? 0;
  if (y < 0) y *= 1 - belly * Math.pow(-y, 2) * 0.5;
  return [y * (spec.squash ?? 1), z];
}

export function body(b: GeoBuilder, spec: BodySpec) {
  const { length, segments, radial } = spec;
  const start = spec.start ?? 0;
  const span = length - start;
  const base = b.vertexCount;
  const eps = 1e-3;
  let seed = spec.seed ?? 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const facet = spec.facet ?? 0;
  const jitter: number[] = [];
  if (facet > 0) for (let i = 0; i < (segments + 1) * (radial + 1); i++) jitter.push((rnd() - 0.5) * facet);

  const point = (s: number, theta: number, j: number, i: number): V3 => {
    const t = Math.min(1, Math.max(0, s / length));
    const r = spec.radius(t) * (1 + (facet > 0 ? jitter[i * (radial + 1) + (j % radial)] : 0));
    const [y, z] = ring(theta, spec);
    return [s, y * r, z * r];
  };

  for (let i = 0; i <= segments; i++) {
    // denser rings near the head where curvature is highest
    const f = i / segments;
    const s = start + span * (f * 0.85 + f * f * 0.15);
    for (let j = 0; j <= radial; j++) {
      const theta = (j / radial) * Math.PI * 2;
      const p = point(s, theta, j, i);
      // analytic-ish normal from finite differences of the surface
      const ps = point(s + eps, theta, j, i);
      const pt = point(s, theta + eps, j, i);
      const dsx = ps[0] - p[0], dsy = ps[1] - p[1], dsz = ps[2] - p[2];
      const dtx = pt[0] - p[0], dty = pt[1] - p[1], dtz = pt[2] - p[2];
      // n = dθ × ds (outward)
      let nx = dty * dsz - dtz * dsy;
      let ny = dtz * dsx - dtx * dsz;
      let nz = dtx * dsy - dty * dsx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      b.vertex(p, [nx, ny, nz], s / length, j / radial, PART.BODY, [0, 0, 0, 0]);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * row + j;
      const c = a + row;
      b.tri(a, a + 1, c);
      b.tri(a + 1, c + 1, c);
    }
  }
}

/* ----------------------------------------------------------------- tubes */

/**
 * Sweeps a (possibly elliptical) ring along a polyline with per-point radii.
 * Used for horns, whiskers, legs, claws, spikes, teeth and wing bones.
 */
export function tube(
  b: GeoBuilder,
  points: V3[],
  radii: number[],
  radial: number,
  part: number,
  pivot: [number, number, number, number],
  opts: { flat?: number; twistUp?: V3; capStart?: boolean; vScale?: number } = {},
) {
  const n = points.length;
  if (n < 2) return;
  const flat = opts.flat ?? 1;
  const base = b.vertexCount;
  // frames via parallel transport
  const T: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const c = points[Math.min(n - 1, i + 1)];
    T.push(norm([c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
  }
  let up: V3 = opts.twistUp ?? [0, 1, 0];
  if (Math.abs(dot(up, T[0])) > 0.95) up = [1, 0, 0];
  let N = norm(sub(up, scale(T[0], dot(up, T[0]))));
  let total = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]);
    lens.push(total);
  }
  for (let i = 0; i < n; i++) {
    if (i > 0) N = norm(sub(N, scale(T[i], dot(N, T[i]))));
    const B = cross(T[i], N);
    const r = radii[i];
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th) * flat;
      const off: V3 = [N[0] * c + B[0] * s, N[1] * c + B[1] * s, N[2] * c + B[2] * s];
      const nn = norm([N[0] * c + B[0] * Math.sin(th) / flat, N[1] * c + B[1] * Math.sin(th) / flat, N[2] * c + B[2] * Math.sin(th) / flat]);
      const p = points[i];
      b.vertex([p[0] + off[0] * r, p[1] + off[1] * r, p[2] + off[2] * r], nn, (lens[i] / (total || 1)) * (opts.vScale ?? 1), j / radial, part, pivot);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * row + j;
      const c = a + row;
      b.tri(a, a + 1, c);
      b.tri(a + 1, c + 1, c);
    }
  }
  if (opts.capStart && radii[0] > 0) {
    const p = points[0];
    const center = b.vertex(p, scale(T[0], -1), 0, 0, part, pivot);
    for (let j = 0; j < radial; j++) b.tri(center, base + j + 1, base + j);
  }
}

/** Points along a quadratic Bézier. */
export function bezier(a: V3, c: V3, d: V3, steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * c[0] + t * t * d[0],
      u * u * a[1] + 2 * u * t * c[1] + t * t * d[1],
      u * u * a[2] + 2 * u * t * c[2] + t * t * d[2],
    ]);
  }
  return out;
}

/** Points along a cubic Bézier. */
export function bezier3(a: V3, c1: V3, c2: V3, d: V3, steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    out.push([
      w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * d[0],
      w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * d[1],
      w0 * a[2] + w1 * c1[2] + w2 * c2[2] + w3 * d[2],
    ]);
  }
  return out;
}

/** Tapered radii from r0 to the tip, optionally ribbed (horn rings). */
export function taper(n: number, r0: number, r1 = 0, power = 1, ribs = 0): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let r = r0 + (r1 - r0) * Math.pow(t, power);
    if (ribs > 0) r *= 1 + 0.12 * Math.max(0, Math.sin(t * Math.PI * ribs)) * (1 - t);
    out.push(Math.max(0, r));
  }
  return out;
}

export function sphere(b: GeoBuilder, c: V3, r: V3, segs: number, part: number, pivot: [number, number, number, number]) {
  const base = b.vertexCount;
  const rings = Math.max(4, Math.round(segs * 0.6));
  for (let i = 0; i <= rings; i++) {
    const v = i / rings;
    const phi = v * Math.PI;
    for (let j = 0; j <= segs; j++) {
      const u = j / segs;
      const th = u * Math.PI * 2;
      const n: V3 = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
      b.vertex([c[0] + n[0] * r[0], c[1] + n[1] * r[1], c[2] + n[2] * r[2]], norm([n[0] / r[0], n[1] / r[1], n[2] / r[2]]), u, v, part, pivot);
    }
  }
  const row = segs + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = base + i * row + j;
      b.tri(a, a + 1, a + row);
      b.tri(a + 1, a + row + 1, a + row);
    }
  }
}

/* ------------------------------------------------------------------ legs */

export interface LegSpec {
  s: number;
  side: 1 | -1;
  index: number;
  bodyRadius: number;
  length: number;
  thickness: number;
  claws?: number;
  /** +1 legs swept back (flight), 0 straight down. */
  sweep?: number;
  radial: number;
}

export function leg(b: GeoBuilder, spec: LegSpec) {
  const { s, side, bodyRadius: R, length: L, thickness: th, radial } = spec;
  const sweep = spec.sweep ?? 0.6;
  const hip: V3 = [s, -R * 0.35, side * R * 0.7];
  const knee: V3 = [s + L * (0.18 + sweep * 0.25), -R * 0.35 - L * 0.42, side * (R * 0.95 + L * 0.14)];
  const ankle: V3 = [s + L * (0.1 + sweep * 0.55), -R * 0.35 - L * 0.78, side * (R * 0.92 + L * 0.1)];
  const pivot: [number, number, number, number] = [hip[0], hip[1], hip[2], spec.index];
  const upper = bezier(hip, [hip[0] + L * 0.02, hip[1] - L * 0.2, hip[2] + side * L * 0.1], knee, 6);
  tube(b, upper, taper(upper.length, th * 1.25, th * 0.75, 1), radial, PART.LEG, pivot);
  const lower = bezier(knee, [knee[0] + L * 0.02, knee[1] - L * 0.2, knee[2]], ankle, 5);
  tube(b, lower, taper(lower.length, th * 0.78, th * 0.5, 1), radial, PART.LEG, pivot);
  // foot + claws spread forward/down
  const claws = spec.claws ?? 3;
  for (let c = 0; c < claws; c++) {
    const spread = (c - (claws - 1) / 2) * 0.42;
    const dir: V3 = norm([-0.75 + sweep * 0.9, -0.55, side * 0.15 + spread]);
    const mid: V3 = [ankle[0] + dir[0] * L * 0.16, ankle[1] + dir[1] * L * 0.16, ankle[2] + dir[2] * L * 0.16];
    const tip: V3 = [mid[0] + dir[0] * L * 0.12, mid[1] + dir[1] * L * 0.12 - L * 0.05, mid[2] + dir[2] * L * 0.12];
    tube(b, [ankle, mid], [th * 0.42, th * 0.3], Math.max(4, radial - 2), PART.LEG, pivot);
    tube(b, bezier(mid, [mid[0] + dir[0] * L * 0.08, mid[1] + L * 0.01, mid[2] + dir[2] * L * 0.08], tip, 4), taper(5, th * 0.28, 0, 1), Math.max(4, radial - 2), PART.CLAW, pivot);
  }
}

/* ---------------------------------------------------------------- spikes */

export interface SpikeRowSpec {
  from: number;
  to: number;
  count: number;
  radius: (t: number) => number;
  length: number;
  height: (t: number) => number;
  /** Rake toward the tail (0 = straight up, 1 = 45°). */
  rake: number;
  /** Width/thickness ratio of the blade. */
  flat: number;
  /** Lateral offset (0 = on the ridge; ±x for paired rows). */
  lateral?: number;
  part?: number;
  radial?: number;
  curve?: number;
  ridge?: number;
}

export function spikeRow(b: GeoBuilder, spec: SpikeRowSpec) {
  const part = spec.part ?? PART.SPIKE;
  const radial = spec.radial ?? 5;
  for (let i = 0; i < spec.count; i++) {
    const f = spec.count === 1 ? 0 : i / (spec.count - 1);
    const s = spec.from + (spec.to - spec.from) * f;
    const t = s / spec.length;
    const r = spec.radius(t);
    const h = spec.height(t);
    if (h <= 0.01) continue;
    const lat = (spec.lateral ?? 0) * r;
    const baseY = Math.sqrt(Math.max(0, r * r - lat * lat)) * (1 + (spec.ridge ?? 0) * 0.8) - h * 0.08;
    const base: V3 = [s, baseY, lat];
    const outward = lat === 0 ? 0 : Math.sign(lat) * 0.35;
    const tip: V3 = [s + h * spec.rake, baseY + h, lat + outward * h];
    const ctrl: V3 = [s + h * spec.rake * (0.2 - (spec.curve ?? 0.25)), baseY + h * 0.65, lat + outward * h * 0.4];
    const pts = bezier(base, ctrl, tip, 5);
    tube(b, pts, taper(pts.length, h * 0.24, 0, 0.9), radial, part, [s, baseY, lat, f], { flat: spec.flat, twistUp: [1, 0, 0] });
  }
}

/* -------------------------------------------------------------- vectors */

export function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

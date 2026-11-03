import type { Vector3 } from 'three';

const span = (a: Vector3, b: Vector3) => Math.sqrt(Math.max(a.distanceTo(b), 1e-4));

/**
 * Samples a centripetal Catmull-Rom spline through `pts` into `out` (xyz
 * triplets) and returns the number of points written. Centripetal knots keep
 * the curve from looping or overshooting where joints are unevenly spaced.
 */
export function catmullRom(pts: Vector3[], perSegment: number, out: Float32Array): number {
  const n = pts.length;
  let w = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p0 = i > 0 ? pts[i - 1] : null;
    const p3 = i < n - 2 ? pts[i + 2] : null;
    const t12 = span(p1, p2);
    const t01 = p0 ? span(p0, p1) : t12;
    const t23 = p3 ? span(p2, p3) : t12;
    const d = (a: number, b: number, c: number, e: number) => {
      // tangents from the neighbouring joints; ends mirror the segment itself
      const ab0 = p0 ? a : 2 * b - c;
      const ab3 = p3 ? e : 2 * c - b;
      const m1 = c - b + t12 * ((b - ab0) / t01 - (c - ab0) / (t01 + t12));
      const m2 = c - b + t12 * ((ab3 - c) / t23 - (ab3 - b) / (t12 + t23));
      return [2 * (b - c) + m1 + m2, -3 * (b - c) - 2 * m1 - m2, m1, b] as const;
    };
    const [ax, bx, cx, dx] = d(p0?.x ?? 0, p1.x, p2.x, p3?.x ?? 0);
    const [ay, by, cy, dy] = d(p0?.y ?? 0, p1.y, p2.y, p3?.y ?? 0);
    const [az, bz, cz, dz] = d(p0?.z ?? 0, p1.z, p2.z, p3?.z ?? 0);
    const steps = i === n - 2 ? perSegment + 1 : perSegment;
    for (let k = 0; k < steps; k++) {
      const t = k / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      if (w + 3 > out.length) return w / 3;
      out[w++] = ax * t3 + bx * t2 + cx * t + dx;
      out[w++] = ay * t3 + by * t2 + cy * t + dy;
      out[w++] = az * t3 + bz * t2 + cz * t + dz;
    }
  }
  return w / 3;
}

/**
 * Signed-distance modelling + Naive Surface Nets meshing.
 * Dragon heads are sculpted as smooth unions of ellipsoids and round cones,
 * then meshed on a grid at load time. Pure math, no allocations in the hot
 * loop, no three.js — safe to run in a worker.
 */

export type SDF = (x: number, y: number, z: number) => number;

export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export function sdSphere(x: number, y: number, z: number, r: number) {
  return Math.sqrt(x * x + y * y + z * z) - r;
}

/** Approximate ellipsoid distance (iq). */
export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const k0 = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry) + (z * z) / (rz * rz));
  const k1 = Math.sqrt((x * x) / (rx * rx * rx * rx) + (y * y) / (ry * ry * ry * ry) + (z * z) / (rz * rz * rz * rz));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

/** Capsule between a and b whose radius blends from ra to rb (iq's round cone). */
export function sdRoundCone(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  ra: number, rb: number,
) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra;
}

export interface Mesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Naive Surface Nets. One vertex per sign-changing cell (the mean of its
 * edge crossings), one quad per sign-changing grid edge. Normals come from
 * the SDF gradient, so shading is smooth regardless of grid resolution.
 */
export function surfaceNets(sdf: SDF, bounds: Bounds, cell: number, flatNormals = false): Mesh {
  const [x0, y0, z0] = bounds.min;
  const nx = Math.max(2, Math.ceil((bounds.max[0] - x0) / cell) + 1);
  const ny = Math.max(2, Math.ceil((bounds.max[1] - y0) / cell) + 1);
  const nz = Math.max(2, Math.ceil((bounds.max[2] - z0) / cell) + 1);
  const field = new Float32Array(nx * ny * nz);
  let o = 0;
  for (let k = 0; k < nz; k++) {
    const z = z0 + k * cell;
    for (let j = 0; j < ny; j++) {
      const y = y0 + j * cell;
      for (let i = 0; i < nx; i++) field[o++] = sdf(x0 + i * cell, y, z);
    }
  }

  const cellIndex = new Int32Array(nx * ny * nz).fill(-1);
  const verts: number[] = [];
  const quads: number[] = [];
  const sx = 1;
  const sy = nx;
  const sz = nx * ny;
  // corner offsets (bit 0 = x, bit 1 = y, bit 2 = z)
  const corner = [0, sx, sy, sx + sy, sz, sx + sz, sy + sz, sx + sy + sz];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float64Array(8);

  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + j * sy + k * sz;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = field[base + corner[c]];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let ax = 0, ay = 0, az = 0, cnt = 0;
        for (const [a, b] of edges) {
          const va = v[a];
          const vb = v[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          ax += (a & 1) + ((b & 1) - (a & 1)) * t;
          ay += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          az += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          cnt++;
        }
        cellIndex[base] = verts.length / 3;
        verts.push(x0 + (i + ax / cnt) * cell, y0 + (j + ay / cnt) * cell, z0 + (k + az / cnt) * cell);

        // Quads for the three edges leaving corner 0 of this cell.
        const pos = [i, j, k];
        const strides = [sx, sy, sz];
        for (let axis = 0; axis < 3; axis++) {
          const other = mask >> (1 << axis) & 1;
          if ((mask & 1) === other) continue;
          const b = (axis + 1) % 3;
          const c = (axis + 2) % 3;
          if (pos[b] === 0 || pos[c] === 0) continue;
          const v0 = cellIndex[base];
          const v1 = cellIndex[base - strides[b]];
          const v2 = cellIndex[base - strides[b] - strides[c]];
          const v3 = cellIndex[base - strides[c]];
          if (v1 < 0 || v2 < 0 || v3 < 0) continue;
          // wound so the outside of the surface is the front face
          if (mask & 1) quads.push(v0, v1, v2, v3);
          else quads.push(v0, v3, v2, v1);
        }
      }
    }
  }

  const positions = new Float32Array(verts);
  const indices = new Uint32Array((quads.length / 4) * 6);
  for (let q = 0, t = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    // split along the shorter diagonal
    const ac = dist2(positions, a, c);
    const bd = dist2(positions, b, d);
    if (ac < bd) {
      indices[t++] = a; indices[t++] = b; indices[t++] = c;
      indices[t++] = a; indices[t++] = c; indices[t++] = d;
    } else {
      indices[t++] = a; indices[t++] = b; indices[t++] = d;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }

  const normals = new Float32Array(positions.length);
  if (!flatNormals) {
    const h = cell * 0.5;
    for (let p = 0; p < positions.length; p += 3) {
      const x = positions[p], y = positions[p + 1], z = positions[p + 2];
      let gx = sdf(x + h, y, z) - sdf(x - h, y, z);
      let gy = sdf(x, y + h, z) - sdf(x, y - h, z);
      let gz = sdf(x, y, z + h) - sdf(x, y, z - h);
      const l = Math.hypot(gx, gy, gz) || 1;
      gx /= l; gy /= l; gz /= l;
      normals[p] = gx; normals[p + 1] = gy; normals[p + 2] = gz;
    }
  }
  return { positions, normals, indices };
}

function dist2(p: Float32Array, a: number, b: number) {
  const dx = p[a * 3] - p[b * 3];
  const dy = p[a * 3 + 1] - p[b * 3 + 1];
  const dz = p[a * 3 + 2] - p[b * 3 + 2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Bat-wing generator. The membrane is a fan around the wrist joint whose
 * outline runs tip → finger → finger → … → body, with scalloped trailing
 * edges between fingers. Bones are tapered tubes. Wing space: x = chord
 * (toward the tail), y = up, z = span (outward).
 */
import { GeoBuilder, PART, tube, taper, type PackedGeometry, type V3 } from './anatomy';

export interface WingSpec {
  span: number;
  chord: number;
  fingers: number;
  scallop: number;
  camber: number;
  boneRadius: number;
  resA: number;
  resR: number;
  /** Extra finger length variation. */
  sweep?: number;
}

export function buildWing(spec: WingSpec): PackedGeometry {
  const { span, chord, fingers } = spec;
  const b = new GeoBuilder();
  const wrist: V3 = [chord * 0.12, span * 0.05, span * 0.42];
  const tip: V3 = [chord * (0.3 + (spec.sweep ?? 0)), span * 0.1, span];
  // finger tips on the trailing edge, fanning from near the tip back to the body
  const keys: V3[] = [tip];
  for (let k = 1; k <= fingers; k++) {
    const f = k / (fingers + 0.6);
    const z = span * (0.95 - f * 0.78);
    const x = chord * (0.55 + f * 0.85) + (spec.sweep ?? 0) * chord * (1 - f);
    keys.push([x, -span * 0.02 * k, z]);
  }
  const bodyAttach: V3 = [chord * 1.1, 0, span * 0.06];
  keys.push(bodyAttach);
  keys.push([0, 0, 0]);

  // outline samples
  const outline: V3[] = [];
  const isFinger: number[] = [];
  const perSeg = Math.max(3, Math.round(spec.resA / (keys.length - 1)));
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const c = keys[i + 1];
    const scallop = i < keys.length - 2 ? spec.scallop : 0;
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg;
      const p: V3 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
      const pull = scallop * Math.sin(Math.PI * t) * 0.32;
      p[0] += (wrist[0] - p[0]) * pull;
      p[2] += (wrist[2] - p[2]) * pull;
      outline.push(p);
      isFinger.push(j === 0 && i > 0 && i <= fingers ? 1 : 0);
    }
  }
  outline.push(keys[keys.length - 1]);
  isFinger.push(0);

  const nA = outline.length;
  const nR = spec.resR;
  const base = b.vertexCount;
  for (let a = 0; a < nA; a++) {
    const o = outline[a];
    const dx = o[0] - wrist[0];
    const dy = o[1] - wrist[1];
    const dz = o[2] - wrist[2];
    const len = Math.hypot(dx, dy, dz);
    for (let r = 0; r <= nR; r++) {
      const t = r / nR;
      const camber = Math.sin(Math.PI * t) * spec.camber * len;
      b.vertex([wrist[0] + dx * t, wrist[1] + dy * t + camber, wrist[2] + dz * t], [0, 1, 0], a / (nA - 1), t, 0, [0, 0, 0, 0], isFinger[a]);
    }
  }
  for (let a = 0; a < nA - 1; a++) {
    for (let r = 0; r < nR; r++) {
      const i0 = base + a * (nR + 1) + r;
      const i1 = i0 + nR + 1;
      b.tri(i0, i0 + 1, i1);
      b.tri(i0 + 1, i1 + 1, i1);
    }
  }
  const packed = b.pack();
  computeNormals(packed);
  // bones (aExtra = 1 marks bone vertices for the shader)
  const bones = new GeoBuilder();
  const radial = 6;
  tube(bones, [[0, 0, 0], [wrist[0] * 0.5, wrist[1] + spec.boneRadius, wrist[2] * 0.5], wrist], [spec.boneRadius * 1.5, spec.boneRadius * 1.2, spec.boneRadius], radial, PART.BODY, [0, 0, 0, 0]);
  for (let k = 0; k <= fingers; k++) {
    const end = keys[k];
    const pts: V3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push([wrist[0] + (end[0] - wrist[0]) * t, wrist[1] + (end[1] - wrist[1]) * t + Math.sin(Math.PI * t) * spec.camber * 0.9, wrist[2] + (end[2] - wrist[2]) * t]);
    }
    tube(bones, pts, taper(pts.length, spec.boneRadius * (k === 0 ? 1 : 0.75), spec.boneRadius * 0.1, 1), radial, PART.BODY, [0, 0, 0, 0]);
  }
  // wrist claw
  tube(bones, [wrist, [wrist[0] - chord * 0.12, wrist[1] + span * 0.06, wrist[2] + span * 0.02]], [spec.boneRadius * 0.8, 0], 5, PART.CLAW, [0, 0, 0, 0]);
  const bp = bones.pack();
  bp.attributes.aExtra.array.fill(2);
  return merge(packed, bp);
}

function computeNormals(p: PackedGeometry) {
  const pos = p.attributes.position.array;
  const nor = p.attributes.normal.array;
  const idx = p.index!;
  nor.fill(0);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) {
      nor[k] += nx;
      nor[k + 1] += ny;
      nor[k + 2] += nz;
    }
  }
  for (let i = 0; i < nor.length; i += 3) {
    const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1;
    nor[i] /= l;
    nor[i + 1] /= l;
    nor[i + 2] /= l;
    // keep membranes facing up
    if (nor[i + 1] < 0) {
      nor[i] *= -1;
      nor[i + 1] *= -1;
      nor[i + 2] *= -1;
    }
  }
}

/** Concatenate two packed meshes with identical attribute layouts. */
export function merge(a: PackedGeometry, b: PackedGeometry): PackedGeometry {
  const out: PackedGeometry = { attributes: {} };
  const countA = a.attributes.position.array.length / 3;
  for (const key of Object.keys(a.attributes)) {
    const x = a.attributes[key];
    const y = b.attributes[key];
    const arr = new Float32Array(x.array.length + y.array.length);
    arr.set(x.array);
    arr.set(y.array, x.array.length);
    out.attributes[key] = { array: arr, itemSize: x.itemSize };
  }
  const ia = a.index ?? new Uint32Array();
  const ib = b.index ?? new Uint32Array();
  const idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + countA;
  out.index = idx;
  return out;
}

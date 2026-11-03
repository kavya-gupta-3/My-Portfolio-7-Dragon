/**
 * Geometry blueprints — one per dragon. Each returns packed typed arrays
 * (transferable from the worker). Shapes are deterministic: every visitor
 * meets exactly the same seven dragons.
 */
import { GeoBuilder, PART, bezier, bezier3, body, leg, spikeRow, taper, tube, type GeometryPack, type PackedGeometry, type V3 } from './anatomy';
import { addHead, addHorns, headInfo, headSDF, jawSDF, type HeadSpec } from './heads';
import { buildWing } from './wings';

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface BlueprintResult {
  pack: GeometryPack;
  length: number;
}

/* ================================================================= IGNIS */

export const IGNIS = {
  length: 26,
  radius: 0.62,
  profile(t: number) {
    const neck = 0.6 + 0.4 * sstep(0.0, 0.11, t);
    const tail = 1 - 0.95 * sstep(0.38, 1.0, t);
    const chest = 1 + 0.1 * Math.exp(-Math.pow((t - 0.14) / 0.06, 2));
    return IGNIS.radius * neck * tail * chest;
  },
};

export function buildIgnis(detail: number): BlueprintResult {
  const L = IGNIS.length;
  const main = new GeoBuilder();
  const eyes = new GeoBuilder();
  body(main, {
    length: L,
    radius: IGNIS.profile,
    segments: Math.round(300 * detail),
    radial: Math.round(28 * detail),
    squash: 0.94,
    ridge: 0.2,
    belly: 0.45,
    start: -0.35,
  });
  const head: HeadSpec = {
    len: 2.35,
    w: 0.5,
    h: 0.46,
    snout: 0.2,
    brow: 1.15,
    cheek: 1.1,
    jaw: 0.16,
    neck: IGNIS.radius * 0.62,
    eye: 0.085,
    crest: 0.5,
    hook: 0.35,
  };
  addHead(main, eyes, head, 0.05 / Math.max(0.6, detail), { teeth: 7, fangs: true });
  // antler horns: main beam + a forward tine
  addHorns(main, head, {
    base: [-0.24, 0.72, 0.42],
    c1: [0.15, 1.6, 0.9],
    c2: [0.55, 2.4, 1.3],
    tip: [1.05, 2.7, 1.2],
    radius: 0.085,
    ribs: 9,
  });
  addHorns(main, head, {
    base: [0.08, 1.75, 0.95],
    c1: [-0.05, 2.2, 1.15],
    c2: [-0.12, 2.6, 1.5],
    tip: [-0.05, 3.0, 1.75],
    radius: 0.04,
  });
  // whiskers: long flowing strands from the snout
  for (const side of [1, -1]) {
    const base: V3 = [-2.05, -0.02, 0.15 * side];
    const pts = bezier3(base, [-2.2, -0.15, 0.55 * side], [-1.2, -0.45, 1.05 * side], [0.6, -0.2, 1.6 * side], 18);
    tube(main, pts, taper(pts.length, 0.028, 0.004, 1), 5, PART.WHISKER, [base[0], base[1], base[2], side]);
  }
  // beard tufts under the jaw
  for (let i = 0; i < 5; i++) {
    const x = -1.55 + i * 0.22;
    const pts = bezier([x, -0.32, 0], [x + 0.05, -0.55, 0.05 * (i - 2)], [x + 0.25, -0.75, 0.1 * (i - 2)], 4);
    tube(main, pts, taper(pts.length, 0.045, 0, 1), 4, PART.WHISKER, [x, -0.32, 0, i]);
  }
  // fire mane along the neck
  spikeRow(main, {
    from: 0.25,
    to: 3.6,
    count: 22,
    length: L,
    radius: IGNIS.profile,
    height: (t) => 0.75 - t * 3.5,
    rake: 1.15,
    flat: 0.22,
    part: PART.MANE,
    radial: 4,
    ridge: 0.2,
  });
  for (const lat of [0.55, -0.55]) {
    spikeRow(main, {
      from: 0.4,
      to: 3.0,
      count: 12,
      length: L,
      radius: IGNIS.profile,
      height: (t) => 0.5 - t * 3,
      rake: 1.3,
      flat: 0.25,
      lateral: lat,
      part: PART.MANE,
      radial: 4,
    });
  }
  // dorsal blades down the back
  spikeRow(main, {
    from: 3.9,
    to: L * 0.93,
    count: Math.round(64 * detail),
    length: L,
    radius: IGNIS.profile,
    height: (t) => 0.42 * (1 - sstep(0.35, 1.0, t) * 0.85) * (0.75 + 0.25 * Math.sin(t * 160) ** 2),
    rake: 0.75,
    flat: 0.3,
    ridge: 0.2,
  });
  // tail flame tuft
  spikeRow(main, {
    from: L * 0.93,
    to: L * 0.995,
    count: 9,
    length: L,
    radius: () => 0.06,
    height: (t) => 0.5 + (t - 0.93) * 9,
    rake: 1.6,
    flat: 0.25,
    part: PART.MANE,
    radial: 4,
  });
  const legR = Math.max(5, Math.round(7 * detail));
  for (const [s, index] of [[2.9, 0], [10.6, 2]] as const) {
    for (const side of [1, -1] as const) {
      leg(main, {
        s,
        side,
        index: index + (side === 1 ? 0 : 1),
        bodyRadius: IGNIS.profile(s / L),
        length: 1.25,
        thickness: 0.13,
        claws: 4,
        sweep: 0.9,
        radial: legR,
      });
    }
  }
  return { pack: { main: main.pack(), eyes: eyes.pack() }, length: L };
}

/* ============================================================ helpers */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The three faces of a cube that meet at one corner, with normals and uvs. A
 * cube never shows more than three faces, so that is all a voxel draws: the
 * vertex shader turns them to whichever corner faces the camera.
 */
function cube(): PackedGeometry {
  const p: number[] = [];
  const n: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const faces: [V3, V3, V3][] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  ];
  for (const [nn, u, v] of faces) {
    const base = p.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      p.push((nn[0] + u[0] * a + v[0] * b) * 0.5, (nn[1] + u[1] * a + v[1] * b) * 0.5, (nn[2] + u[2] * a + v[2] * b) * 0.5);
      n.push(nn[0], nn[1], nn[2]);
      uv.push((a + 1) / 2, (b + 1) / 2);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return {
    attributes: {
      position: { array: new Float32Array(p), itemSize: 3 },
      normal: { array: new Float32Array(n), itemSize: 3 },
      uv: { array: new Float32Array(uv), itemSize: 2 },
    },
    index: new Uint32Array(idx),
  };
}

/** A pointed hexagonal crystal from `base` along `dir`. */
function crystal(b: GeoBuilder, base: V3, dir: V3, len: number, r: number, part: number, pivot: [number, number, number, number]) {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d: V3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  const at = (t: number): V3 => [base[0] + d[0] * len * t, base[1] + d[1] * len * t, base[2] + d[2] * len * t];
  tube(b, [at(-0.05), at(0.72), at(1)], [r, r * 1.04, 0], 6, part, pivot, { twistUp: [1, 0, 0] });
}

/** Hexagonal armour ring centred on the spine at arclength s (for VOLT). */
function hexRing(b: GeoBuilder, s: number, ro: number, ri: number, w: number, fin: number, k: number) {
  const pivot: [number, number, number, number] = [s, 0, 0, k];
  const pts = (r: number, x: number) => {
    const out: V3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      out.push([x, Math.cos(a) * r * 1.05, Math.sin(a) * r]);
    }
    return out;
  };
  const x0 = s - w / 2;
  const x1 = s + w / 2;
  const of = pts(ro, x0), ob = pts(ro * 0.9, x1), inf = pts(ri, x0), inb = pts(ri, x1);
  const quad = (a: V3, c: V3, d: V3, e: V3, u0: number) => {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = e[0] - a[0], vy = e[1] - a[1], vz = e[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const nn: V3 = [nx, ny, nz];
    const i0 = b.vertex(a, nn, u0, 0, PART.SEGMENT_ID, pivot);
    const i1 = b.vertex(c, nn, u0 + 1, 0, PART.SEGMENT_ID, pivot);
    const i2 = b.vertex(d, nn, u0 + 1, 1, PART.SEGMENT_ID, pivot);
    const i3 = b.vertex(e, nn, u0, 1, PART.SEGMENT_ID, pivot);
    b.tri(i0, i1, i2);
    b.tri(i0, i2, i3);
  };
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    quad(of[i], of[j], ob[j], ob[i], 0);
    quad(inb[i], inb[j], inf[j], inf[i], 2);
    quad(of[j], of[i], inf[i], inf[j], 4);
    quad(ob[i], ob[j], inb[j], inb[i], 6);
  }
  if (fin > 0) {
    const top = ro * 1.05;
    const f0: V3 = [x0, top * 0.98, 0.05];
    const f1: V3 = [x1, top * 0.9, 0.05];
    const f2: V3 = [x1 + fin * 0.6, top + fin, 0.0];
    const g0: V3 = [x0, top * 0.98, -0.05];
    const g1: V3 = [x1, top * 0.9, -0.05];
    quad(f0, f1, f2, f2, 8);
    quad(g1, g0, f2, f2, 8);
    quad(g0, f0, f2, f2, 8);
  }
}

/* ================================================================= PIXEL */

export const PIXEL = {
  length: 17,
  radius: 0.78,
  shoulder: 4.6,
  profile(t: number) {
    const neck = 0.62 + 0.38 * sstep(0.0, 0.14, t);
    const tail = 1 - 0.92 * sstep(0.35, 1.0, t);
    return PIXEL.radius * neck * tail;
  },
};

export function buildPixel(detail: number): BlueprintResult {
  const L = PIXEL.length;
  const v = 0.2 / Math.sqrt(Math.max(0.6, detail));
  const r = rng(11);
  const centers: number[] = [];
  const data: number[] = [];
  const push = (x: number, y: number, z: number, size: number, part: number, ring: number) => {
    centers.push(x, y, z, size);
    data.push(part, r(), ring, x / L);
  };
  let ring = 0;
  for (let s = 0; s <= L; s += v * 0.92, ring++) {
    const rad = PIXEL.profile(s / L);
    if (rad < v * 0.6) {
      push(s, 0, 0, v * 0.9, PART.BODY, ring);
      continue;
    }
    const n = Math.max(5, Math.round((2 * Math.PI * rad) / (v * 0.95)));
    const off = (ring % 2) * 0.5;
    for (let k = 0; k < n; k++) {
      const th = ((k + off) / n) * Math.PI * 2;
      push(s, Math.cos(th) * rad * 0.97, Math.sin(th) * rad, v * 0.94, PART.BODY, ring);
    }
    // dorsal pixel spikes
    if (ring % 3 === 0 && s > 1 && s < L * 0.9) {
      const h = Math.max(1, Math.round((1 - s / L) * 5));
      for (let j = 1; j <= h; j++) push(s + j * v * 0.3, rad + j * v * 0.95, 0, v * 0.85, PART.SPIKE, ring);
    }
  }
  // head voxelised from a chunky skull SDF
  const head: HeadSpec = { len: 2.3, w: 0.62, h: 0.58, snout: 0.26, brow: 1.2, cheek: 1.0, jaw: 0.22, neck: PIXEL.radius * 0.62, eye: 0.11, crest: 0.4 };
  const sdf = headSDF(head);
  const vh = v * 0.72;
  for (let x = -head.len - 0.1; x <= 0.4; x += vh) {
    for (let y = -head.h * 1.1; y <= head.h * 1.6; y += vh) {
      for (let z = -head.w * 1.4; z <= head.w * 1.4; z += vh) {
        const d = sdf(x, y, z);
        if (d < 0 && d > -vh * 1.25) push(x, y, z, vh * 0.95, PART.HEAD, -1);
      }
    }
  }
  // jaw (hinged)
  const jaw = jawSDF(head);
  for (let x = -head.len; x <= 0.2; x += vh) {
    for (let y = -head.h * 1.3 - head.jaw; y <= head.h * 0.1; y += vh) {
      for (let z = -head.w; z <= head.w; z += vh) {
        const d = jaw(x, y, z);
        if (d < 0 && d > -vh * 1.25) push(x, y, z, vh * 0.95, PART.JAW, -2);
      }
    }
  }
  // eyes
  for (const e of headInfo(head).eyes) push(e[0] - 0.02, e[1], e[2] * 1.02, vh * 1.5, PART.EYE, -3);
  // horns: stepped diagonal pixels
  for (const side of [1, -1]) {
    for (let i = 0; i < 9; i++) push(-0.4 + i * vh * 0.8, head.h * 0.75 + i * vh * 0.65, side * (head.w * 0.45 + i * vh * 0.3), vh * (1 - i * 0.06), PART.HORN, -4);
  }
  // little legs
  for (const [s, idx] of [[3.0, 0], [8.6, 2]] as const) {
    for (const side of [1, -1]) {
      const rad = PIXEL.profile(s / L);
      for (let i = 0; i < 7; i++) push(s + i * v * 0.25, -rad - i * v * 0.9, side * rad * 0.7, v * 1.1, PART.LEG, idx + (side === 1 ? 0 : 1));
    }
  }
  // wings: a stepped triangle of cubes that narrows toward the tip
  const wv = v * 1.3;
  for (const side of [1, -1]) {
    for (let k = 1; k <= 15; k++) {
      const span = k * wv;
      const chord = Math.ceil((1 - k / 16) * 8) + (k % 4 === 0 ? 1 : 0);
      for (let j = 0; j < chord; j++) {
        push(PIXEL.shoulder - 0.6 + j * wv, 0.5, side * (PIXEL.radius * 0.6 + span), wv * 0.92, PART.WING, 0);
      }
    }
  }
  const geo = cube();
  geo.instances = {
    count: centers.length / 4,
    attributes: {
      aVoxel: { array: new Float32Array(centers), itemSize: 4 },
      aVoxData: { array: new Float32Array(data), itemSize: 4 },
    },
  };
  return { pack: { voxels: geo }, length: L };
}

/* ================================================================== VOLT */

export const VOLT = {
  length: 20,
  radius: 0.62,
  profile(t: number) {
    const neck = 0.65 + 0.35 * sstep(0.0, 0.1, t);
    const tail = 1 - 0.85 * sstep(0.3, 1.0, t);
    return VOLT.radius * neck * tail;
  },
};

export function buildVolt(detail: number): BlueprintResult {
  const L = VOLT.length;
  const main = new GeoBuilder();
  const eyes = new GeoBuilder();
  body(main, { length: L, radius: (t) => VOLT.profile(t) * 0.34, segments: Math.round(140 * detail), radial: 10, start: -0.3 });
  const count = Math.round(46 * Math.max(0.7, detail));
  for (let k = 0; k < count; k++) {
    const s = 0.55 + (k / (count - 1)) * (L * 0.94 - 0.55);
    const ro = VOLT.profile(s / L) * 1.02;
    hexRing(main, s, ro, ro * 0.62, (L / count) * 0.56, k % 2 === 0 ? ro * 0.55 : ro * 0.25, k);
  }
  const head: HeadSpec = { len: 2.0, w: 0.46, h: 0.42, snout: 0.16, brow: 1.4, cheek: 0.7, jaw: 0.15, neck: VOLT.radius * 0.5, eye: 0.08, crest: 1.0, blend: 0.05 };
  addHead(main, eyes, head, 0.085, { teeth: 6, fangs: true, flat: true });
  // antenna horns
  addHorns(main, head, { base: [-0.3, 0.8, 0.4], c1: [0, 1.4, 0.55], c2: [0.32, 1.8, 0.7], tip: [0.85, 1.95, 0.72], radius: 0.06, radial: 4 });
  addHorns(main, head, { base: [-0.1, 0.4, 0.8], c1: [0.12, 0.55, 1.15], c2: [0.3, 0.68, 1.35], tip: [0.62, 0.8, 1.42], radius: 0.036, radial: 4 });
  // tail blades
  for (const lat of [0.5, -0.5, 0]) {
    spikeRow(main, { from: L * 0.95, to: L * 0.99, count: 2, length: L, radius: () => 0.15, height: () => 0.7, rake: 1.4, flat: 0.15, lateral: lat, radial: 4 });
  }
  for (const [s, index] of [[2.4, 0], [9.5, 2]] as const) {
    for (const side of [1, -1] as const) {
      leg(main, { s, side, index: index + (side === 1 ? 0 : 1), bodyRadius: VOLT.profile(s / L), length: 1.0, thickness: 0.09, claws: 3, sweep: 0.9, radial: 5 });
    }
  }
  return { pack: { main: main.pack(), eyes: eyes.pack() }, length: L };
}

/* ================================================================== JADE */

export const JADE = {
  length: 15,
  radius: 0.86,
  profile(t: number) {
    const neck = 0.58 + 0.42 * sstep(0.0, 0.16, t);
    const tail = 1 - 0.9 * sstep(0.32, 1.0, t);
    const chest = 1 + 0.12 * Math.exp(-Math.pow((t - 0.2) / 0.08, 2));
    return JADE.radius * neck * tail * chest;
  },
};

export function buildJade(detail: number): BlueprintResult {
  const L = JADE.length;
  const main = new GeoBuilder();
  const eyes = new GeoBuilder();
  const r = rng(3);
  body(main, { length: L, radius: JADE.profile, segments: Math.round(64 * detail), radial: 7, squash: 0.95, ridge: 0.25, belly: 0.4, start: -0.3, facet: 0.16, seed: 5 });
  const head: HeadSpec = { len: 2.1, w: 0.56, h: 0.5, snout: 0.22, brow: 1.2, cheek: 1.1, jaw: 0.19, neck: JADE.radius * 0.55, eye: 0.09, crest: 0.8, blend: 0.08 };
  addHead(main, eyes, head, 0.13, { teeth: 5, flat: true });
  // crystal crown
  for (const side of [1, -1]) {
    crystal(main, [-0.25, head.h * 0.7, side * head.w * 0.35], [0.9, 0.9, side * 0.35], 1.3, 0.09, PART.HORN, [0, 0, 0, side]);
    crystal(main, [-0.05, head.h * 0.55, side * head.w * 0.6], [1, 0.45, side * 0.7], 0.85, 0.07, PART.HORN, [0, 0, 0, side]);
    crystal(main, [-0.6, head.h * 0.85, side * head.w * 0.2], [0.6, 1, side * 0.15], 0.6, 0.06, PART.HORN, [0, 0, 0, side]);
  }
  // crystal clusters along the spine — biggest over the shoulders
  const clusters = Math.round(15 * Math.max(0.7, detail));
  for (let c = 0; c < clusters; c++) {
    const s = 0.9 + (c / (clusters - 1)) * (L * 0.88 - 0.9);
    const t = s / L;
    const rad = JADE.profile(t);
    const size = (1.5 - t * 1.1) * (0.8 + r() * 0.4);
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const lat = (r() - 0.5) * rad * 0.9;
      const base: V3 = [s + (r() - 0.5) * 0.3, rad * 0.8, lat];
      const dir: V3 = [0.25 + r() * 0.6, 1, lat * 1.4 + (r() - 0.5) * 0.6];
      crystal(main, base, dir, size * (0.6 + r() * 0.6), size * 0.11, PART.SPIKE, [s, rad, lat, r()]);
    }
  }
  // tail geode
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    crystal(main, [L * 0.985, 0, 0], [1, Math.cos(a) * 0.6, Math.sin(a) * 0.6], 0.9, 0.08, PART.SPIKE, [L, 0, 0, i / 5]);
  }
  for (const [s, index] of [[2.6, 0], [7.4, 2]] as const) {
    for (const side of [1, -1] as const) {
      leg(main, { s, side, index: index + (side === 1 ? 0 : 1), bodyRadius: JADE.profile(s / L), length: 1.35, thickness: 0.15, claws: 3, sweep: 0.55, radial: 5 });
    }
  }
  return { pack: { main: main.pack(), eyes: eyes.pack() }, length: L };
}

/* ================================================================= AURUM */

export const AURUM = {
  length: 12.5,
  radius: 0.9,
  profile(t: number) {
    const neck = 0.46 + 0.54 * sstep(0.02, 0.24, t);
    const tail = 1 - 0.94 * sstep(0.42, 1.0, t);
    const chest = 1 + 0.42 * Math.exp(-Math.pow((t - 0.27) / 0.09, 2));
    const hip = 1 + 0.2 * Math.exp(-Math.pow((t - 0.5) / 0.08, 2));
    const waist = 1 - 0.12 * Math.exp(-Math.pow((t - 0.39) / 0.05, 2));
    return AURUM.radius * neck * tail * chest * hip * waist;
  },
  shoulder: 2.9,
};

export function buildAurum(detail: number): BlueprintResult {
  const L = AURUM.length;
  const main = new GeoBuilder();
  const eyes = new GeoBuilder();
  body(main, { length: L, radius: AURUM.profile, segments: Math.round(200 * detail), radial: Math.round(26 * detail), squash: 1.0, ridge: 0.28, belly: 0.5, start: -0.3 });
  const head: HeadSpec = { len: 1.95, w: 0.5, h: 0.48, snout: 0.19, brow: 1.35, cheek: 1.2, jaw: 0.17, neck: AURUM.radius * 0.48, eye: 0.085, crest: 1.0, hook: 0.5 };
  addHead(main, eyes, head, 0.05 / Math.max(0.6, detail), { teeth: 6, fangs: true });
  // crown of horns
  addHorns(main, head, { base: [-0.22, 0.75, 0.42], c1: [0.02, 1.5, 0.82], c2: [0.32, 2.05, 1.02], tip: [0.72, 2.5, 0.92], radius: 0.1, ribs: 7 });
  addHorns(main, head, { base: [-0.05, 0.3, 0.88], c1: [0.14, 0.42, 1.32], c2: [0.32, 0.65, 1.6], tip: [0.55, 0.98, 1.72], radius: 0.06, ribs: 4 });
  addHorns(main, head, { base: [-0.3, -0.25, 0.75], c1: [0.0, -0.45, 1.1], c2: [0.3, -0.5, 1.35], tip: [0.6, -0.35, 1.5], radius: 0.045 });
  addHorns(main, head, { base: [-0.62, 0.62, 0.15], c1: [-0.5, 1.1, 0.25], c2: [-0.3, 1.4, 0.3], tip: [0.0, 1.7, 0.3], radius: 0.05 });
  spikeRow(main, { from: 0.6, to: L * 0.94, count: Math.round(34 * detail), length: L, radius: AURUM.profile, height: (t) => 0.55 * (1 - sstep(0.3, 1.0, t) * 0.8), rake: 0.7, flat: 0.3, ridge: 0.28 });
  // spade tail
  for (const side of [1, -1]) {
    const pts = bezier([L * 0.965, 0, 0], [L * 0.99, 0.1, side * 0.45], [L * 1.05, 0, side * 0.1], 6);
    tube(main, pts, taper(pts.length, 0.12, 0, 0.8), 5, PART.SPIKE, [L, 0, 0, 0], { flat: 0.25, twistUp: [0, 1, 0] });
  }
  for (const [s, index, len] of [[2.4, 0, 1.25], [6.2, 2, 1.6]] as const) {
    for (const side of [1, -1] as const) {
      leg(main, { s, side, index: index + (side === 1 ? 0 : 1), bodyRadius: AURUM.profile(s / L), length: len, thickness: 0.19, claws: 4, sweep: 0.25, radial: 7 });
    }
  }
  const wing = buildWing({ span: 7.6, chord: 3.1, fingers: 4, scallop: 1.0, camber: 0.07, boneRadius: 0.075, resA: 72, resR: 12, sweep: 0.2 });
  return { pack: { main: main.pack(), eyes: eyes.pack(), wing }, length: L };
}

/* ================================================================= ASTRA */

export const ASTRA = {
  length: 16,
  radius: 0.72,
  profile(t: number) {
    const neck = 0.6 + 0.4 * sstep(0.0, 0.12, t);
    const tail = 1 - 0.95 * sstep(0.35, 1.0, t);
    return ASTRA.radius * neck * tail;
  },
  shoulder: 3.2,
};

export function buildAstra(detail: number): BlueprintResult {
  const L = ASTRA.length;
  const r = rng(21);
  // the animal itself: a solid body, so it reads as a dragon from any angle
  const main = new GeoBuilder();
  const eyes = new GeoBuilder();
  body(main, { length: L, radius: ASTRA.profile, segments: Math.round(190 * detail), radial: Math.round(24 * detail), squash: 0.96, ridge: 0.22, belly: 0.42, start: -0.3 });
  const head: HeadSpec = { len: 2.1, w: 0.48, h: 0.46, snout: 0.19, brow: 1.1, cheek: 0.9, jaw: 0.16, neck: ASTRA.radius * 0.6, eye: 0.08, crest: 0.6, hook: 0.2 };
  addHead(main, eyes, head, 0.05 / Math.max(0.6, detail), { teeth: 7, fangs: true });
  addHorns(main, head, { base: [-0.25, 0.75, 0.4], c1: [0.2, 1.4, 0.75], c2: [0.8, 1.9, 0.95], tip: [1.6, 2.2, 0.85], radius: 0.075, ribs: 7 });
  addHorns(main, head, { base: [-0.1, 0.35, 0.85], c1: [0.2, 0.45, 1.2], c2: [0.5, 0.6, 1.45], tip: [0.95, 0.85, 1.55], radius: 0.04 });
  spikeRow(main, { from: 0.5, to: L * 0.93, count: Math.round(44 * detail), length: L, radius: ASTRA.profile, height: (t) => 0.42 * (1 - sstep(0.35, 1.0, t) * 0.8), rake: 0.85, flat: 0.28, ridge: 0.22 });
  for (const [s, index] of [[2.9, 0], [7.4, 2]] as const) {
    for (const side of [1, -1] as const) {
      leg(main, { s, side, index: index + (side === 1 ? 0 : 1), bodyRadius: ASTRA.profile(s / L), length: 1.15, thickness: 0.11, claws: 3, sweep: 0.9, radial: 6 });
    }
  }
  // stars set just above the hide: sparkle on top of the solid animal
  const pos: number[] = [];
  const part: number[] = [];
  const rand: number[] = [];
  const add = (x: number, y: number, z: number, p: number, bright = r()) => {
    pos.push(x, y, z);
    part.push(p);
    rand.push(r(), r(), bright, r());
  };
  const N = Math.round(5200 * detail);
  for (let i = 0; i < N; i++) {
    // sample arclength proportional to circumference
    let s = 0;
    for (let tries = 0; tries < 6; tries++) {
      s = r() * L;
      if (r() < ASTRA.profile(s / L) / ASTRA.radius) break;
    }
    const rad = ASTRA.profile(s / L);
    const th = r() * Math.PI * 2;
    const rr = rad * (1.03 + r() * 0.1);
    add(s, Math.cos(th) * rr, Math.sin(th) * rr, PART.BODY, Math.pow(r(), 6));
  }
  // dorsal "major stars"
  for (let i = 0; i < 60; i++) {
    const s = 0.3 + (i / 59) * L * 0.95;
    add(s, ASTRA.profile(s / L) * 1.12, 0, PART.BODY, 1);
  }
  const hinge = headInfo(head).hinge;
  // starlight tracing the horns
  for (const side of [1, -1]) {
    const pts = bezier3([-0.25 * head.len, 0.75 * head.h, 0.4 * head.w * side], [0.2, 1.3, 0.7 * side], [0.8, 1.8, 0.9 * side], [1.6, 2.1, 0.8 * side], 40);
    for (const p of pts) add(p[0], p[1], p[2], PART.HORN, 0.5 + r() * 0.5);
  }
  const bodyPack: PackedGeometry = {
    attributes: {
      position: { array: new Float32Array(pos), itemSize: 3 },
      aPart: { array: new Float32Array(part), itemSize: 1 },
      aRand: { array: new Float32Array(rand), itemSize: 4 },
      aPivot: { array: new Float32Array((pos.length / 3) * 4).map((_, i) => (i % 4 < 3 ? hinge[i % 4] : 0)), itemSize: 4 },
    },
  };
  // wings: a solid membrane of night sky, with stars along the bones
  const wingSkin = buildWing({ span: 7, chord: 2.8, fingers: 4, scallop: 1.1, camber: 0.06, boneRadius: 0.06, resA: 80, resR: 12, sweep: 0.3 });
  const wpos = wingSkin.attributes.position.array;
  const wextra = wingSkin.attributes.aExtra.array;
  const wp: number[] = [];
  const wr: number[] = [];
  const wk: number[] = [];
  for (let i = 0; i < wpos.length / 3; i++) {
    const kind = wextra[i];
    if (r() > (kind >= 1 ? 0.5 : 0.12)) continue;
    wp.push(wpos[i * 3], wpos[i * 3 + 1], wpos[i * 3 + 2]);
    wr.push(r(), r(), kind >= 1 ? 1 : Math.pow(r(), 4), r());
    wk.push(kind);
  }
  const wingPack: PackedGeometry = {
    attributes: {
      position: { array: new Float32Array(wp), itemSize: 3 },
      aRand: { array: new Float32Array(wr), itemSize: 4 },
      aExtra: { array: new Float32Array(wk), itemSize: 1 },
    },
  };
  // constellation lines along the back + a few branches
  const lines: number[] = [];
  const stars: V3[] = [];
  for (let i = 0; i < 28; i++) {
    const s = 0.4 + (i / 27) * L * 0.92;
    stars.push([s, ASTRA.profile(s / L) * 1.16, Math.sin(i * 1.7) * ASTRA.profile(s / L) * 0.25]);
  }
  for (let i = 0; i < stars.length - 1; i++) lines.push(...stars[i], ...stars[i + 1]);
  for (let i = 2; i < stars.length - 4; i += 4) {
    const s = stars[i];
    const rad = ASTRA.profile(s[0] / L);
    lines.push(...s, s[0] + 0.5, -rad * 0.6, rad * 0.9);
    lines.push(...s, s[0] + 0.5, -rad * 0.6, -rad * 0.9);
  }
  const linePack: PackedGeometry = { attributes: { position: { array: new Float32Array(lines), itemSize: 3 } } };
  return { pack: { main: main.pack(), eyes: eyes.pack(), body: bodyPack, wing: wingPack, wingSkin, lines: linePack }, length: L };
}

/* =============================================================== CRIMSON */

export const CRIMSON = {
  length: 13,
  radius: 0.68,
  profile(t: number) {
    const neck = 0.52 + 0.48 * sstep(0.02, 0.2, t);
    const tail = 1 - 0.95 * sstep(0.36, 1.0, t);
    const chest = 1 + 0.4 * Math.exp(-Math.pow((t - 0.24) / 0.08, 2));
    const hip = 1 + 0.12 * Math.exp(-Math.pow((t - 0.42) / 0.07, 2));
    return CRIMSON.radius * neck * tail * chest * hip;
  },
  shoulder: 2.7,
};

export function buildCrimson(detail: number): BlueprintResult {
  const L = CRIMSON.length;
  const main = new GeoBuilder();
  const eyes = new GeoBuilder();
  body(main, { length: L, radius: CRIMSON.profile, segments: Math.round(200 * detail), radial: Math.round(24 * detail), squash: 0.95, ridge: 0.3, belly: 0.5, start: -0.3 });
  const head: HeadSpec = { len: 1.85, w: 0.38, h: 0.37, snout: 0.13, brow: 1.25, cheek: 0.85, jaw: 0.13, neck: CRIMSON.radius * 0.55, eye: 0.07, crest: 0.35, hook: 0.25 };
  addHead(main, eyes, head, 0.042 / Math.max(0.6, detail), { teeth: 7, fangs: true });
  addHorns(main, head, { base: [-0.25, 0.78, 0.45], c1: [0.02, 1.45, 0.62], c2: [0.42, 1.95, 0.7], tip: [0.92, 2.05, 0.5], radius: 0.1, ribs: 6 });
  addHorns(main, head, { base: [-0.15, 0.35, 0.85], c1: [0.1, 0.5, 1.15], c2: [0.32, 0.65, 1.3], tip: [0.62, 0.72, 1.3], radius: 0.05 });
  // cheek frills
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const base: V3 = [-0.2 + i * 0.12, -0.05 - i * 0.08, side * head.w * 0.85];
      const pts = bezier(base, [base[0] + 0.25, base[1] - 0.05, side * (head.w + 0.25)], [base[0] + 0.6, base[1] - 0.15 - i * 0.05, side * (head.w + 0.4)], 5);
      tube(main, pts, taper(pts.length, 0.05, 0, 1), 4, PART.HORN, [0, 0, 0, side], { flat: 0.4 });
    }
  }
  spikeRow(main, { from: 0.5, to: L * 0.9, count: Math.round(40 * detail), length: L, radius: CRIMSON.profile, height: (t) => 0.32 * (1 - sstep(0.4, 1.0, t) * 0.7), rake: 0.9, flat: 0.25, ridge: 0.3 });
  // spade tail of two blades
  for (const side of [1, -1]) {
    const pts = bezier([L * 0.955, 0, 0], [L * 0.99, 0.05, side * 0.55], [L * 1.06, 0, side * 0.05], 7);
    tube(main, pts, taper(pts.length, 0.14, 0, 0.8), 5, PART.SPIKE, [L, 0, 0, 0], { flat: 0.2, twistUp: [0, 1, 0] });
  }
  for (const side of [1, -1] as const) {
    leg(main, { s: 4.4, side, index: side === 1 ? 2 : 3, bodyRadius: CRIMSON.profile(4.4 / L), length: 1.35, thickness: 0.14, claws: 3, sweep: 0.8, radial: 6 });
  }
  const wing = buildWing({ span: 6.8, chord: 2.7, fingers: 3, scallop: 1.25, camber: 0.08, boneRadius: 0.065, resA: 66, resR: 12, sweep: 0.25 });
  return { pack: { main: main.pack(), eyes: eyes.pack(), wing }, length: L };
}

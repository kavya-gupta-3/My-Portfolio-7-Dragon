import { Vector3 } from 'three';
import { clamp, lerp, smootherstep } from '../../core/math.ts';

export type P3 = readonly [number, number, number];

/** A body shape: control points from the head to past the tip of the tail. */
export type Pose = readonly P3[];

/** Wing state: resting angle, flap amplitude, beats per second·τ, sweep, wrist bend. */
export type Wing = readonly [base: number, amp: number, rate: number, sweep: number, fold: number];

/**
 * One held moment of a dragon's performance. The pose is held from `at` to
 * `until`, then eases to the next beat, so a dragon can stop and deliver a
 * line while its idle motion keeps it alive.
 */
export interface Beat {
  at: number;
  until?: number;
  pose: Pose;
  jaw?: number;
  /** Idle sway amplitude along the body. */
  sway?: number;
  wing?: Wing;
  /** Leg stride amplitude. */
  walk?: number;
  /** Fades the dragon into the atmosphere (keeps page text readable). */
  haze?: number;
  /** Which way the back prefers to face. */
  up?: P3;
  /** Stage-relative point the head looks at; omitted = the camera. */
  look?: P3;
}

/** A camera key. Positions are stage-relative and splined between keys. */
export interface Shot {
  at: number;
  pos: P3;
  look: P3;
  fov: number;
  roll?: number;
}

/**
 * A dragon's entrance when it is summoned. Played in seconds, not scrolled, and
 * cut like a trailer: each take is its own camera move, with hard cuts between.
 */
export interface Entrance {
  seconds: number;
  /** The elemental hand-over that leads in, and how long it takes. */
  wipe: number;
  wipeSeconds: number;
  /** When the name slams onto the screen, 0‥1. */
  title: number;
  /** Poses, 0‥1 through the scene. The last one eases into the film. */
  beats: readonly Beat[];
  /** Camera takes. The last key of the last take is replaced by the film's shot. */
  takes: readonly (readonly Shot[])[];
  /** How much light the world gets through the scene, as [at, level] keys. */
  light: readonly (readonly [number, number])[];
}

/** Everything a performance resolves to on a given frame. */
export class Acting {
  readonly ctrl: Vector3[];
  /** Length of the bone between each pair of joints, head end first. */
  readonly rest: Float32Array;
  jaw = 0;
  sway = 0;
  flapBase = 0;
  flapAmp = 0;
  flapRate = 0;
  sweep = 0;
  fold = 0;
  walk = 0;
  haze = 0;
  readonly up = new Vector3(0, 1, 0);
  readonly look = new Vector3();
  /** 0 = look at the camera, 1 = look at `look`. */
  lookWeight = 0;

  constructor(points: number) {
    this.ctrl = Array.from({ length: points }, () => new Vector3());
    this.rest = new Float32Array(points - 1);
  }
}

/** A pose as a skeleton: one unit direction and one length per bone. */
interface Bones {
  dirs: Float32Array;
  lens: Float32Array;
  total: number;
}

const skeletons = new WeakMap<Pose, Bones>();

function bones(pose: Pose): Bones {
  let b = skeletons.get(pose);
  if (b) return b;
  const n = pose.length - 1;
  b = { dirs: new Float32Array(n * 3), lens: new Float32Array(n), total: 0 };
  for (let i = 0; i < n; i++) {
    const x = pose[i + 1][0] - pose[i][0];
    const y = pose[i + 1][1] - pose[i][1];
    const z = pose[i + 1][2] - pose[i][2];
    const l = Math.hypot(x, y, z) || 1;
    b.lens[i] = l;
    b.total += l;
    b.dirs[i * 3] = x / l;
    b.dirs[i * 3 + 1] = y / l;
    b.dirs[i * 3 + 2] = z / l;
  }
  skeletons.set(pose, b);
  return b;
}

/** Overlapping action: the head starts first and the tail finishes last. */
const OVERLAP = 0.42;
/** The joint that carries the body between poses: about the hips. */
const ROOT = 0.4;

const overlap = (t: number, s: number) => smootherstep(OVERLAP * s, 1 - OVERLAP * (1 - s), t);

const UP: P3 = [0, 1, 0];
const STILL: Wing = [0, 0, 0, 0, 0];
const STEP = new Float32Array(3);

/** Spherical blend of two unit vectors, into STEP. */
function slerp(a: Float32Array, ia: number, b: Float32Array, ib: number, k: number) {
  const ax = a[ia], ay = a[ia + 1], az = a[ia + 2];
  const bx = b[ib], by = b[ib + 1], bz = b[ib + 2];
  const d = clamp(ax * bx + ay * by + az * bz, -1, 1);
  if (d < -0.999) {
    // a bone turning right round has no shortest path, and the blend below
    // would pass through nothing at all: swing it around a fixed side axis
    let cx = az;
    let cy = 0;
    let cz = -ax;
    if (Math.hypot(cx, cz) < 0.2) {
      cx = 0;
      cy = -az;
      cz = ay;
    }
    const cl = Math.hypot(cx, cy, cz) || 1;
    const c = Math.cos(k * Math.PI);
    const s = Math.sin(k * Math.PI);
    STEP[0] = ax * c + (cx / cl) * s;
    STEP[1] = ay * c + (cy / cl) * s;
    STEP[2] = az * c + (cz / cl) * s;
    return;
  }
  const th = Math.acos(d);
  let wa = 1 - k;
  let wb = k;
  if (th > 1e-3) {
    const s = Math.sin(th) || 1e-4;
    wa = Math.sin((1 - k) * th) / s;
    wb = Math.sin(k * th) / s;
  }
  STEP[0] = ax * wa + bx * wb;
  STEP[1] = ay * wa + by * wb;
  STEP[2] = az * wa + bz * wb;
  const l = Math.hypot(STEP[0], STEP[1], STEP[2]) || 1;
  STEP[0] /= l;
  STEP[1] /= l;
  STEP[2] /= l;
}

const scratch = new Float32Array(64 * 3);

/**
 * Blends two poses the way a skeleton moves: every bone keeps its length and
 * swings from one direction to the other, and the whole chain hangs off the
 * hips. Blending the joints' positions directly would cut across the curve,
 * and halfway through a move the body would shrink and fold.
 */
function write(out: Acting, a: Beat, b: Beat, t: number) {
  const n = out.ctrl.length;
  const pa = a.pose;
  const pb = b.pose;
  if (a === b || t <= 0 || t >= 1) {
    const pose = t >= 1 ? pb : pa;
    const lens = bones(pose).lens;
    for (let i = 0; i < n; i++) {
      const p = pose[i];
      out.ctrl[i].set(p[0], p[1], p[2]);
      if (i < n - 1) out.rest[i] = lens[i];
    }
  } else {
    const ba = bones(pa);
    const bb = bones(pb);
    let sum = 0;
    for (let i = 0; i < n - 1; i++) {
      const k = overlap(t, (i + 0.5) / (n - 1));
      slerp(ba.dirs, i * 3, bb.dirs, i * 3, k);
      scratch[i * 3] = STEP[0];
      scratch[i * 3 + 1] = STEP[1];
      scratch[i * 3 + 2] = STEP[2];
      out.rest[i] = lerp(ba.lens[i], bb.lens[i], k);
      sum += out.rest[i];
    }
    // bones blend on staggered timing; the body as a whole never gets shorter
    const whole = lerp(ba.total, bb.total, smootherstep(0, 1, t)) / (sum || 1);
    for (let i = 0; i < n - 1; i++) out.rest[i] *= whole;
    const m = Math.round((n - 1) * ROOT);
    const km = overlap(t, m / (n - 1));
    const root = out.ctrl[m];
    root.set(lerp(pa[m][0], pb[m][0], km), lerp(pa[m][1], pb[m][1], km), lerp(pa[m][2], pb[m][2], km));
    for (let i = m; i < n - 1; i++) {
      const l = out.rest[i];
      out.ctrl[i + 1].set(out.ctrl[i].x + scratch[i * 3] * l, out.ctrl[i].y + scratch[i * 3 + 1] * l, out.ctrl[i].z + scratch[i * 3 + 2] * l);
    }
    for (let i = m - 1; i >= 0; i--) {
      const l = out.rest[i];
      out.ctrl[i].set(out.ctrl[i + 1].x - scratch[i * 3] * l, out.ctrl[i + 1].y - scratch[i * 3 + 1] * l, out.ctrl[i + 1].z - scratch[i * 3 + 2] * l);
    }
  }
  const k = smootherstep(0, 1, t);
  const wa = a.wing ?? STILL;
  const wb = b.wing ?? STILL;
  out.flapBase = lerp(wa[0], wb[0], k);
  out.flapAmp = lerp(wa[1], wb[1], k);
  out.flapRate = lerp(wa[2], wb[2], k);
  out.sweep = lerp(wa[3], wb[3], k);
  out.fold = lerp(wa[4], wb[4], k);
  out.jaw = lerp(a.jaw ?? 0.05, b.jaw ?? 0.05, k);
  out.sway = lerp(a.sway ?? 0.3, b.sway ?? 0.3, k);
  out.walk = lerp(a.walk ?? 0, b.walk ?? 0, k);
  out.haze = lerp(a.haze ?? 0, b.haze ?? 0, k);
  const ua = a.up ?? UP;
  const ub = b.up ?? UP;
  out.up.set(lerp(ua[0], ub[0], k), lerp(ua[1], ub[1], k), lerp(ua[2], ub[2], k)).normalize();
  const la = a.look;
  const lb = b.look;
  out.lookWeight = lerp(la ? 1 : 0, lb ? 1 : 0, k);
  if (la && lb) out.look.set(lerp(la[0], lb[0], k), lerp(la[1], lb[1], k), lerp(la[2], lb[2], k));
  else if (la) out.look.set(la[0], la[1], la[2]);
  else if (lb) out.look.set(lb[0], lb[1], lb[2]);
}

/** Resolve a list of beats at scene progress `p`. */
export function perform(beats: readonly Beat[], p: number, out: Acting) {
  let i = 0;
  while (i < beats.length - 1 && p >= beats[i + 1].at) i++;
  const a = beats[i];
  const b = beats[Math.min(i + 1, beats.length - 1)];
  const from = a.until ?? a.at;
  write(out, a, b, a === b || b.at <= from ? 0 : clamp((p - from) / (b.at - from)));
}

/** Resolve a single beat (the conclave pose). */
export function hold(beat: Beat, out: Acting) {
  write(out, beat, beat, 0);
}

/** Resolve one moving from `a` to `b` (0‥1). */
export function between(a: Beat, b: Beat, t: number, out: Acting) {
  write(out, a, b, clamp(t));
}

export interface Rig {
  pos: Vector3;
  look: Vector3;
  fov: number;
  roll: number;
}

export const makeRig = (): Rig => ({ pos: new Vector3(), look: new Vector3(), fov: 40, roll: 0 });

/**
 * Cubic through p1→p2 over `u`, with tangents from the neighbouring keys.
 * The keys are unevenly spaced in time, so the tangents are too: that is what
 * keeps the camera's speed continuous as it passes through a key.
 */
function spline(p0: number, p1: number, p2: number, p3: number, t0: number, t1: number, t2: number, t3: number, u: number) {
  const span = t2 - t1 || 1;
  const m1 = (t2 > t0 ? (p2 - p0) / (t2 - t0) : 0) * span;
  const m2 = (t3 > t1 ? (p3 - p1) / (t3 - t1) : 0) * span;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}

/** Spline the camera through its keys. */
export function film(shots: readonly Shot[], p: number, out: Rig) {
  let i = 0;
  while (i < shots.length - 2 && p >= shots[i + 1].at) i++;
  const s1 = shots[i];
  const s2 = shots[Math.min(i + 1, shots.length - 1)];
  const s0 = shots[Math.max(0, i - 1)];
  const s3 = shots[Math.min(i + 2, shots.length - 1)];
  const u = s1 === s2 ? 0 : clamp((p - s1.at) / (s2.at - s1.at));
  const key = (a: number, b: number, c: number, d: number) => spline(a, b, c, d, s0.at, s1.at, s2.at, s3.at, u);
  out.pos.set(key(s0.pos[0], s1.pos[0], s2.pos[0], s3.pos[0]), key(s0.pos[1], s1.pos[1], s2.pos[1], s3.pos[1]), key(s0.pos[2], s1.pos[2], s2.pos[2], s3.pos[2]));
  out.look.set(key(s0.look[0], s1.look[0], s2.look[0], s3.look[0]), key(s0.look[1], s1.look[1], s2.look[1], s3.look[1]), key(s0.look[2], s1.look[2], s2.look[2], s3.look[2]));
  out.fov = key(s0.fov, s1.fov, s2.fov, s3.fov);
  out.roll = key(s0.roll ?? 0, s1.roll ?? 0, s2.roll ?? 0, s3.roll ?? 0);
}

/** Read a curve of [at, value] keys, easing between them. */
export function curve(keys: readonly (readonly [number, number])[], t: number) {
  let i = 0;
  while (i < keys.length - 1 && t >= keys[i + 1][0]) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  return a === b ? a[1] : lerp(a[1], b[1], smootherstep(a[0], b[0], t));
}

/** One frame of a performance, frozen as a beat of its own. */
export function freeze(out: Acting): Beat {
  return {
    at: 1,
    pose: out.ctrl.map((q) => [q.x, q.y, q.z] as P3),
    jaw: out.jaw,
    sway: out.sway,
    wing: [out.flapBase, out.flapAmp, out.flapRate, out.sweep, out.fold],
    walk: out.walk,
    haze: out.haze,
    up: [out.up.x, out.up.y, out.up.z],
    look: out.lookWeight > 0.5 ? [out.look.x, out.look.y, out.look.z] : undefined,
  };
}

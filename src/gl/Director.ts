import { Vector2, Vector3 } from 'three';
import { clamp, damp, lerp, noise1, smootherstep, smoothstep } from '../core/math';
import { film, makeRig, type Rig, type Shot } from './cinema/timeline';

/** Height between worlds. Chapters are separated by cuts, not by flight. */
export const GAP = 70;
export const STAGE_COUNT = 7;

export function stageCenter(i: number, out = new Vector3()) {
  return out.set(0, i * GAP, 0);
}

/** The opening shot, framed like a film poster: the seven above, the name below. */
const CONCLAVE_WIDE: Shot[] = [
  { at: 0, pos: [0, 4.6, 52], look: [0, 4.4, 0], fov: 30 },
  { at: 0.55, pos: [0, 3.9, 45], look: [0, 3.9, 0], fov: 31 },
  { at: 1, pos: [0, 3.4, 41], look: [0, 3.5, 0], fov: 32 },
];

/** Portrait screens see less sideways: the camera pulls back along its axis. */
export function pullBack(aspect: number) {
  return aspect < 1 ? lerp(1.62, 1.28, clamp(aspect)) : aspect < 1.5 ? lerp(1.28, 1, clamp((aspect - 1) * 2)) : 1;
}

/** Where the opening shot comes to rest. */
export const POSTER = { y: 3.45, z: 41, fov: 32 };

export interface DirectorInput {
  scene: number;
  p: number;
  hero: number;
  /** 0‥1 through the opening sequence. */
  intro: number;
  shots: readonly Shot[];
  pointer: Vector2;
  aspect: number;
  dt: number;
  time: number;
  reduced: boolean;
  /** Follow the shots closely: an entrance is playing. */
  tight: boolean;
  /** The head of the dragon on screen, if there is one to keep in frame. */
  subject: Vector3 | null;
  /** This world's floor, relative to the stage, if it has one: the camera stays above it. */
  floor: number | null;
}

const UP = new Vector3(0, 1, 0);

/**
 * The camera operator. Each chapter is a spline of authored shots scrubbed
 * by scroll; on top of that sit a little handheld drift, a punch-in after
 * every cut and a shake that big moments can call for.
 */
export class Director {
  readonly camPos = new Vector3(0, 3.4, 41);
  readonly camTarget = new Vector3();
  fov = 32;
  roll = 0;
  /** Decays after a cut: the new shot arrives with momentum. */
  private punch = 0;
  private trauma = 0;
  private first = true;
  private readonly rig: Rig = makeRig();
  private readonly conclave: Rig = makeRig();
  private readonly wantPos = new Vector3();
  private readonly wantLook = new Vector3();
  private readonly tmp = new Vector3();
  private readonly ahead = new Vector3();
  private readonly side = new Vector3();
  private readonly lift = new Vector3();
  /** How far the camera has turned to keep the head in a narrow frame, in view widths. */
  private panX = 0;
  private panY = 0;

  /** Jump straight to the framing (no easing) on the next update. */
  snap() {
    this.first = true;
  }

  /** A cut has just happened. */
  cut(strength = 1) {
    this.first = true;
    this.punch = strength;
  }

  /** Add camera shake (roars, strikes, impacts). */
  shake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * A camera operator on a narrow frame: when the head drifts toward an edge,
   * turn just enough to bring it back inside, smoothly, and let go again.
   */
  private follow(head: Vector3 | null, want: Vector3, look: Vector3, fov: number, aspect: number, k: number, dt: number) {
    const f = this.ahead.copy(look).sub(want);
    const dist = f.length() || 1;
    f.divideScalar(dist);
    const r = this.side.crossVectors(f, UP).normalize();
    const u = this.lift.crossVectors(r, f);
    let ox = 0;
    let oy = 0;
    if (head) {
      const d = this.tmp.copy(head).sub(want);
      const z = d.dot(f);
      if (z > 2) {
        const tanV = Math.tan((fov * Math.PI) / 360);
        const tanH = tanV * aspect;
        const x = d.dot(r) / z;
        const y = d.dot(u) / z;
        // a margin either side, and more under the header than over the subtitles
        ox = (x - clamp(x, -tanH * 0.4, tanH * 0.4)) * k;
        oy = (y - clamp(y, -tanV * 0.55, tanV * 0.42)) * k;
      }
    }
    const rate = this.first ? 1 : 1 - Math.exp(-dt * 3.5);
    this.panX += (ox - this.panX) * rate;
    this.panY += (oy - this.panY) * rate;
    look.addScaledVector(r, this.panX * dist).addScaledVector(u, this.panY * dist);
  }

  update(s: DirectorInput) {
    const { dt, aspect, reduced, time } = s;
    const rig = this.rig;
    film(s.shots, s.p, rig);
    const center = stageCenter(s.scene, this.tmp);
    rig.pos.add(center);
    rig.look.add(center);
    if (s.scene === 0 && s.hero < 1) {
      film(CONCLAVE_WIDE, s.intro, this.conclave);
      const k = smootherstep(0.02, 1, s.hero);
      rig.pos.lerpVectors(this.conclave.pos, rig.pos, k);
      rig.look.lerpVectors(this.conclave.look, rig.look, k);
      rig.fov = lerp(this.conclave.fov, rig.fov, k);
      rig.roll *= k;
    }
    const want = this.wantPos.copy(rig.pos).sub(rig.look).multiplyScalar(pullBack(aspect)).add(rig.look);
    // backing away down a low angle can take the camera through the floor
    if (s.floor !== null) want.y = Math.max(want.y, center.y + s.floor + 0.7);
    const look = this.wantLook.copy(rig.look);
    // the shots were framed for a wide screen: on a tall one, turn to keep the head in
    const tall = 1 - smoothstep(0.8, 1.15, aspect);
    const alone = s.scene !== 0 || s.hero > 0.98;
    this.follow(tall > 0 && alone ? s.subject : null, want, look, rig.fov, aspect, tall, dt);
    const par = reduced ? 0 : 1;
    if (!reduced) {
      // a human holding the camera, not a tripod
      want.x += noise1(time * 0.23) * 0.22;
      want.y += noise1(time * 0.19 + 40) * 0.16;
      look.x += noise1(time * 0.31 + 80) * 0.1;
    }
    want.x += s.pointer.x * 0.9 * par;
    want.y += s.pointer.y * 0.5 * par;
    if (this.punch > 0.001) {
      this.tmp.copy(want).sub(look).multiplyScalar(this.punch * 0.42);
      want.add(this.tmp);
    }
    this.punch *= Math.exp(-dt * 2.6);

    if (this.first) {
      this.camPos.copy(want);
      this.camTarget.copy(look);
      this.fov = rig.fov;
      this.roll = rig.roll;
      this.first = false;
    }
    // a scripted take is already smooth, and fast moves shouldn't lag behind it
    const k = s.tight ? 16 : reduced ? 10 : 7;
    this.camPos.x = damp(this.camPos.x, want.x, k, dt);
    this.camPos.y = damp(this.camPos.y, want.y, k, dt);
    this.camPos.z = damp(this.camPos.z, want.z, k, dt);
    this.camTarget.x = damp(this.camTarget.x, look.x, k, dt);
    this.camTarget.y = damp(this.camTarget.y, look.y, k, dt);
    this.camTarget.z = damp(this.camTarget.z, look.z, k, dt);
    this.fov = damp(this.fov, rig.fov + (reduced ? 0 : smoothstep(0, 1, this.punch) * 9), 6, dt);
    this.roll = damp(this.roll, rig.roll, 6, dt);

    if (this.trauma > 0.001 && !reduced) {
      const q = this.trauma * this.trauma * 0.6;
      this.camPos.x += noise1(time * 31) * q;
      this.camPos.y += noise1(time * 37 + 11) * q;
      this.camTarget.x += noise1(time * 29 + 23) * q * 0.5;
      this.roll += noise1(time * 23 + 5) * q * 0.03;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.3);
  }
}

import { Color, DoubleSide, Vector2, Vector3 } from 'three';
import { clamp, damp, lerp, smoothstep } from '../../../core/math';
import crimsonFrag from '../../shaders/dragon/crimson.frag.glsl';
import dragonVert from '../../shaders/dragon/dragon.vert.glsl';
import eyeFrag from '../../shaders/dragon/eye.frag.glsl';
import eyeVert from '../../shaders/dragon/eye.vert.glsl';
import wingFrag from '../../shaders/dragon/wing.frag.glsl';
import wingVert from '../../shaders/dragon/wing.vert.glsl';
import { Emitter, Kind } from '../../fx/Emitter';
import { FireBreath } from '../../fx/FireBreath';
import type { Beat, Entrance, P3, Pose, Shot, Wing } from '../../cinema/timeline';
import type { FrameContext } from '../../types';
import { CRIMSON, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';

const p = new Vector3();
const v = new Vector3();
const T = new Vector3();
const N = new Vector3();
const B = new Vector3();
const F = new Vector3();
const fire = new Color(1.0, 0.25, 0.06);
const ember = new Color(1.0, 0.5, 0.15);

const FACING: P3 = [0, 0.35, -1];
/** Rolled toward the lens, so the wings show as a shape against the moon. */
const TILTED: P3 = [0, 0.62, -0.8];
const SOAR: Wing = [0.14, 0.26, 1.5, 0.08, -0.3];
const CRUISE: Wing = [0.1, 0.62, 3, 0.3, -0.3];
const DIVING: Wing = [0.1, 0.1, 2, 0.95, 0];
/** A hover: slow, heavy beats, the hand trailing behind the arm. */
const BEATING: Wing = [0.34, 0.5, 3, -0.26, -0.5];
const DISPLAY: Wing = [0.36, 0.16, 2.3, -0.5, -0.15];
/** Folded back along the body: on a phone, Aurum's spread wings crown the line-up. */
const TUCKED: Wing = [0.2, 0.05, 1, 1.1, 0];
/** Wings thrown wide and braced: how it stops dead in the air. */
const BRAKE: Wing = [0.62, 0.1, 2, -0.55, 0.1];

const shift = (pose: Pose, x: number, y: number, z: number): Pose => pose.map((q) => [q[0] + x, q[1] + y, q[2] + z] as P3);

/** Gliding flat out, head first along +x. */
const GLIDE: Pose = [[0, 0, 0], [-2, 0.5, 0], [-4, 0.3, 0], [-6, -0.3, 0], [-8, -0.6, 0], [-10, -0.4, 0], [-12, 0, 0], [-14, 0.4, 0], [-16, 0.3, 0], [-18, -0.2, 0], [-20, -0.4, 0], [-22, -0.2, 0]];
/** Banks hard and turns on you. */
const BANK: Pose = [[-3, 8, -9], [-2, 8.6, -11], [-1, 9, -13], [0.6, 9, -15], [2.8, 8.6, -17], [5.4, 8, -18.6], [8.4, 7.4, -19.6], [11.4, 7, -20], [14.4, 7, -20], [17.4, 7.4, -19.6], [20.4, 8, -19], [23.4, 8.6, -18]];
/** Straight down the lens. */
const DIVE: Pose = [[0, 2.4, 12.6], [0, 3.2, 10.6], [0, 4.2, 8.4], [0.2, 5.4, 6.2], [0.4, 6.8, 3.8], [0.6, 8.2, 1.4], [0.8, 9.6, -1], [1, 11, -3.4], [1.2, 12.4, -5.8], [1.4, 13.8, -8.2], [1.6, 15.2, -10.6], [1.8, 16.6, -13]];
/** Hanging in the air in front of you: an arched neck, chest out, tail curling away. */
const HOVERING: Pose = [[0.2, 6.2, 10.4], [0.1, 6.9, 8.6], [0, 6.4, 6.8], [0, 4.7, 5.9], [0, 2.8, 5.5], [0, 0.9, 5.4], [0.6, -0.9, 5.7], [2, -2.2, 6.4], [3.8, -2.9, 7.1], [5.8, -3.1, 7.5], [7.8, -3, 7.7], [9.8, -2.8, 7.7]];
/** Comes in close to say the quiet part. */
const CONFIDE: Pose = [[0, 4.6, 12.6], [0, 5.9, 11.2], [0, 6.5, 9.3], [0, 5.5, 7.7], [0, 3.8, 6.8], [0, 1.9, 6.2], [0.6, 0, 6.2], [2, -1.5, 6.8], [3.8, -2.4, 7.5], [5.8, -2.7, 7.9], [7.8, -2.7, 8.1], [9.8, -2.5, 8.1]];
/** Reared back, wings high: go on, say something. */
const DARE: Pose = [[0, 7.6, 9.4], [0, 8.2, 7.6], [0, 7.4, 5.9], [0, 5.5, 5.2], [0, 3.6, 5], [0, 1.7, 5.1], [0.6, -0.1, 5.5], [2, -1.5, 6.2], [3.8, -2.3, 6.9], [5.8, -2.6, 7.3], [7.8, -2.6, 7.5], [9.8, -2.4, 7.5]];
/** Waits above the form, on the right. */
const WAIT: Pose = shift(HOVERING, 7.4, -2.8, -13);

/**
 * 07 · CRIMSON — The Ember Herald. A black shape crossing a blood moon. It
 * banks, dives down the lens, throws its wings of living flame open and
 * stops dead in front of you to ask for a message. Send one and it carries
 * it: a roar, a blast of fire and a dive straight past the camera.
 */
export class Crimson extends Dragon {
  protected override bulk = 1.46;
  protected override neck = 3.6;
  protected override heave = 0.72;
  protected override repertoire: Gesture[] = ['glance', 'wings', 'rise', 'shake', 'roar'];
  protected override chest = 3.2;
  protected override hazeColor = new Color(0.02, 0.004, 0.006);
  readonly fire = new Emitter(420, { gravity: -1.2, drag: 1.4, turbulence: 2.5, buoyancy: 2 });
  /** Its fire burns redder than the magma dragon's: white, orange, blood red. */
  private readonly flames = new FireBreath(900, new Color(1.0, 0.82, 0.6), new Color(1.0, 0.32, 0.06), new Color(0.9, 0.06, 0.03));
  private swoopAt = -100;
  private breath = 0;
  /** How hard the pointer has been moving lately (0‥1), and the embers it still owes. */
  private stir = 0;
  private embersOwed = 0;
  private readonly lastPointer = new Vector2();

  readonly throne: Throne = {
    at: 0,
    exit: [0.1, 0.42],
    away: [0.7, 1, -0.3],
    narrow: { at: [4.45, 10.9, 0.4], fit: 0.6, wing: TUCKED },
    jaw: 0.1,
    sway: 0.18,
    up: FACING,
    wing: DISPLAY,
    look: [-8, 3, 15],
    pose: [[12.8, 8.4, 0.4], [13.4, 9.3, -1.4], [13.8, 8.7, -3.2], [14, 6.7, -4.4], [14, 4.3, -4.8], [14, 2, -4.8], [14.2, -0.2, -4.6], [15.4, -2, -3.8], [17.4, -3, -3], [19.4, -4.2, -2.6], [21, -6.2, -2.4], [22, -8.4, -2.4]],
  };

  readonly beats: Beat[] = [
    { at: 0, until: 0.03, pose: shift(GLIDE, -52, 19, -30), jaw: 0.04, sway: 0.14, wing: SOAR, up: TILTED, haze: 0.94, look: [20, 19, -30] },
    { at: 0.3, until: 0.31, pose: shift(GLIDE, -18, 18, -30), jaw: 0.04, sway: 0.14, wing: SOAR, up: TILTED, haze: 0.8, look: [40, 18, -30] },
    { at: 0.41, pose: BANK, jaw: 0.1, sway: 0.2, wing: CRUISE },
    { at: 0.5, pose: DIVE, jaw: 0.4, sway: 0.1, wing: DIVING },
    { at: 0.565, until: 0.7, pose: HOVERING, jaw: 0.08, sway: 0.13, wing: BEATING, up: FACING },
    { at: 0.76, until: 0.85, pose: CONFIDE, jaw: 0.08, sway: 0.11, wing: BEATING, up: FACING },
    { at: 0.9, until: 0.92, pose: DARE, jaw: 0.14, sway: 0.13, wing: BEATING, up: FACING },
    { at: 0.99, pose: WAIT, jaw: 0.06, sway: 0.16, wing: BEATING, up: FACING, haze: 0.4 },
  ];

  /**
   * A black disc takes the sky. The moon comes up behind it with a shape across
   * it. It screams, dives straight through the lens and stops dead, burning.
   */
  readonly entrance: Entrance = {
    seconds: 5,
    wipe: 7,
    wipeSeconds: 0.7,
    title: 0.66,
    light: [[0, 0], [0.1, 0.1], [0.24, 1], [1, 1]],
    beats: [
      { at: 0, until: 0.06, pose: shift(GLIDE, -40, 13, -6), jaw: 0.04, sway: 0.14, wing: SOAR, up: TILTED, haze: 0.97, look: [20, 13, -6] },
      { at: 0.34, until: 0.36, pose: shift(GLIDE, -8, 12, -6), jaw: 0.6, sway: 0.14, wing: SOAR, up: TILTED, haze: 0.85, look: [0, 4, 30] },
      { at: 0.46, pose: BANK, jaw: 0.5, sway: 0.2, wing: CRUISE },
      { at: 0.56, until: 0.565, pose: shift(DIVE, 0, 0, 12), jaw: 0.6, sway: 0.1, wing: DIVING },
      { at: 0.57, until: 0.64, pose: shift(HOVERING, 0, 1, 2), jaw: 0.9, sway: 0.1, wing: DIVING, up: FACING },
      { at: 0.68, until: 0.84, pose: HOVERING, jaw: 0.5, sway: 0.1, wing: BRAKE, up: FACING },
    ],
    takes: [
      [
        { at: 0, pos: [0, -7, 34], look: [-15, 16, -30], fov: 25 },
        { at: 0.36, pos: [0, -7, 33], look: [-12, 15, -30], fov: 24 },
      ],
      [
        { at: 0.36, pos: [5, -6, 24], look: [-3, 8, -8], fov: 40, roll: 0.1 },
        { at: 0.46, pos: [4, -3, 25], look: [0, 7, -8], fov: 42 },
        { at: 0.565, pos: [0, 0.6, 27], look: [0, 3.4, 12], fov: 62 },
      ],
      [
        { at: 0.565, pos: [-5, 2, 27], look: [0, 6, 8], fov: 56, roll: -0.08 },
        { at: 0.68, pos: [-11, 3, 30], look: [0, 4, 6], fov: 46 },
        { at: 0.84, pos: [-12, 3.4, 29], look: [0, 3.6, 6], fov: 41 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [0, -6, 26], look: [-14, 14, -30], fov: 27 },
    { at: 0.3, pos: [0, -6, 25], look: [-8, 14, -30], fov: 26 },
    { at: 0.41, pos: [4, -3, 25], look: [0, 7, -8], fov: 34 },
    { at: 0.5, pos: [0, 0.6, 27], look: [0, 3.4, 8], fov: 46 },
    { at: 0.565, pos: [-12, 3.4, 29], look: [0, 3.6, 6], fov: 41 },
    { at: 0.7, pos: [-9, 4.4, 25], look: [0.2, 4.2, 7], fov: 36 },
    { at: 0.8, pos: [-6.5, 4.4, 24], look: [0.2, 5, 9.4], fov: 28 },
    { at: 0.9, pos: [-9.5, 3, 25.5], look: [0.2, 4.4, 7], fov: 37 },
    { at: 1, pos: [-2, 2, 30], look: [3, 2, 0], fov: 36 },
  ];

  constructor() {
    super('crimson', 6, CRIMSON.length, 112, {
      keyDir: new Vector3(-0.4, 0.7, 0.6),
      key: new Color(1.0, 0.7, 0.62).multiplyScalar(1.15),
      sky: new Color(0.12, 0.02, 0.03),
      ground: new Color(0.22, 0.03, 0.015),
      rim: new Color(1.0, 0.15, 0.1).multiplyScalar(0.34),
      envTop: new Color(0.25, 0.05, 0.06),
      envHorizon: new Color(0.35, 0.04, 0.03),
      envBottom: new Color(0.6, 0.12, 0.03),
    });
    this.group.add(this.fire.points, this.flames.group);
  }

  build(result: BlueprintResult) {
    const m = this.material(dragonVert, crimsonFrag, {
      uLen: { value: CRIMSON.length },
      uRed: { value: new Color(0.5, 0.012, 0.03) },
      uEmber: { value: new Color(1.0, 0.32, 0.06) },
    });
    this.mesh(toGeometry(result.pack.main), m);
    const eyes = this.material(eyeVert, eyeFrag, {
      uEyeColor: { value: new Color(1.0, 0.85, 0.3) },
      uEyeColor2: { value: new Color(1.0, 0.15, 0.05) },
    });
    this.mesh(toGeometry(result.pack.eyes), eyes);
    const wingGeo = toGeometry(result.pack.wing);
    for (const side of [1, -1]) {
      const wm = this.material(
        wingVert,
        wingFrag,
        {
          uSide: { value: side },
          uWingS: { value: CRIMSON.shoulder },
          uWingRoot: { value: new Vector3(0.05, 0.36, 0.34) },
          uSpan: { value: 6.8 },
          uDihedral: { value: 0.1 },
          uPanels: { value: 5 },
          uTintA: { value: new Color(0.9, 0.08, 0.04) },
          uTintB: { value: new Color(1.0, 0.45, 0.08) },
        },
        { side: DoubleSide, defines: { FIRE: '' } },
      );
      this.mesh(wingGeo, wm);
    }
    this.ready = true;
  }

  /** The message has been sent: roar, breathe fire, dive past the camera. */
  swoop(time: number) {
    this.swoopAt = time;
    this.rage = 1;
    this.breath = 1.6;
  }

  override provoke(ctx: FrameContext, loud = true) {
    super.provoke(ctx, loud);
    if (loud) this.breath = 1.2;
    // a click anywhere while it's watching you: a short warning breath, at the pointer
    else if (this.watch > 0.4) this.breath = Math.max(this.breath, 0.55);
  }

  private wingTip(side: number, out: Vector3) {
    const s = CRIMSON.shoulder;
    this.spine.sample(s, out);
    this.spine.tangent(s, T);
    this.spine.normal(s, N);
    B.crossVectors(T, N);
    const flap = this.uniforms.uFlap.value as number;
    const span = 6.0 * this.bulk;
    return out
      .addScaledVector(B, side * span * Math.cos(flap))
      .addScaledVector(N, span * Math.sin(flap) * 0.9)
      .addScaledVector(T, span * 0.45);
  }

  protected override adjust(ctx: FrameContext) {
    const since = ctx.time - this.swoopAt;
    const dive = smoothstep(0, 0.6, since) * (1 - smoothstep(1.6, 3.2, since));
    if (dive <= 0) return;
    // the herald leaves with the message: straight past the lens
    const z = lerp(0, ctx.camera.position.z - 2, dive);
    for (const q of this.acting.ctrl) {
      q.z = lerp(q.z, z, dive * 0.8);
      q.y = lerp(q.y, ctx.camera.position.y + 1, dive * 0.5);
    }
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    if (this.beat(0.02, ctx)) h?.voice('rise');
    if (this.beat(0.34, ctx)) {
      h?.voice('roar');
      h?.light(0.9);
    }
    if (this.beat(0.46, ctx)) h?.voice('flap');
    if (this.beat(0.565, ctx)) {
      // through the lens: it is on you
      h?.strobe(1);
      h?.quake(1);
      h?.voice('impact');
      this.breath = 1.5;
    }
    if (this.beat(0.66, ctx)) {
      h?.shock(0.5, 0.5, 1.3);
      h?.strobe(0.5);
      h?.light(0.7);
      h?.quake(0.5);
      h?.voice('flap');
      this.flameRing(180);
    }
    this.uniforms.uHeat.value = Math.max(this.uniforms.uHeat.value as number, smoothstep(0.46, 0.57, t) * (1 - smoothstep(0.84, 0.98, t)));
  }

  /** A ring of fire thrown off the wings as they brake. */
  private flameRing(count: number) {
    this.spine.sample(CRIMSON.shoulder, p);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      v.set(Math.cos(a) * 15, Math.sin(a) * 15, 3 + Math.random() * 5);
      this.fire.spawn(p, v, Math.random() < 0.6 ? fire : ember, 0.8 + Math.random() * 0.5, 0.6 + Math.random() * 0.7, Kind.Fire);
    }
  }

  /** The moon flares and its wings burn hotter. */
  protected override onGesture(kind: Gesture) {
    if (kind === 'glance') return;
    this.stagehand?.light(0.4);
    if (kind === 'wings') this.stagehand?.voice('flap');
    if (kind === 'roar') {
      this.breath = 0.9;
      this.stagehand?.voice('roar');
    }
  }

  protected act(ctx: FrameContext) {
    const { time: t, dt } = ctx;
    if (this.cue(0.5, ctx)) {
      this.stagehand?.voice('roar');
      this.stagehand?.shock(0.5, 0.55, 0.9);
      this.breath = 1;
    }
    if (this.cue(0.555, ctx)) {
      this.stagehand?.voice('flap');
      this.flameRing(120);
    }
    const u = this.uniforms;
    this.breath = Math.max(0, this.breath - dt);
    if (ctx.entry < 0) u.uHeat.value = this.rage;
    // it leans into a turn at speed; hanging in the air it stays square to you
    this.spine.bankGain = 3.5 * smoothstep(4, 14, this.headSpeed);

    // flame trails from the wingtips
    const rate = 42 + this.rage * 90;
    for (const side of [1, -1]) {
      if (Math.random() < clamp(dt * rate * 0.5, 0, 1)) {
        this.wingTip(side, p);
        v.set((Math.random() - 0.5) * 0.6, Math.random() * 0.6, (Math.random() - 0.5) * 0.6);
        this.fire.spawn(p, v, Math.random() < 0.7 ? fire : ember, 0.7 + Math.random() * 0.5, 0.5 + Math.random() * 0.6, Kind.Fire);
      }
    }
    this.followPointer(ctx);
    // fire breath
    const power = smoothstep(0, 0.25, this.breath);
    this.gape = power;
    this.facing(F);
    this.mouthAt(p, 1.6, 0.06);
    this.flames.update(p, F, this.drift, power, t, dt, ctx.camera, window.innerHeight * ctx.pixelRatio);
    this.fire.update(dt, t, ctx.pixelRatio);
  }

  /**
   * On its own page it watches you. Its head follows the pointer wherever it
   * goes, the pointer leaves a trail of embers, and a quick hand sets the
   * wings beating harder.
   */
  private followPointer(ctx: FrameContext) {
    const { dt } = ctx;
    const watching = ctx.scene === this.stage && ctx.entry < 0 && ctx.free && ctx.p > 0.56;
    this.watch = damp(this.watch, watching ? 0.85 : 0, 3, dt);
    const moved = this.lastPointer.distanceTo(ctx.pointer) / Math.max(dt, 1e-3);
    this.lastPointer.copy(ctx.pointer);
    this.stir = damp(this.stir, watching ? Math.min(1, moved * 0.4) : 0, 6, dt);
    this.wingPhase += dt * this.stir * 6;
    if (!watching || moved < 0.05) return;
    // embers where the pointer is, a little in front of the dragon
    const reach = ctx.camera.position.distanceTo(this.acting.ctrl[0]) * 0.7;
    this.embersOwed += dt * Math.min(moved, 4) * 22;
    for (; this.embersOwed >= 1; this.embersOwed--) {
      p.copy(ctx.camera.position).addScaledVector(ctx.ray, reach);
      p.x += (Math.random() - 0.5) * 0.35;
      p.y += (Math.random() - 0.5) * 0.35;
      v.set((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2);
      this.fire.spawn(p, v, Math.random() < 0.5 ? fire : ember, 0.6 + Math.random() * 0.5, 3.2 + Math.random() * 2.8, Kind.Fire);
    }
  }

  protected override legRest(i: number) {
    return i < 2 ? 0 : 0.9;
  }
}

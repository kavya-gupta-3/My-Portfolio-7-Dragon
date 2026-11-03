import { Color, Vector3 } from 'three';
import { clamp, damp, smoothstep } from '../../../core/math';
import eyeFrag from '../../shaders/dragon/eye.frag.glsl';
import eyeVert from '../../shaders/dragon/eye.vert.glsl';
import ignisFrag from '../../shaders/dragon/ignis.frag.glsl';
import dragonVert from '../../shaders/dragon/dragon.vert.glsl';
import type { Beat, Entrance, P3, Pose, Shot } from '../../cinema/timeline';
import type { FrameContext } from '../../types';
import { IGNIS, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';
import { Emitter, Kind } from '../../fx/Emitter';
import { FireBreath } from '../../fx/FireBreath';

const p = new Vector3();
const v = new Vector3();
const F = new Vector3();
const emberCol = new Color(1.0, 0.6, 0.18);
const TREMORS = [[0.06, 0.5], [0.13, 0.75], [0.2, 1]] as const;

/** Keeps the scaled back, not the belly, toward the lens on vertical runs. */
const BACK: P3 = [0, 0.5, 1];

const TAIL: Pose = [[-2, -10.4, -4.4], [-7, -11, -4], [-11, -12, -2], [-13, -13, 1]];

/** Risen out of the lava, facing the lens. */
const RISEN: Pose = [[0.5, 4.6, 7.6], [0, 5.9, 5.9], [-1.5, 6.9, 4], [-3.5, 6, 2], [-4.7, 3.2, 1], [-3.4, 0.2, 1.3], [-0.4, -2.2, 2], [3, -3.8, 1.4], [4.6, -6.4, -0.8], [2.4, -9, -3.2], ...TAIL];
/** Leans in as it speaks. */
const LEAN: Pose = [[-0.3, 3.8, 9.4], [0, 5, 7.8], [-1.2, 6.2, 6], [-3.2, 5.8, 3.8], [-4.8, 3.4, 2], [-3.8, 0.4, 1.4], [-0.8, -2, 2], [2.8, -3.8, 1.4], [4.6, -6.4, -0.8], [2.4, -9, -3.2], ...TAIL];
/** Cobra: drawn back and up, about to strike. */
const COBRA: Pose = [[0.2, 9.8, 3], [0.2, 10.8, 1.1], [0.2, 9.7, -0.8], [-1.2, 7, -1.8], [-2.6, 4.2, -1], [-2.4, 1.2, 0.4], [0, -1, 1.2], [3, -3, 0.6], [4.4, -6, -1.4], [2.4, -8.8, -3.4], ...TAIL];
/** Full strike: the head fills the lens. */
const STRIKE: Pose = [[0, 3.4, 20.5], [0, 4.3, 17.6], [0.2, 5.2, 14.2], [0.6, 5.4, 9.2], [0.4, 4.8, 6], [-0.6, 3.4, 3.2], [-1, 1, 1.2], [1, -1.6, 0.6], [3.6, -4, -0.6], [2.8, -7.2, -3], ...TAIL];
/** Drifts off to one side so the page can be read. */
const DRIFT: Pose = [[7.4, 1.8, -3], [8.8, 2.9, -4.4], [11, 2.7, -5.6], [12.6, 0.7, -6.6], [11.6, -2.2, -7.4], [8.6, -3.6, -8.2], [4.8, -3, -9], [1.8, -1.2, -10], [-1, -2, -11], [-3, -5, -12], [-4, -9, -13], [-6, -12, -12], [-10, -13, -9], [-12, -14, -5]];

/** Deep under the lava, about to come up. */
const BURIED: Pose = RISEN.map(([x, y, z]) => [x, y - 27, z]);
/** Out of the lava in one straight line, head to the sky. */
const ERUPT: Pose = [[0.4, 18, 3.2], [0.2, 16, 2.8], [0, 14, 2.4], [-0.4, 11.8, 2], [-0.6, 9.4, 1.6], [-0.4, 6.8, 1.4], [0, 4.2, 1.2], [0.4, 1.6, 1], [0.4, -1, 0.8], [0.2, -3.6, 0.6], [0, -6.2, 0.4], [-0.2, -8.8, 0.2], [-0.4, -11.2, 0], [-0.6, -13.6, -0.2]];

/**
 * 01 · IGNIS — The Obsidian Sovereign. Rises out of the lava, tells you who
 * this site belongs to, rears, and strikes straight at the lens with a
 * breath of fire that burns the frame away.
 */
export class Ignis extends Dragon {
  protected override bulk = 1.42;
  protected override neck = 5;
  protected override repertoire: Gesture[] = ['glance', 'rise', 'dip', 'shake', 'flick', 'roar', 'roar'];
  protected override chest = 3.8;
  protected override hazeColor = new Color(0.02, 0.008, 0.006);
  private flow = 0;
  private breath = 0;
  readonly fire = new Emitter(500, { gravity: -0.6, drag: 1.2, turbulence: 2.2, buoyancy: 2.5 });
  /** Molten rock's own fire: white at the jaws, gold, then a deep red. */
  private readonly flames = new FireBreath(900, new Color(1.0, 0.9, 0.66), new Color(1.0, 0.5, 0.1), new Color(1.0, 0.16, 0.03));

  readonly throne: Throne = {
    at: 0,
    exit: [0, 0],
    away: [0, 0, 0],
    narrow: { at: [-1.95, 5.85, 8], fit: 0.6 },
    jaw: 0.1,
    sway: 0.2,
    up: BACK,
    look: [9, 1.4, 19],
    pose: [[-6.4, 2.6, 10], [-7.7, 3.6, 8.1], [-10, 3.4, 6.5], [-11.6, 1.2, 5.6], [-10.8, -1.6, 5], [-7.4, -3.8, 5.6], [-2.4, -5.2, 6.2], [3.2, -5.6, 5.6], [8.4, -5.2, 4.2], [12, -6.6, 2], [13, -9.6, -0.6], [10.4, -12.4, -3.2], [6, -13.4, -5], [1, -14, -6]],
  };

  readonly beats: Beat[] = [
    { at: 0, until: 0.08, pose: RISEN, jaw: 0.06, sway: 0.34, up: BACK, look: [11, 3, 22] },
    { at: 0.14, until: 0.5, pose: LEAN, jaw: 0.04, sway: 0.26, up: BACK, look: [12, 3.5, 20] },
    { at: 0.6, until: 0.66, pose: COBRA, jaw: 0.3, sway: 0.2, up: BACK, look: [0, 4, 30] },
    { at: 0.73, until: 0.8, pose: STRIKE, jaw: 0.72, sway: 0.1, up: BACK },
    { at: 0.97, pose: DRIFT, jaw: 0.06, sway: 0.4, haze: 0.42, up: BACK },
  ];

  /** The lava heaves, it erupts through the floor, rears, and burns the lens. */
  readonly entrance: Entrance = {
    seconds: 4.2,
    wipe: 0,
    wipeSeconds: 0.7,
    title: 0.68,
    light: [[0, 0.6], [0.22, 0.85], [0.26, 1], [1, 1]],
    beats: [
      { at: 0, until: 0.23, pose: BURIED, jaw: 0, sway: 0.1, up: BACK },
      { at: 0.38, until: 0.42, pose: ERUPT, jaw: 0.7, sway: 0.08, up: BACK, look: [0, 34, 8] },
      { at: 0.53, until: 0.55, pose: COBRA, jaw: 0.3, sway: 0.1, up: BACK, look: [0, 4, 30] },
      { at: 0.61, until: 0.82, pose: STRIKE, jaw: 0.85, sway: 0.06, up: BACK },
    ],
    takes: [
      [
        { at: 0, pos: [-13, 3, 34], look: [0, -9, 4], fov: 38 },
        { at: 0.24, pos: [-9, -1, 25], look: [0, -8, 2], fov: 42 },
      ],
      [
        { at: 0.24, pos: [-5, -7.6, 15], look: [0, 1, 2], fov: 72, roll: 0.12 },
        { at: 0.42, pos: [-4.4, -7.8, 13.5], look: [0, 13, 2], fov: 74, roll: 0.16 },
      ],
      [
        { at: 0.42, pos: [-9, 2, 20], look: [0, 10, 2], fov: 48, roll: 0.06 },
        { at: 0.55, pos: [-8, 1.6, 17.5], look: [0, 7.6, 1], fov: 46, roll: 0.05 },
        { at: 0.61, pos: [-3, 4.8, 26.5], look: [0, 3.4, 17], fov: 54 },
        { at: 0.76, pos: [-1.8, 4.4, 26.4], look: [0, 3.4, 18], fov: 66 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [0, 0.5, 31], look: [0, 3, 1], fov: 34 },
    { at: 0.18, pos: [-6.5, 6.2, 22], look: [0, 4.8, 8], fov: 30 },
    { at: 0.36, pos: [-3.6, 5, 21], look: [0.6, 4.4, 9.4], fov: 26 },
    { at: 0.5, pos: [-5.5, 2.4, 21], look: [0.6, 4.6, 8.6], fov: 30 },
    { at: 0.62, pos: [-8, 1.6, 17.5], look: [0, 7.6, 1], fov: 46, roll: 0.05 },
    { at: 0.74, pos: [-3, 4.4, 28], look: [0, 3.8, 17], fov: 50 },
    { at: 0.82, pos: [-1.6, 4, 29], look: [0, 3.8, 18], fov: 60 },
    { at: 1, pos: [-2, 3, 27], look: [3.2, 1.4, 0], fov: 38 },
  ];

  constructor() {
    super('ignis', 0, IGNIS.length, 128, {
      keyDir: new Vector3(0.35, 0.8, 0.55),
      key: new Color(1.0, 0.8, 0.66).multiplyScalar(1.5),
      sky: new Color(0.04, 0.035, 0.05),
      ground: new Color(0.24, 0.06, 0.012),
      rim: new Color(1.0, 0.36, 0.08).multiplyScalar(0.3),
      envTop: new Color(0.03, 0.028, 0.04),
      envHorizon: new Color(0.07, 0.03, 0.02),
      envBottom: new Color(0.24, 0.055, 0.012),
    }, 14);
    this.spine.upRelax = 0.06;
    this.group.add(this.fire.points, this.flames.group);
  }

  override provoke(ctx: FrameContext, loud = true) {
    super.provoke(ctx, loud);
    // a click beside it only stirs it; a click on it gets the fire
    if (loud) this.breath = 1.4;
  }

  build(result: BlueprintResult) {
    const body = this.material(dragonVert, ignisFrag, {
      uLen: { value: IGNIS.length },
      uLavaA: { value: new Color(1.0, 0.18, 0.02) },
      uLavaB: { value: new Color(1.0, 0.72, 0.22) },
    });
    this.mesh(toGeometry(result.pack.main), body);
    const eyes = this.material(eyeVert, eyeFrag, {
      uEyeColor: { value: new Color(1.0, 0.62, 0.12) },
      uEyeColor2: { value: new Color(1.0, 0.2, 0.02) },
    });
    this.mesh(toGeometry(result.pack.eyes), eyes);
    this.ready = true;
  }

  /** A fountain of sparks out of the lava. */
  private spout(x: number, z: number, count: number, spread: number, speed: number, ctx: FrameContext) {
    const y = ctx.center.y - 8.5;
    for (let i = 0; i < count; i++) {
      p.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread);
      v.set((Math.random() - 0.5) * 7, speed * (0.4 + Math.random() * 0.6), (Math.random() - 0.5) * 7);
      this.fire.spawn(p, v, emberCol, 1.2 + Math.random(), 0.3 + Math.random() * 0.5, Kind.Spark);
    }
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    if (this.beat(0.02, ctx)) h?.voice('rise');
    // the lava heaves three times, each time harder
    for (const [at, power] of TREMORS) {
      if (this.beat(at, ctx)) {
        h?.light(power);
        h?.quake(power * 0.5);
        h?.voice('stir', power);
        this.spout((Math.random() - 0.5) * 18, -4 - Math.random() * 10, 40, 4, 15 + power * 8, ctx);
      }
    }
    if (this.beat(0.25, ctx)) {
      // through the floor
      h?.strobe(0.9);
      h?.shock(0.5, 0.16, 1.2);
      h?.light(1);
      h?.quake(0.9);
      h?.voice('impact');
      h?.voice('roar', 0.9);
      this.spout(0, 2, 220, 9, 34, ctx);
    }
    if (this.beat(0.58, ctx)) {
      h?.voice('roar', 1.1);
      h?.quake(0.5);
      this.breath = 2.3;
    }
    if (this.beat(0.64, ctx)) {
      h?.shock(0.5, 0.52, 1.1);
      h?.strobe(0.5);
    }
    this.uniforms.uHeat.value = Math.max(this.uniforms.uHeat.value as number, smoothstep(0.22, 0.3, t) * (1 - smoothstep(0.8, 0.98, t)));
  }

  /** Between lines the lava answers it: sparks fountain out of the sea behind. */
  protected override onGesture(kind: Gesture, ctx: FrameContext) {
    if (kind === 'glance') return;
    this.spout(ctx.center.x + (Math.random() - 0.5) * 44, ctx.center.z - 16 - Math.random() * 22, 46, 4, 22, ctx);
    this.stagehand?.light(kind === 'roar' ? 0.9 : 0.5);
    if (kind === 'roar') {
      this.breath = 1;
      this.stagehand?.voice('roar', 1);
    }
  }

  protected act(ctx: FrameContext) {
    const { time: t, dt } = ctx;
    if (this.cue(0.7, ctx)) {
      this.stagehand?.voice('roar', 1);
      this.stagehand?.shock(0.5, 0.55, 1);
      this.breath = 1.9;
    }
    const u = this.uniforms;
    const speedBoost = clamp(Math.abs(ctx.velocity) * 0.04, 0, 3);
    this.flow = damp(this.flow, speedBoost, 3, dt);
    const charge = ctx.scene === 0 ? smoothstep(0.5, 0.7, ctx.p) * (1 - smoothstep(0.82, 0.95, ctx.p)) : 0;
    if (ctx.entry < 0) u.uHeat.value = Math.max(this.rage, charge);
    u.uFlow.value = this.flow;
    // fire breath, and embers that stream off the burning mane
    this.breath = Math.max(0, this.breath - dt);
    const power = smoothstep(0, 0.25, this.breath);
    this.gape = power;
    this.facing(F);
    this.mouthAt(p, 2.0, 0.07);
    this.flames.update(p, F, this.drift, power, t, dt, ctx.camera, window.innerHeight * ctx.pixelRatio);
    if (this.breath > 0) {
      for (let i = 0; i < 3; i++) {
        v.copy(F).multiplyScalar(18 + Math.random() * 12);
        v.x += (Math.random() - 0.5) * 6;
        v.y += (Math.random() - 0.5) * 6;
        v.z += (Math.random() - 0.5) * 6;
        this.fire.spawn(p, v, emberCol, 0.6 + Math.random() * 0.5, 0.2 + Math.random() * 0.3, Kind.Spark);
      }
    }
    if (Math.random() < dt * (24 + this.flow * 30)) {
      this.spine.sample(0.3 + Math.random() * 3.2, p);
      p.y += 0.5;
      v.set((Math.random() - 0.5) * 0.8, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8);
      this.fire.spawn(p, v, emberCol, 1.4 + Math.random(), 0.25 + Math.random() * 0.3, Kind.Spark);
    }
    this.fire.update(dt, t, ctx.pixelRatio);
  }

  protected override legRest(i: number) {
    return i < 2 ? 0.7 : 0.9;
  }
}

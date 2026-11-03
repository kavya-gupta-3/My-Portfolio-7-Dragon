import { Color, DoubleSide, Vector3 } from 'three';
import aurumFrag from '../../shaders/dragon/aurum.frag.glsl';
import dragonVert from '../../shaders/dragon/dragon.vert.glsl';
import eyeFrag from '../../shaders/dragon/eye.frag.glsl';
import eyeVert from '../../shaders/dragon/eye.vert.glsl';
import wingFrag from '../../shaders/dragon/wing.frag.glsl';
import wingVert from '../../shaders/dragon/wing.vert.glsl';
import { smoothstep } from '../../../core/math';
import type { Beat, Entrance, P3, Pose, Shot, Wing } from '../../cinema/timeline';
import { GAP } from '../../Director';
import { CoinStorm } from '../../fx/CoinStorm';
import { rupeeTexture } from '../../fx/Props';
import type { FrameContext } from '../../types';
import { AURUM, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';

const FACING: P3 = [0, 0.35, -1];
const FOLDED: Wing = [-0.1, 0.02, 0.8, 1.15, 0];
const OPENING: Wing = [0.15, 0.05, 1, 0.1, 0];
const SPREAD: Wing = [0.34, 0.14, 2.1, -0.48, -0.15];

/** Asleep on the hoard, head down. */
const SLUMBER: Pose = [[0, -3.9, 8.8], [0, -3.3, 7], [0, -2, 5.5], [0, -0.8, 4], [0, -0.4, 2.4], [0, -0.8, 0.8], [0, -1.8, -0.8], [0, -3.2, -2.4], [1, -5, -3.6], [2.6, -6.4, -3.6], [4.6, -6.8, -2], [6, -6.9, 0]];
/** Head lifted, looking straight at you. */
const WOKEN: Pose = [[0, 1.9, 8.8], [0, 2.3, 6.9], [0, 2.2, 5], [0, 1.8, 3.2], [0, 0.9, 1.6], [0, -0.3, 0.2], [0, -1.8, -1.2], [0, -3.4, -2.6], [1, -5, -3.6], [2.6, -6.4, -3.6], [4.6, -6.8, -2], [6, -6.9, 0]];
/** Reared to full height, wings out: the heraldic pose. */
const RAMPANT: Pose = [[0, 7.4, 5], [0, 8.5, 3.3], [0, 7.9, 1.5], [0, 5.9, 0.2], [0, 3.5, -0.5], [0, 1, -1], [0, -1.4, -1.2], [0, -3.8, -1], [-1, -5.7, 0], [-3, -6.9, 1.4], [-5.4, -7.1, 2.6], [-7.6, -7, 2.6]];
/** Over the trophies, off to one side. */
const OVERSEE: Pose = [[6.4, 3.8, -3.6], [6.4, 4.9, -5.4], [6.4, 4.3, -7.2], [6.4, 2.3, -8.4], [6.4, 0, -9], [6.4, -2.4, -9.4], [6.4, -4.4, -9.6], [6.4, -6.2, -9], [5.4, -7.1, -7.6], [3.4, -7.4, -6.6], [1, -7.4, -6], [-1.6, -7.4, -6]];

/** Under the hoard, all of it: nothing shows yet. */
const BURIED: Pose = RAMPANT.map(([x, y, z]) => [x, y - 24, z]);

/** The moment it comes up through the gold, and the war drums before it. */
const ERUPT = 0.46;
const DRUMS = [[0.24, 0.35], [0.32, 0.5], [0.38, 0.7], [0.43, 0.9]] as const;

/**
 * 05 · AURUM — The Hoard King. Asleep on the gold when the shot opens. It
 * lifts its head to read the numbers, rears to its full height with its
 * wings thrown wide, and roars until the coins fall out of the sky.
 */
export class Aurum extends Dragon {
  protected override bulk = 1.85;
  protected override neck = 3.8;
  protected override repertoire: Gesture[] = ['glance', 'rise', 'wings', 'flick', 'roar'];
  protected override chest = 3.5;
  protected override hazeColor = new Color(0.024, 0.014, 0.004);
  onRoar: (() => void) | null = null;
  private readonly storm = new CoinStorm(new Vector3(0, 4 * GAP - 7.5, 0), rupeeTexture(), 460);

  readonly throne: Throne = {
    at: 0,
    exit: [0.18, 0.6],
    away: [0, 1.1, -0.6],
    narrow: { at: [0, 14.2, -5.4], fit: 0.6 },
    jaw: 0.06,
    sway: 0.12,
    up: FACING,
    wing: SPREAD,
    look: [10, 6, 24],
    pose: [[0, 9.4, -5.4], [0, 10.4, -7.2], [0, 9.7, -9], [0, 7.6, -10], [0, 5.2, -10.2], [0, 2.8, -10.2], [0, 0.4, -10], [-1, -1.8, -9], [-3, -3.6, -8], [-5.5, -4.6, -7.8], [-8, -5.2, -8], [-10, -5.8, -8.4]],
  };

  readonly beats: Beat[] = [
    { at: 0, until: 0.08, pose: SLUMBER, jaw: 0.02, sway: 0.06, wing: FOLDED, up: [0, 1, 0] },
    { at: 0.2, until: 0.4, pose: WOKEN, jaw: 0.04, sway: 0.1, wing: FOLDED, up: [0, 1, 0], look: [13, 1.2, 18] },
    { at: 0.56, until: 0.6, pose: RAMPANT, jaw: 0.1, sway: 0.1, wing: OPENING, up: FACING },
    { at: 0.66, until: 0.8, pose: RAMPANT, jaw: 0.78, sway: 0.06, wing: SPREAD, up: FACING, look: [3, 14, 18] },
    { at: 0.97, pose: OVERSEE, jaw: 0.05, sway: 0.1, wing: SPREAD, up: FACING, haze: 0.42 },
  ];

  /**
   * A dark vault and one shaft of light on the gold. Coins start to lift off
   * the hoard and turn, faster and faster, into a tower of spinning gold, until
   * it bursts up through the middle and the whole storm is thrown at the lens.
   */
  readonly entrance: Entrance = {
    seconds: 5.6,
    wipe: 4,
    wipeSeconds: 0.9,
    title: 0.74,
    light: [[0, 0.42], [0.3, 0.62], [ERUPT, 1], [1, 1]],
    beats: [
      { at: 0, until: ERUPT - 0.004, pose: BURIED, jaw: 0.02, sway: 0.02, wing: FOLDED, up: FACING },
      { at: ERUPT + 0.05, until: 0.6, pose: RAMPANT, jaw: 0.5, sway: 0.06, wing: OPENING, up: FACING, look: [0, 4, 24] },
      { at: 0.64, until: 0.84, pose: RAMPANT, jaw: 0.85, sway: 0.06, wing: SPREAD, up: FACING, look: [3, 14, 18] },
    ],
    takes: [
      // low over the hoard in the dark, as the first coins stir
      [
        { at: 0, pos: [-5, -6.2, 20], look: [1, -4, 0], fov: 40 },
        { at: 0.3, pos: [-3.6, -5.8, 17.5], look: [0.6, -2, 0], fov: 42 },
      ],
      // the whole tower of it, from down on the gold
      [
        { at: 0.3, pos: [-13, -6.9, 32], look: [0, 7, 0], fov: 50 },
        { at: ERUPT, pos: [-10, -6.9, 28], look: [0, 6, 0], fov: 54 },
      ],
      // up it comes, through the middle
      [
        { at: ERUPT, pos: [-8, -6.4, 22], look: [0, 3.6, 1], fov: 50, roll: 0.06 },
        { at: 0.64, pos: [-5, -6.8, 19], look: [0, 4.6, 1.6], fov: 52 },
        { at: 0.84, pos: [5, -6.2, 19], look: [0, 5.4, 2], fov: 52, roll: 0.05 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [0, -4, 25], look: [0, -3, 4], fov: 30 },
    { at: 0.2, pos: [-10, 1.4, 22], look: [0, 1.9, 7.8], fov: 30 },
    { at: 0.38, pos: [-8, 2, 21], look: [0.4, 2, 8], fov: 27 },
    { at: 0.54, pos: [-8, -6.2, 21], look: [0, 3.6, 1], fov: 44 },
    { at: 0.67, pos: [-3.4, -6.9, 18], look: [0, 5.2, 2], fov: 54 },
    { at: 0.82, pos: [5, -6.2, 19], look: [0, 5.4, 2], fov: 52, roll: 0.05 },
    { at: 1, pos: [-1, 1, 30], look: [2.6, 1.6, 0], fov: 36 },
  ];

  constructor() {
    super('aurum', 4, AURUM.length, 112, {
      keyDir: new Vector3(0.45, 0.75, 0.6),
      key: new Color(1.0, 0.86, 0.62).multiplyScalar(1.15),
      sky: new Color(0.35, 0.25, 0.12),
      ground: new Color(0.2, 0.1, 0.02),
      rim: new Color(1.0, 0.68, 0.25).multiplyScalar(0.28),
      envTop: new Color(0.42, 0.3, 0.16),
      envHorizon: new Color(0.2, 0.1, 0.025),
      envBottom: new Color(0.16, 0.08, 0.012),
    });
    this.spine.upRelax = 0.12;
    this.group.add(this.storm.mesh);
  }

  build(result: BlueprintResult) {
    const m = this.material(dragonVert, aurumFrag, {
      uLen: { value: AURUM.length },
      uGold: { value: new Color(1.0, 0.62, 0.16) },
      uGoldPale: { value: new Color(1.0, 0.76, 0.36) },
    });
    this.mesh(toGeometry(result.pack.main), m);
    const eyes = this.material(eyeVert, eyeFrag, {
      uEyeColor: { value: new Color(1.0, 0.2, 0.12) },
      uEyeColor2: { value: new Color(1.0, 0.75, 0.2) },
    });
    this.mesh(toGeometry(result.pack.eyes), eyes);
    const wingGeo = toGeometry(result.pack.wing);
    for (const side of [1, -1]) {
      const wm = this.material(
        wingVert,
        wingFrag,
        {
          uSide: { value: side },
          uWingS: { value: AURUM.shoulder },
          uWingRoot: { value: new Vector3(0.1, 0.42, 0.42) },
          uSpan: { value: 7.6 },
          uDihedral: { value: 0.15 },
          uPanels: { value: 6 },
          uTintA: { value: new Color(0.85, 0.42, 0.08) },
          uTintB: { value: new Color(1.0, 0.78, 0.35) },
        },
        { side: DoubleSide, defines: { GOLD: '' } },
      );
      this.mesh(wingGeo, wm);
    }
    this.ready = true;
  }

  override provoke(ctx: FrameContext, loud = true) {
    super.provoke(ctx, loud);
    this.onRoar?.();
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    if (this.beat(0.02, ctx)) {
      h?.voice('rise');
      h?.light(0.4);
    }
    // the hoard shifts, coin by coin, then war drums under it
    for (const at of [0.1, 0.17, 0.24, 0.31]) if (this.beat(at, ctx)) h?.voice('stir', at * 2);
    for (const [at, power] of DRUMS) {
      if (!this.beat(at, ctx)) continue;
      h?.voice('impact', power * 0.5);
      h?.quake(power * 0.5);
      h?.light(power * 0.6);
    }
    if (this.beat(ERUPT, ctx)) {
      h?.strobe(1);
      h?.shock(0.5, 0.3, 1.4);
      h?.quake(1);
      h?.light(1);
      h?.scatter();
      h?.voice('impact');
    }
    if (this.beat(0.52, ctx)) h?.voice('roar');
    if (this.beat(0.64, ctx)) {
      h?.shock(0.5, 0.6, 1);
      h?.strobe(0.5);
      h?.scatter();
    }
    this.offstage = t < ERUPT;
    const rise = smoothstep(0.08, 0.42, t);
    const speed = 0.5 + smoothstep(0.14, ERUPT, t) * 7;
    this.storm.update(rise, speed, t < ERUPT ? 0 : (t - ERUPT) * 6, ctx.time, ctx.dt);
  }

  /** The hoard answers it: the sun swells and coins fall out of the sky. */
  protected override onGesture(kind: Gesture) {
    if (kind === 'glance') return;
    this.stagehand?.light(0.75);
    if (kind === 'wings' || kind === 'roar') this.stagehand?.scatter();
    if (kind === 'roar') this.stagehand?.voice('roar');
  }

  protected act(ctx: FrameContext) {
    if (ctx.entry < 0) {
      this.offstage = false;
      this.storm.update(0, 0, 0, ctx.time, ctx.dt);
    }
    if (this.cue(0.64, ctx)) {
      this.stagehand?.voice('roar');
      this.stagehand?.shock(0.5, 0.74, 1.2);
      this.stagehand?.strobe(0.5);
      this.stagehand?.scatter();
    }
  }

  protected override legRest(i: number) {
    return i < 2 ? 0.25 : -0.25;
  }
}

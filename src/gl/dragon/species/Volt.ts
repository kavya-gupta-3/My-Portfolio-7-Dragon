import { Color, Vector3 } from 'three';
import { damp, smoothstep } from '../../../core/math';
import dragonVert from '../../shaders/dragon/dragon.vert.glsl';
import eyeFrag from '../../shaders/dragon/eye.frag.glsl';
import eyeVert from '../../shaders/dragon/eye.vert.glsl';
import voltFrag from '../../shaders/dragon/volt.frag.glsl';
import { Lightning } from '../../fx/Lightning';
import type { Beat, Entrance, P3, Pose, Shot } from '../../cinema/timeline';
import type { FrameContext } from '../../types';
import { VOLT, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';

const a = new Vector3();
const b = new Vector3();
const fork = new Vector3();
const right = new Vector3();
const up = new Vector3();
const ahead = new Vector3();

const BACK: P3 = [0, 0.5, 1];

/** Coiled in the storm, head out of the coil. */
const COIL: Pose = [[2.4, 6.6, 7.4], [2.2, 7.4, 5.4], [3.4, 7.8, 3], [5.6, 6.8, 0.4], [5.2, 5.4, -3.4], [1.4, 4.2, -6], [-3.6, 3, -5.8], [-6.2, 1.8, -2.2], [-4.6, 0.6, 1.8], [0.2, -0.6, 3.2], [4.8, -1.8, 1.2], [6, -3, -3], [3, -4.2, -6.4]];
/** Lunges from the coil, armour unlocking around the core. */
const LUNGE: Pose = [[0, 2, 16.6], [0.2, 2.7, 14.1], [0.6, 3.4, 11.4], [1.2, 4.4, 8.4], [2.4, 5, 5], [4.4, 5, 2], [5.4, 4.2, -1.6], [3, 3, -5], [-1.8, 1.8, -6], [-5.4, 0.6, -3], [-5, -0.6, 1.2], [-0.6, -1.8, 3.4], [4, -3, 1.6]];
/** Stretched across the back of the page like a power line. */
const SPAN: Pose = [[-9.4, 3.2, -6], [-7.6, 4, -7.4], [-5, 3.8, -8.6], [-2.4, 2.6, -9.4], [0.4, 1.4, -10], [3, 1.6, -10.6], [5.6, 3, -11.2], [8, 4, -12], [10.6, 3.6, -12.8], [13, 2, -13.6], [15.4, 0.8, -14.4], [18, 1, -15], [20, 2, -16]];

/**
 * 03 · VOLT — The Circuit Serpent. Armour plates around a naked energy core.
 * It coils out of the storm in a flash of lightning, then unlocks its plates
 * one ring at a time, every plate a skill.
 */
export class Volt extends Dragon {
  protected override bulk = 1.34;
  protected override neck = 4.2;
  protected override repertoire: Gesture[] = ['glance', 'rise', 'shake', 'flick', 'roar'];
  private thunderAt = 0;
  protected override chest = 2.6;
  protected override hazeColor = new Color(0.006, 0.014, 0.024);
  readonly lightning = new Lightning(18, 20, new Color(0.45, 0.9, 1.0));
  private arcTimer = 0;
  private burstPhase = 0;
  /** 0‥1 while the entrance holds the armour open. */
  private unlocked = 0;
  /**
   * Lightning has struck, this bright. It is only seen: the thunder belongs to
   * the big moments' own sounds, so a strike never stacks a clap on a roar.
   */
  onStrike: ((power: number) => void) | null = null;

  readonly throne: Throne = {
    at: 0,
    exit: [0.02, 0.35],
    narrow: { at: [-5, 6.55, 9], fit: 0.6 },
    away: [-1, 0.6, 0],
    jaw: 0.08,
    sway: 0.22,
    up: BACK,
    look: [9, 2, 15],
    pose: [[-14.8, 2.4, 2.4], [-16.2, 3.4, 0.6], [-18.4, 2.8, -1], [-19.6, 0.4, -2], [-18, -2, -2.4], [-15.4, -4, -2.6], [-14.4, -6.6, -1.8], [-16, -9.2, -0.6], [-19, -10.6, -1], [-21, -12, -3], [-22, -14, -5], [-23, -16, -7], [-24, -18, -9]],
  };

  readonly beats: Beat[] = [
    { at: 0, until: 0.5, pose: COIL, jaw: 0.05, sway: 0.2, up: BACK, look: [15, 6, 19] },
    { at: 0.68, until: 0.8, pose: LUNGE, jaw: 0.5, sway: 0.08, up: BACK },
    { at: 0.97, pose: SPAN, jaw: 0.05, sway: 0.34, haze: 0.42, up: BACK },
  ];

  /** Pitch dark. Each flash of lightning shows it closer, until one hits it. */
  readonly entrance: Entrance = {
    seconds: 4.2,
    wipe: 2,
    wipeSeconds: 0.5,
    title: 0.56,
    light: [[0, 0], [0.13, 0], [0.135, 1.1], [0.2, 0.08], [0.25, 0], [0.255, 1.1], [0.31, 0.06], [0.37, 0], [0.375, 1.2], [0.44, 0.05], [0.49, 0], [0.495, 1.5], [0.62, 1], [1, 1]],
    beats: [
      { at: 0, until: 0.49, pose: COIL, jaw: 0.04, sway: 0.2, up: BACK, look: [-2, 7, 26] },
      { at: 0.56, until: 0.82, pose: LUNGE, jaw: 0.85, sway: 0.08, up: BACK },
    ],
    takes: [
      [
        { at: 0, pos: [-16, -7, 46], look: [0, 3, 0], fov: 30 },
        { at: 0.25, pos: [-15, -6, 44], look: [0, 3, 0], fov: 30 },
      ],
      [
        { at: 0.25, pos: [13, 3, 26], look: [2, 5, 3], fov: 32 },
        { at: 0.37, pos: [12, 3.4, 24], look: [2, 5, 3], fov: 32 },
      ],
      [
        { at: 0.37, pos: [-4.4, 7.6, 16.6], look: [2.2, 7, 7.8], fov: 25 },
        { at: 0.49, pos: [-3.8, 7.5, 15.4], look: [2.2, 7, 7.8], fov: 25 },
      ],
      [
        { at: 0.49, pos: [-13, 4, 20], look: [1, 3.8, 8], fov: 44 },
        { at: 0.62, pos: [-12, 4, 19], look: [1, 3.8, 9], fov: 44 },
        { at: 0.82, pos: [-9.5, 2.6, 23], look: [0.6, 3, 11], fov: 40 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [-9, -8.5, 32], look: [0, 2, 0], fov: 38 },
    { at: 0.2, pos: [-5, 3.6, 25], look: [2, 5.4, 3], fov: 33 },
    { at: 0.36, pos: [-5.5, 7.4, 19], look: [2.6, 6.8, 7.2], fov: 27 },
    { at: 0.52, pos: [-7, 4.6, 19.5], look: [2.4, 6.4, 6.8], fov: 30 },
    { at: 0.68, pos: [-12, 4, 19], look: [1, 3.8, 9], fov: 42 },
    { at: 0.82, pos: [-9.5, 2.6, 23], look: [0.6, 3, 11], fov: 40 },
    { at: 1, pos: [0, 1, 32], look: [0, 1.6, -2], fov: 36 },
  ];

  constructor() {
    super('volt', 2, VOLT.length, 128, {
      keyDir: new Vector3(-0.3, 0.8, 0.5),
      key: new Color(0.75, 0.9, 1.0).multiplyScalar(1.8),
      sky: new Color(0.04, 0.08, 0.13),
      ground: new Color(0.0, 0.04, 0.07),
      rim: new Color(0.2, 0.8, 1.0).multiplyScalar(0.6),
      envTop: new Color(0.14, 0.24, 0.36),
      envHorizon: new Color(0.03, 0.08, 0.12),
      envBottom: new Color(0.0, 0.01, 0.02),
    }, 13);
    this.group.add(this.lightning.mesh);
  }

  build(result: BlueprintResult) {
    const m = this.material(dragonVert, voltFrag, {
      uVolt: { value: new Color(0.2, 0.85, 1.0) },
      uVolt2: { value: new Color(0.55, 0.42, 1.0) },
    });
    this.mesh(toGeometry(result.pack.main), m);
    const eyes = this.material(eyeVert, eyeFrag, {
      uEyeColor: { value: new Color(0.5, 0.95, 1.0) },
      uEyeColor2: { value: new Color(0.2, 0.4, 1.0) },
    });
    this.mesh(toGeometry(result.pack.eyes), eyes);
    this.ready = true;
  }

  private strike(count: number, flash = 0.9) {
    for (let i = 0; i < count; i++) {
      this.spine.sample(Math.random() * VOLT.length * 0.8, b);
      a.set(b.x + (Math.random() - 0.5) * 8, b.y + 22 + Math.random() * 6, b.z - 4);
      this.lightning.strike(a, b, { life: 0.45, width: 5, rough: 0.3 });
    }
    this.onStrike?.(flash);
  }

  override provoke(ctx: FrameContext, loud = true) {
    super.provoke(ctx, loud);
    // the storm answers: strikes from the sky onto the body
    this.strike(3, 0.9);
  }

  /** A forked strike far behind the dragon, always in frame: the whole sky answers it. */
  private thunder(ctx: FrameContext) {
    const cam = ctx.camera;
    const depth = 40 + Math.random() * 16;
    const tall = Math.tan((cam.fov * Math.PI) / 360) * depth;
    const wide = tall * ctx.aspect;
    const x = (Math.random() * 2 - 1) * wide * 0.85;
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    up.setFromMatrixColumn(cam.matrixWorld, 1);
    cam.getWorldDirection(ahead);
    a.copy(cam.position).addScaledVector(ahead, depth).addScaledVector(right, x).addScaledVector(up, tall * 1.2);
    b.copy(cam.position).addScaledVector(ahead, depth).addScaledVector(right, x + (Math.random() - 0.5) * wide * 0.4).addScaledVector(up, -tall * (0.2 + Math.random() * 0.7));
    this.lightning.strike(a, b, { life: 0.45, width: 5.5, rough: 0.28 });
    for (let i = 0; i < 2; i++) {
      a.lerp(b, 0.2 + Math.random() * 0.4);
      fork.copy(a).addScaledVector(right, (Math.random() - 0.5) * wide * 0.6).addScaledVector(up, -tall * (0.2 + Math.random() * 0.4));
      this.lightning.strike(a, fork, { life: 0.32, width: 2.6, rough: 0.34 });
    }
    this.stagehand?.light(0.9);
    // far away, so it lights the storm without blinding the reader
    this.onStrike?.(0.22);
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    if (this.beat(0.03, ctx)) h?.voice('rise');
    // three strikes in the dark, then the one that lands
    for (const at of [0.13, 0.25, 0.37]) {
      if (this.beat(at, ctx)) {
        this.thunder(ctx);
        h?.quake(0.25);
      }
    }
    if (this.beat(0.49, ctx)) {
      this.strike(7, 0.9);
      h?.strobe(1);
      h?.shock(0.5, 0.5, 1.3);
      h?.light(1);
      h?.quake(0.9);
      h?.voice('impact');
      h?.voice('roar');
    }
    if (this.beat(0.7, ctx)) this.strike(3, 0.3);
    this.uniforms.uEyeOpen.value = smoothstep(0.37, 0.4, t);
    this.unlocked = smoothstep(0.49, 0.55, t) * (1 - smoothstep(0.8, 0.95, t));
  }

  /** It stirs, and a charge runs down the armour while the sky lights up. */
  protected override onGesture(kind: Gesture, ctx: FrameContext) {
    if (kind === 'glance') return;
    this.thunder(ctx);
    if (kind === 'roar') {
      this.strike(3, 0.9);
      this.stagehand?.voice('roar');
    }
  }

  protected act(ctx: FrameContext) {
    const { time: t, dt, p } = ctx;
    const mine = ctx.scene === this.stage;
    if (this.cue(0.04, ctx)) this.strike(2, 0.9);
    if (this.cue(0.62, ctx)) {
      this.strike(4, 0.9);
      this.stagehand?.voice('roar');
    }
    if (this.cue(0.72, ctx)) this.stagehand?.shock(0.5, 0.5, 0.8);
    this.burstPhase += dt * 0.55;
    const surge = 0.35 + 1.65 * Math.pow(Math.max(0, Math.sin(this.burstPhase * Math.PI * 2)), 2);
    const u = this.uniforms;
    u.uFlow.value = damp(u.uFlow.value as number, surge, 4, dt);
    u.uOpen.value = ctx.entry >= 0 ? this.unlocked : mine ? smoothstep(0.58, 0.72, p) * (1 - smoothstep(0.84, 0.96, p)) : 0;

    // arcs between neighbouring plates
    this.arcTimer -= dt;
    while (this.arcTimer <= 0) {
      this.arcTimer += 0.07 + Math.random() * 0.12;
      const s0 = Math.random() * VOLT.length * 0.85;
      const r = VOLT.profile(s0 / VOLT.length) * 2.1;
      this.spine.sample(s0, a);
      this.spine.sample(s0 + 0.9 + Math.random() * 2.2, b);
      a.x += (Math.random() - 0.5) * r;
      a.y += (Math.random() - 0.2) * r;
      b.y += (Math.random() - 0.2) * r;
      b.z += (Math.random() - 0.5) * r;
      this.lightning.strike(a, b, { life: 0.16 + Math.random() * 0.14, width: 2.6 + this.rage * 3, rough: 0.4 });
    }
    // the storm never stops while it speaks: forked strikes behind it
    if (mine && t > this.thunderAt) {
      this.thunderAt = t + 1.5 + Math.random() * 3.2;
      this.thunder(ctx);
    }
    this.lightning.update(dt, t > 0 ? window.innerWidth : 1, window.innerHeight);
  }

  protected override legRest() {
    return 0.65;
  }
}

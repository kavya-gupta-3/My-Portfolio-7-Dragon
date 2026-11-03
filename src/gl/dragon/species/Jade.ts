import { Color, Vector3 } from 'three';
import { damp, smoothstep } from '../../../core/math';
import dragonVert from '../../shaders/dragon/dragon.vert.glsl';
import eyeFrag from '../../shaders/dragon/eye.frag.glsl';
import eyeVert from '../../shaders/dragon/eye.vert.glsl';
import jadeFrag from '../../shaders/dragon/jade.frag.glsl';
import { curve, type Beat, type Entrance, type Pose, type Shot } from '../../cinema/timeline';
import { Emitter, Kind } from '../../fx/Emitter';
import { Geode } from '../../fx/Geode';
import type { FrameContext } from '../../types';
import { GAP } from '../../Director';
import { JADE, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';

const p = new Vector3();
const v = new Vector3();
const shard = new Color(0.4, 1.0, 0.65);
/** Its heart, beating inside the stone: when, and how hard. */
const HEARTBEATS = [[0.13, 0.32], [0.25, 0.5], [0.38, 0.72], [0.47, 0.86], [0.53, 1]] as const;
/** The moment the stone gives way. */
const SHATTER = 0.56;
/** How far the cracks have spread. */
const CRACKS = [[0.1, 0], [0.26, 0.26], [0.4, 0.58], [0.54, 1]] as const;
/** The shards leave fast, hang in the air, then rush past the lens. */
const FLIGHT = [[SHATTER, 0], [0.585, 0.26], [0.7, 0.4], [0.88, 1.3]] as const;
/** How far along the body the crystals have caught. */
const CHAIN = [[SHATTER, 0], [0.72, 1.2], [1, 2]] as const;

/** Walking low through the crystal bed, seen from beside it. */
const PROWL: Pose = [[-8, -2.7, 2], [-6.4, -2.5, 1.6], [-4.6, -3.1, 1.2], [-2.6, -3.7, 0.8], [-0.4, -4, 0.4], [2, -4, 0], [4.4, -4.2, -0.4], [6.6, -4.6, -1], [8.6, -5.2, -2], [10.4, -6, -3.4], [12, -6.4, -5], [13.6, -6.6, -6.6]];
const PROWL_FAR: Pose = PROWL.map(([x, y, z]) => [x + 6.5, y, z]);
/** Curled up asleep inside the stone, nose to tail. */
const COILED: Pose = Array.from({ length: 12 }, (_, i) => {
  const a = 1.3 + i * 0.84;
  const r = 1.5 + i * 0.36;
  return [Math.cos(a) * r, 0.8 + Math.sin(a) * r * 0.9, 3 - i * 0.5];
});
/** Has stopped, and turned its head to you. */
const TURNED: Pose = [[-2.2, -1.4, 9.2], [-2.8, -0.8, 7.3], [-3.6, -1, 5.2], [-3.8, -2, 3], [-2.6, -3.4, 0.8], [-0.4, -4.2, -0.8], [2, -4.4, -1.4], [4.4, -4.6, -1.8], [6.6, -5, -2.4], [8.6, -5.6, -3.4], [10.4, -6.2, -4.8], [12, -6.6, -6.4]];
/** Rears up, every crystal blazing. */
const REARED: Pose = [[-1, 5.6, 4.6], [-1.6, 6.3, 2.6], [-2, 5.2, 0.8], [-2, 3, -0.4], [-1.4, 0.6, -1], [-0.2, -1.8, -1.4], [1.2, -3.8, -1.6], [3, -5, -1.6], [5, -5.8, -2], [7, -6.2, -2.8], [9, -6.6, -4], [11, -6.7, -5.4]];
/** Lies behind the work, watching over it. */
const WATCH: Pose = [[8, -0.6, -6], [9.6, 0.2, -7.2], [11.6, -0.4, -8], [13.6, -1.6, -8.6], [15.6, -2.8, -9], [17.6, -3.8, -9.4], [19.6, -4.6, -9.8], [21.6, -5.4, -10.2], [23.6, -6, -10.6], [25.6, -6.4, -11], [27.6, -6.6, -11.4], [29.6, -6.8, -11.8]];

/**
 * 04 · JADE — The Crystal Forgewyrm. The slow one. The camera tracks along
 * its crystal flank before it stops, turns and speaks; then it rears and
 * every crystal on its back lights up, one for each thing shipped.
 */
export class Jade extends Dragon {
  protected override bulk = 1.6;
  protected override neck = 3.6;
  protected override repertoire: Gesture[] = ['glance', 'dip', 'rise', 'flick', 'roar'];
  private flare = 0;
  private heart = 0;
  private readonly geode: Geode;
  protected override chest = 3.2;
  protected override hazeColor = new Color(0.003, 0.02, 0.014);
  readonly shards = new Emitter(400, { gravity: 3.5, drag: 0.6, turbulence: 1.5 });

  readonly throne: Throne = {
    at: 0,
    exit: [0.04, 0.37],
    narrow: { at: [5, 6.55, 9], fit: 0.6 },
    away: [1, 0.6, 0],
    jaw: 0.08,
    sway: 0.14,
    look: [-9, 1.6, 15],
    pose: [[14.4, 1.8, 2.8], [15.8, 2.6, 1.2], [17.6, 2.2, 0.2], [19.4, 0.8, -0.6], [21, -0.8, -1.2], [22.8, -2.4, -1.8], [24.6, -4, -2.4], [26.4, -5.4, -3], [28.2, -6.6, -3.6], [30, -7.6, -4.2], [32, -8.4, -5], [34, -9, -6]],
  };

  readonly beats: Beat[] = [
    { at: 0, pose: PROWL_FAR, jaw: 0.03, sway: 0.08, walk: 1 },
    { at: 0.2, pose: PROWL, jaw: 0.03, sway: 0.08, walk: 1 },
    { at: 0.34, until: 0.54, pose: TURNED, jaw: 0.05, sway: 0.1, look: [11, -1.2, 19] },
    { at: 0.68, until: 0.8, pose: REARED, jaw: 0.42, sway: 0.08, look: [9, 4, 22] },
    { at: 0.97, pose: WATCH, jaw: 0.04, sway: 0.14, haze: 0.46 },
  ];

  /**
   * Darkness, then a heartbeat of green. It is inside a crystal the size of a
   * house, and every beat cracks the stone a little further, until the whole
   * thing goes off in the viewer's face and it comes roaring through the shards.
   */
  readonly entrance: Entrance = {
    seconds: 5.4,
    wipe: 6,
    wipeSeconds: 0.5,
    title: 0.74,
    light: [[0, 0.3], [0.5, 0.55], [SHATTER, 1], [1, 1]],
    beats: [
      { at: 0, until: SHATTER - 0.001, pose: COILED, jaw: 0.02, sway: 0.03, look: [0, 1, 30] },
      { at: SHATTER, until: 0.78, pose: REARED, jaw: 0.95, sway: 0.08, look: [-4, 6, 24] },
    ],
    takes: [
      // pressed up against the stone, something moving behind it
      [
        { at: 0, pos: [-5.5, -2.2, 15.4], look: [2, 1.2, 0], fov: 40 },
        { at: 0.34, pos: [-2.6, -1.2, 14.2], look: [0.5, 0.8, 0], fov: 36 },
      ],
      // the whole thing, looming over the crystal bed
      [
        { at: 0.34, pos: [-16, -6.3, 26], look: [0, 2, 0], fov: 33 },
        { at: SHATTER, pos: [-12, -6.5, 22], look: [0, 2.6, 0], fov: 38 },
      ],
      // right in the blast
      [
        { at: SHATTER, pos: [-9, -6, 17], look: [-1, 3.6, 2], fov: 56, roll: -0.08 },
        { at: 0.74, pos: [-7, -6.2, 15], look: [-0.8, 4, 2], fov: 50, roll: -0.04 },
        { at: 0.84, pos: [-7, -4.8, 20], look: [0, 2.8, 1.6], fov: 44 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [3, -1.6, 7.6], look: [7, -2.6, -0.8], fov: 34 },
    { at: 0.14, pos: [-2.6, -1.6, 8.4], look: [-1, -2.4, 0], fov: 34 },
    { at: 0.26, pos: [-11.5, -2.8, 11], look: [-7, -2.2, 1.6], fov: 30 },
    { at: 0.42, pos: [-11, -0.6, 20], look: [-2, -1, 8.2], fov: 29 },
    { at: 0.55, pos: [-9.5, -1.8, 21], look: [-1.8, -0.8, 7.6], fov: 31 },
    { at: 0.72, pos: [-10, -5.6, 18], look: [-0.6, 2.6, 2], fov: 44, roll: -0.05 },
    { at: 0.84, pos: [-7, -4.6, 20], look: [0, 2.8, 1.6], fov: 42 },
    { at: 1, pos: [-3, 0, 30], look: [3, 0, -2], fov: 36 },
  ];

  constructor() {
    super('jade', 3, JADE.length, 112, {
      keyDir: new Vector3(0.5, 0.8, 0.35),
      key: new Color(0.85, 1.0, 0.9).multiplyScalar(1.15),
      sky: new Color(0.03, 0.16, 0.11),
      ground: new Color(0.0, 0.06, 0.04),
      rim: new Color(0.2, 1.0, 0.6).multiplyScalar(0.4),
      envTop: new Color(0.3, 0.6, 0.45),
      envHorizon: new Color(0.03, 0.15, 0.1),
      envBottom: new Color(0.0, 0.02, 0.015),
    });
    this.group.add(this.shards.points);
    this.geode = new Geode(new Vector3(0, 3 * GAP + 0.4, 0), new Color(0.02, 0.6, 0.3), new Color(0.6, 1.0, 0.75));
    this.group.add(this.geode.mesh);
  }

  build(result: BlueprintResult) {
    this.uniforms.uChain = { value: 2 };
    const m = this.material(dragonVert, jadeFrag, {
      uGem: { value: new Color(0.02, 0.6, 0.3) },
      uGemHi: { value: new Color(0.6, 1.0, 0.75) },
    });
    this.mesh(toGeometry(result.pack.main), m);
    const eyes = this.material(eyeVert, eyeFrag, {
      uEyeColor: { value: new Color(0.75, 1.0, 0.4) },
      uEyeColor2: { value: new Color(0.1, 0.8, 0.4) },
    });
    this.mesh(toGeometry(result.pack.eyes), eyes);
    this.ready = true;
  }

  private burst(n: number) {
    for (let i = 0; i < n; i++) {
      this.spine.sample(Math.random() * JADE.length, p);
      v.set((Math.random() - 0.5) * 9, Math.random() * 9 + 2, (Math.random() - 0.5) * 9);
      this.shards.spawn(p, v, shard, 1.6 + Math.random(), 0.25 + Math.random() * 0.35, Math.random() < 0.7 ? Kind.Shard : Kind.Glint);
    }
  }

  /** The stone goes: a storm of splinters from all over its surface. */
  private splinter(n: number) {
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.3).normalize();
      p.copy(v).multiplyScalar(7 + Math.random() * 2);
      p.y += 3 * GAP;
      v.multiplyScalar(18 + Math.random() * 26);
      this.shards.spawn(p, v, shard, 1.2 + Math.random() * 1.2, 0.3 + Math.random() * 0.6, Math.random() < 0.8 ? Kind.Shard : Kind.Glint);
    }
  }

  override provoke(ctx: FrameContext, loud = true) {
    super.provoke(ctx, loud);
    this.burst(120);
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    this.geode.mesh.visible = t < 0.9;
    if (this.beat(0.02, ctx)) h?.voice('rise');
    for (const [at, power] of HEARTBEATS) {
      if (!this.beat(at, ctx)) continue;
      this.heart = power;
      h?.voice('impact', power * 0.55);
      h?.light(power * 0.5);
      h?.quake(power * 0.45);
      if (power > 0.6) h?.shock(0.5, 0.45, power * 0.6);
      if (power > 0.8) this.burst(Math.round(60 * power));
    }
    if (this.beat(SHATTER, ctx)) {
      this.heart = 0;
      this.jump();
      h?.strobe(1);
      h?.shock(0.5, 0.5, 1.4);
      h?.light(1);
      h?.quake(1);
      h?.scatter();
      h?.voice('impact');
      h?.voice('roar');
      this.splinter(280);
    }
    this.heart = Math.max(0, this.heart - ctx.dt * 2.6);
    this.geode.set(this.heart, curve(CRACKS, t), t < SHATTER ? 0 : curve(FLIGHT, t), 1 - smoothstep(0.82, 0.9, t));
    // it lights up from the head back, one crystal after another
    this.uniforms.uChain.value = curve(CHAIN, t);
    this.flare = Math.max(this.flare, smoothstep(SHATTER, 0.59, t) * (1 - smoothstep(0.84, 0.97, t)));
    if (this.beat(0.8, ctx)) {
      h?.shock(0.5, 0.7, 0.7);
      h?.quake(0.5);
      h?.voice('impact', 0.5);
      this.burst(60);
    }
  }

  /** The crystals answer it: a glow runs along them and the aurora swells. */
  protected override onGesture(kind: Gesture) {
    if (kind === 'glance') return;
    this.flare = 1;
    this.burst(kind === 'roar' ? 90 : 34);
    this.stagehand?.light(0.7);
    if (kind === 'roar') this.stagehand?.voice('roar');
  }

  protected act(ctx: FrameContext) {
    const { dt, p: progress } = ctx;
    if (this.cue(0.68, ctx)) {
      this.stagehand?.voice('roar');
      this.stagehand?.shock(0.5, 0.6, 0.7);
      this.stagehand?.scatter();
      this.burst(160);
    }
    const t = ctx.time;
    const u = this.uniforms;
    if (ctx.entry < 0) {
      this.geode.mesh.visible = false;
      u.uChain.value = 2;
    }
    const blaze = ctx.scene === this.stage ? smoothstep(0.6, 0.7, progress) * (1 - smoothstep(0.86, 0.96, progress)) : 0;
    this.flare = Math.max(0, this.flare - dt * 0.9);
    u.uHeat.value = Math.max(blaze, this.rage, this.flare * 0.8);
    u.uFlow.value = damp(u.uFlow.value as number, 0, 2, dt);
    // a slow trickle of glints off the crystals
    if (Math.random() < dt * 10) {
      this.spine.sample(Math.random() * JADE.length * 0.9, p);
      p.y += 0.8;
      v.set((Math.random() - 0.5) * 0.6, 0.6 + Math.random(), (Math.random() - 0.5) * 0.6);
      this.shards.spawn(p, v, shard, 2.2, 0.35, Kind.Glint);
    }
    this.shards.update(dt, t, ctx.pixelRatio);
  }

  protected override legRest(i: number) {
    return i < 2 ? 0.1 : 0.15;
  }
}

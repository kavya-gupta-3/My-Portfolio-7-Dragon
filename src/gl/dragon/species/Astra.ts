import { AdditiveBlending, Color, DoubleSide, LineSegments, Points, Vector3 } from 'three';
import { clamp, damp, smoothstep } from '../../../core/math';
import astraSource from '../../shaders/dragon/astra.glsl';
import skinFrag from '../../shaders/dragon/astraskin.frag.glsl';
import dragonVert from '../../shaders/dragon/dragon.vert.glsl';
import eyeFrag from '../../shaders/dragon/eye.frag.glsl';
import eyeVert from '../../shaders/dragon/eye.vert.glsl';
import wingFrag from '../../shaders/dragon/wing.frag.glsl';
import wingVert from '../../shaders/dragon/wing.vert.glsl';
import { Emitter, Kind } from '../../fx/Emitter';
import type { Beat, Entrance, P3, Pose, Shot, Wing } from '../../cinema/timeline';
import type { FrameContext } from '../../types';
import { ASTRA, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';

const p = new Vector3();
const v = new Vector3();
const dust = new Color(0.8, 0.6, 1.0);
const FACING: P3 = [0, 0.35, -1];
/** Back to the lens: the constellation is drawn on the sky from above. */
const SKYWARD: P3 = [0, 0.25, 1];
const GLIDE: Wing = [0.1, 0.34, 1.4, 0.1, -0.2];
const WIDE: Wing = [0.3, 0.14, 1.1, -0.42, -0.1];
/** Folded back along the body: on a phone, Aurum's spread wings crown the line-up. */
const TUCKED: Wing = [0.2, 0.05, 1, 1.1, 0];
/** Laid flat on the star map, nearly still. */
const CHARTED: Wing = [0.1, 0.03, 0.6, 0.35, 0];
/** Thrown open as it tears free: big, fast beats. */
const BLOOM: Wing = [0.42, 0.42, 3.2, -0.45, -0.3];

function program(kind: 'BODY' | 'WING' | 'LINES') {
  return {
    vertexShader: `#define VERTEX\n#define ${kind}\n${astraSource}`,
    fragmentShader: `#define ${kind}\n${astraSource}`,
  };
}

/** A great arc through the sky, head coming toward you. */
const ARC: Pose = [[-2, 4, 9], [-3.2, 4.6, 7.1], [-5, 4.6, 5.2], [-6.4, 3.4, 2.8], [-6.4, 1.8, 0], [-5, 0.6, -2.6], [-2.6, -0.2, -4.6], [0.6, -0.8, -5.6], [3.8, -1.4, -4.8], [6, -2, -2.6], [6.8, -3, 0.4], [6, -4, 3.2]];
/** Standing on nothing, reaching for the top of the sky. */
const ASCENT: Pose = [[0, 12, 3.6], [0, 12.9, 1.8], [0.4, 11.7, 0], [0.4, 9.4, -1.2], [0, 7, -1.6], [-0.8, 4.6, -1], [-2.4, 2.6, 0.2], [-4.4, 1.6, 2], [-6.2, 0.2, 3], [-7.4, -2, 3], [-7, -4.6, 1.8], [-5, -6.4, 0.6]];
/** High above the page, far away. */
const HIGH: Pose = [[-9, 6.4, -7], [-10.4, 7.2, -8.4], [-12.4, 7, -9.6], [-13.8, 5.4, -10.6], [-13.4, 3, -11.4], [-11, 1.4, -12], [-8, 1.2, -12.6], [-5, 2.4, -13.2], [-3, 4.6, -13.8], [-2.6, 7, -14.4], [-4, 9, -15], [-6.6, 10, -15.6]];
/** Laid out across the sky like a figure on a star chart, facing left. */
const STARMAP: Pose = [[-7.5, 8.2, -6], [-5.4, 9.2, -6.2], [-3, 9, -6.4], [-0.8, 7.6, -6.6], [1, 5.6, -6.6], [3.2, 4.4, -6.4], [5.8, 4.4, -6.2], [8, 5.6, -6], [9.6, 7.6, -5.8], [10.2, 10, -5.6], [9.6, 12.4, -5.4], [8, 14, -5.2]];
/** Torn off the chart: the head lunges out at the lens, the body still drawn on the sky behind. */
const LUNGE: Pose = [[-3.4, 6.4, 7], [-4.6, 7.6, 5.2], [-5.6, 8.4, 3.2], [-5.8, 8.4, 0.8], [-4.8, 7.4, -1.6], [-2.6, 6.2, -3.4], [0.2, 5.6, -4.6], [3, 6.2, -5.2], [5.4, 7.8, -5.4], [6.8, 10, -5.4], [7, 12.4, -5.2], [6.2, 14.4, -5]];

/** The storm: when the first star falls and when the last one lands. */
const STORM = [0.08, 0.42] as const;
/** Strikes ring out through the storm, each a little higher. */
const STRIKES = [[0.13, 0.1], [0.18, 0.25], [0.22, 0.4], [0.26, 0.5], [0.3, 0.65], [0.33, 0.8], [0.36, 0.9], [0.39, 1]] as const;
/** The lines draw in, tail to head; the eyes open where they end. */
const LINK = [0.34, 0.46] as const;
/** Then the hide and the wings come in over the stars, head to tail. */
const IGNITE = [0.46, 0.56] as const;
/** It tears itself off the chart, lunges at you, rears, and roars as its name lands. */
const BURST = 0.56;
const ROAR = 0.71;

/**
 * 06 · ASTRA — The Star-Born. The film opens on an empty sky and the stars
 * find their places one by one until there is a dragon there. It climbs
 * as it talks about what Kavya is climbing toward.
 */
export class Astra extends Dragon {
  protected override bulk = 1.42;
  protected override neck = 4;
  protected override repertoire: Gesture[] = ['glance', 'rise', 'wings', 'flick', 'dip'];
  protected override chest = 3.4;
  protected override hazeColor = new Color(0, 0, 0);
  readonly dust = new Emitter(900, { gravity: -0.15, drag: 0.4, turbulence: 0.8 });
  /** The hide and wings can come in after the stars. */
  private readonly solid = { value: 1 };
  /** Stardust still owed to the storm and to the wake, a fraction at a time. */
  private sparks = 0;
  private wake = 0;

  readonly throne: Throne = {
    at: 0,
    exit: [0.08, 0.4],
    away: [-0.7, 1, -0.3],
    narrow: { at: [-4.45, 10.9, -0.6], fit: 0.6, wing: TUCKED },
    jaw: 0.1,
    sway: 0.2,
    up: FACING,
    wing: WIDE,
    look: [8, 3, 15],
    pose: [[-12.6, 8.6, -0.6], [-13.2, 9.5, -2.4], [-13.6, 8.9, -4.2], [-13.8, 6.9, -5.4], [-13.8, 4.5, -5.8], [-13.8, 2.2, -5.8], [-14, 0, -5.6], [-15.2, -1.8, -4.8], [-17.2, -2.8, -4], [-19, -4.4, -3.6], [-20, -6.6, -3.4], [-20.4, -9, -3.4]],
  };

  readonly beats: Beat[] = [
    { at: 0, until: 0.28, pose: ARC, jaw: 0.08, sway: 0.2, wing: GLIDE, look: [12, 4, 19] },
    { at: 0.42, until: 0.48, pose: ASCENT, jaw: 0.1, sway: 0.16, wing: WIDE, up: FACING },
    { at: 0.82, until: 0.86, pose: ASCENT, jaw: 0.08, sway: 0.2, wing: WIDE, up: FACING },
    { at: 0.98, pose: HIGH, jaw: 0.06, sway: 0.3, wing: GLIDE, haze: 0.38 },
  ];

  /**
   * A meteor storm. Shooting stars rain out of the dark onto one patch of
   * sky, and every one lights a star where it lands, until a constellation
   * hangs there. Its lines draw themselves in, tail to head, the eyes open,
   * and a hide and wings come in over the stars. Then the dragon tears itself
   * off the star chart in one beat of its wings, lunges at the lens in a wake
   * of stardust, rears, and roars as its name lands.
   */
  readonly entrance: Entrance = {
    seconds: 6.2,
    wipe: 5,
    wipeSeconds: 0.9,
    title: ROAR,
    light: [[0, 0.45], [STORM[0], 0.5], [STORM[1], 0.75], [IGNITE[1], 1], [1, 1]],
    beats: [
      { at: 0, until: BURST, pose: STARMAP, jaw: 0.02, sway: 0.05, wing: CHARTED, up: SKYWARD, look: [-40, 9, -6] },
      { at: 0.63, pose: LUNGE, jaw: 0.5, sway: 0.08, wing: BLOOM, up: [0, 1, 0.3] },
      { at: ROAR, until: 0.84, pose: ASCENT, jaw: 0.9, sway: 0.1, wing: WIDE, up: FACING },
    ],
    takes: [
      // from far below, the storm raining down on one patch of sky
      [
        { at: 0, pos: [3, -9, 33], look: [-1, 6.5, -6], fov: 46, roll: -0.06 },
        { at: 0.26, pos: [1.5, -6.5, 27], look: [-1.5, 7, -6], fov: 42, roll: 0.02 },
      ],
      // along the constellation as its lines draw in, to the eyes, then back to see it take on a body
      [
        { at: 0.26, pos: [11, 0.5, 9], look: [4.5, 5.2, -6], fov: 44, roll: 0.06 },
        { at: LINK[1], pos: [-4.5, 5.5, 8.5], look: [-8, 8.4, -6], fov: 36, roll: -0.04 },
        { at: BURST, pos: [-1, 3, 20], look: [0.5, 8.4, -6], fov: 46 },
      ],
      // it tears free, lunges at the lens and rears up roaring
      [
        { at: BURST, pos: [4, 0, 26], look: [-2, 7.4, -2], fov: 50, roll: -0.04 },
        { at: 0.64, pos: [2, -2, 21.5], look: [-2.6, 7.2, 3], fov: 56 },
        { at: ROAR, pos: [-8, -6, 19], look: [0, 8.5, 1.5], fov: 54, roll: 0.08 },
        { at: 0.86, pos: [-6, -6.5, 17], look: [0, 9.5, 1.6], fov: 52, roll: -0.04 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [0, -1, 30], look: [-1, 3, 2], fov: 38 },
    { at: 0.14, pos: [-12, 4, 23], look: [-2, 4, 7.6], fov: 30 },
    { at: 0.28, pos: [-11, 5.4, 19.5], look: [-1.6, 3.9, 8.4], fov: 28 },
    { at: 0.46, pos: [-12, -7, 21], look: [0, 6.4, 0], fov: 48, roll: 0.14 },
    { at: 0.64, pos: [-4, -9, 15.5], look: [0, 10.6, 1.6], fov: 58, roll: -0.08 },
    { at: 0.82, pos: [5, 12, 13], look: [0, 12, 3.4], fov: 34 },
    { at: 1, pos: [3, 2, 30], look: [-3, 3, 0], fov: 38 },
  ];

  constructor() {
    super('astra', 5, ASTRA.length, 112, {
      keyDir: new Vector3(0.35, 0.8, 0.5),
      key: new Color(0.7, 0.76, 1.0).multiplyScalar(1.3),
      sky: new Color(0.22, 0.15, 0.42),
      ground: new Color(0.1, 0.05, 0.2),
      rim: new Color(0.62, 0.36, 1.0).multiplyScalar(0.75),
      envTop: new Color(0.3, 0.25, 0.55),
      envHorizon: new Color(0.13, 0.07, 0.27),
      envBottom: new Color(0.04, 0.02, 0.09),
    });
    this.uniforms.uPixelRatio = { value: 1 };
    this.uniforms.uSize = { value: 1 };
    this.uniforms.uStarA = { value: new Color(0.62, 0.38, 1.0) };
    this.uniforms.uStarB = { value: new Color(1.0, 0.45, 0.85) };
    this.uniforms.uStarC = { value: new Color(0.85, 0.95, 1.0) };
    this.uniforms.uFall = { value: 0 };
    this.uniforms.uLink = { value: 1 };
    this.uniforms.uView = { value: 1080 };
    this.group.add(this.dust.points);
  }

  build(result: BlueprintResult) {
    const additive = { blending: AdditiveBlending, depthWrite: false, transparent: true };
    const skin = this.material(dragonVert, skinFrag, {
      uReveal: this.solid,
      uLen: { value: ASTRA.length },
      uDeep: { value: new Color(0.05, 0.03, 0.14) },
      uGlowA: { value: new Color(0.5, 0.3, 1.0) },
      uGlowB: { value: new Color(1.0, 0.42, 0.85) },
    });
    this.mesh(toGeometry(result.pack.main), skin);
    const eyes = this.material(eyeVert, eyeFrag, {
      uEyeColor: { value: new Color(0.9, 0.86, 1.0) },
      uEyeColor2: { value: new Color(0.6, 0.3, 1.0) },
    });
    this.mesh(toGeometry(result.pack.eyes), eyes);
    const body = this.material(program('BODY').vertexShader, program('BODY').fragmentShader, {}, additive);
    this.add(new Points(toGeometry(result.pack.body), body));
    const skinGeo = toGeometry(result.pack.wingSkin);
    const wingGeo = toGeometry(result.pack.wing);
    for (const side of [1, -1]) {
      const membrane = this.material(
        wingVert,
        wingFrag,
        {
          uReveal: this.solid,
          uSide: { value: side },
          uWingS: { value: ASTRA.shoulder },
          uWingRoot: { value: new Vector3(0, 0.35, 0.35) },
          uSpan: { value: 7 },
          uDihedral: { value: 0.25 },
          uPanels: { value: 6 },
          uTintA: { value: new Color(0.45, 0.28, 1.0) },
          uTintB: { value: new Color(1.0, 0.45, 0.85) },
        },
        { side: DoubleSide, defines: { STARS: '' } },
      );
      this.mesh(skinGeo, membrane);
      const wm = this.material(
        program('WING').vertexShader,
        program('WING').fragmentShader,
        {
          uSide: { value: side },
          uWingS: { value: ASTRA.shoulder },
          uWingRoot: { value: new Vector3(0, 0.35, 0.35) },
          uSpan: { value: 7 },
          uDihedral: { value: 0.25 },
        },
        additive,
      );
      this.add(new Points(wingGeo, wm));
    }
    const lines = this.material(program('LINES').vertexShader, program('LINES').fragmentShader, {}, additive);
    this.add(new LineSegments(toGeometry(result.pack.lines), lines));
    this.ready = true;
  }

  override provoke(ctx: FrameContext, loud = true) {
    super.provoke(ctx, loud);
    for (let i = 0; i < 160; i++) {
      this.spine.sample(Math.random() * ASTRA.length, p);
      v.set((Math.random() - 0.5) * 6, (Math.random() - 0.3) * 6, (Math.random() - 0.5) * 6);
      this.dust.spawn(p, v, dust, 2 + Math.random() * 2, 0.2 + Math.random() * 0.3, Math.random() < 0.3 ? Kind.Glint : Kind.Dust);
    }
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    const u = this.uniforms;
    if (this.beat(0.02, ctx)) h?.voice('rise');
    // the sky splits: one shooting star, then the storm breaks
    if (this.beat(0.05, ctx)) h?.meteor();
    if (this.beat(STORM[0], ctx)) {
      h?.meteor();
      h?.strobe(0.25);
      h?.shock(0.6, 0.85, 0.5);
      h?.light(0.6);
      h?.quake(0.2);
    }
    for (const [at, power] of STRIKES) {
      if (!this.beat(at, ctx)) continue;
      h?.voice('stir', power);
      h?.light(0.25 + power * 0.4);
      h?.quake(power * 0.15);
      if (power > 0.45) h?.meteor();
    }
    if (this.beat(LINK[1], ctx)) {
      // the last line reaches the head, and the eyes open
      h?.voice('stir', 1);
      h?.light(0.7);
    }
    if (this.beat(IGNITE[0] + 0.02, ctx)) h?.voice('rise');
    if (this.beat(BURST, ctx)) {
      // it tears itself off the star chart in one beat of its wings
      this.spine.sample(0, p);
      this.onScreen(p, ctx);
      h?.strobe(0.25);
      h?.shock(p.x, p.y, 0.9);
      h?.light(1);
      h?.quake(0.6);
      h?.voice('impact');
      h?.voice('flap');
      this.scatterDust(240, 9, 0.5);
    }
    if (this.beat(0.63, ctx)) h?.voice('flap');
    if (this.beat(ROAR, ctx)) {
      this.mouthAt(p, 1.2, 0.1);
      this.onScreen(p, ctx);
      h?.voice('roar');
      h?.strobe(0.3);
      h?.shock(p.x, p.y, 1.1);
      h?.light(1);
      h?.quake(0.7);
      h?.meteor();
      this.scatterDust(160, 7, 0.4);
    }
    // stars first, falling into place; then the lines; then a body, head first
    this.solid.value = smoothstep(IGNITE[0], IGNITE[1], t);
    // the hide stays a dissolve until it is whole: a star map at 1 would show it all at once
    u.uReveal.value = this.solid.value < 1 ? Math.min(smoothstep(STORM[0], STORM[1], t), 0.9999) : 1;
    u.uFall.value = 1 - smoothstep(LINK[1], IGNITE[1], t);
    u.uLink.value = smoothstep(LINK[0], LINK[1], t);
    u.uEyeOpen.value = smoothstep(LINK[1], LINK[1] + 0.03, t);
    // until its eyes open it is a picture on the sky: a tall screen keeps the picture, not the head
    this.offstage = t < LINK[1];
    u.uView.value = window.innerHeight * ctx.pixelRatio;
    // where the strikes land the body throws off sparks
    const storm = Math.sin(Math.PI * clamp((t - STORM[0]) / (STORM[1] - STORM[0])));
    this.sparks += ctx.dt * storm * 70;
    for (; this.sparks >= 1; this.sparks--) {
      this.spine.sample(Math.random() * ASTRA.length, p);
      const size = p.distanceTo(ctx.camera.position) * 0.035;
      v.set((Math.random() - 0.5) * 3, Math.random() * 2.4, (Math.random() - 0.5) * 3);
      this.dust.spawn(p, v, dust, 0.5 + Math.random() * 0.5, size * (0.6 + Math.random() * 0.6), Kind.Glint);
    }
    // a wake of stardust off the tail and wings as it lunges and rears
    this.wake += ctx.dt * smoothstep(BURST, BURST + 0.03, t) * (1 - smoothstep(0.76, 0.82, t)) * 280;
    for (; this.wake >= 1; this.wake--) {
      this.spine.sample(ASTRA.length * (0.2 + Math.random() * 0.8), p);
      v.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2);
      this.dust.spawn(p, v, dust, 1.2 + Math.random() * 1.2, 0.25 + Math.random() * 0.35, Math.random() < 0.4 ? Kind.Glint : Kind.Dust);
    }
  }

  /** Where a world point falls on the screen (0‥1, from the bottom left), into `p`. */
  private onScreen(at: Vector3, ctx: FrameContext) {
    p.copy(at).project(ctx.camera);
    p.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5, 0);
  }

  /** The sky answers it: a shooting star, and the nebula brightens. */
  protected override onGesture(kind: Gesture) {
    if (kind === 'glance') return;
    this.stagehand?.meteor();
    this.stagehand?.light(0.55);
    if (kind === 'wings') this.stagehand?.voice('stir', 0.8);
    this.scatterDust(40, 4);
  }

  private scatterDust(count: number, speed: number, size = 0.2) {
    for (let i = 0; i < count; i++) {
      this.spine.sample(Math.random() * ASTRA.length, p);
      v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.7, (Math.random() - 0.5) * speed);
      this.dust.spawn(p, v, dust, 1.6 + Math.random(), size + Math.random() * 0.25, Kind.Glint);
    }
  }

  protected act(ctx: FrameContext) {
    const { time: t, dt } = ctx;
    const u = this.uniforms;
    if (this.cue(0.44, ctx)) {
      this.stagehand?.voice('stir', 1);
      this.stagehand?.strobe(0.3);
    }
    // the constellation assembles out of an empty sky
    if (ctx.entry < 0) {
      if (ctx.scene === this.stage) {
        u.uReveal.value = clamp((ctx.p + 0.02) / 0.15);
        // the eyes are the last stars to find their place
        u.uEyeOpen.value = (u.uEyeOpen.value as number) * smoothstep(0.8, 1, u.uReveal.value);
      }
      this.solid.value = u.uReveal.value as number;
      u.uFall.value = 0;
      u.uLink.value = 1;
      this.offstage = false;
    }
    u.uPixelRatio.value = ctx.pixelRatio;
    u.uSize.value = ctx.aspect < 1 ? 0.8 : 1;
    u.uFlow.value = damp(u.uFlow.value as number, 0, 2, dt);
    // stardust shed from the tail
    if (Math.random() < dt * 26) {
      this.spine.sample(ASTRA.length * (0.6 + Math.random() * 0.4), p);
      v.set((Math.random() - 0.5) * 0.5, -0.3 - Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
      this.dust.spawn(p, v, dust, 2.5, 0.18 + Math.random() * 0.2, Kind.Dust);
    }
    this.dust.update(dt, t, ctx.pixelRatio);
  }
}

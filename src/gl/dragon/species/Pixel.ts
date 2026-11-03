import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Points, Sphere, Vector3, Vector4 } from 'three';
import { clamp, damp, mulberry32, smoothstep } from '../../../core/math';
import voxelFrag from '../../shaders/dragon/voxel.frag.glsl';
import voxelVert from '../../shaders/dragon/voxel.vert.glsl';
import swarmSource from '../../shaders/dragon/swarm.glsl';
import { Beam } from '../../fx/Beam';
import { Emitter, Kind } from '../../fx/Emitter';
import { GAP } from '../../Director';
import type { Beat, Entrance, P3, Pose, Shot, Wing } from '../../cinema/timeline';
import type { FrameContext } from '../../types';
import { PIXEL, type BlueprintResult } from '../blueprints';
import { Dragon, type Gesture, type Throne } from '../Dragon';
import { toGeometry } from '../geometry';
import { headInfo } from '../heads';

/** One palette per hobby level: gaming, food, music, imagination, talking. */
export const HOBBY_PALETTES: [string, string][] = [
  ['#ff2bd6', '#2bf0ff'],
  ['#ff6a14', '#ffd23f'],
  ['#8a5bff', '#ff4fa3'],
  ['#20ffc8', '#4f7bff'],
  ['#ff5fa8', '#ffe6f3'],
];

const a = new Vector3();
const b = new Vector3();
const v = new Vector3();
/** How far from the pointer's line the body starts to feel it. */
const FEEL = 3.2;
/** Cube pixels that orbit the body, per unit of quality. */
const SWARM = 900;

const BACK: P3 = [0, 0.5, 1];
const FLY: Wing = [0.2, 0.42, 2.8, 0, 0];
const FAST: Wing = [0.1, 0.6, 5, 0, 0];

/** Face to face, boss-fight framing. */
const BOSS: Pose = [[0, 2.2, 7.4], [0.6, 3, 5.5], [1.9, 3, 3.6], [2.9, 1.8, 1.7], [2, 0.2, 0], [-0.2, -1, -1.6], [-2.6, -1, -3.2], [-4, 0.4, -5], [-3.4, 2.2, -6.8], [-1, 3, -8.4], [1.6, 2.4, -10], [3, 1, -12]];
/** Looping the loop. */
const LOOP: Pose = [[-4, 6.6, 4.4], [-5.8, 5.9, 2.8], [-6.8, 3.8, 1.7], [-5.8, 1.6, 0.8], [-3.2, 0.8, 0.2], [-0.6, 1.6, -0.4], [1.4, 3.6, -1.2], [0.8, 6, -2], [-1.6, 7.2, -2.8], [-4.4, 6.8, -3.8], [-7, 5, -5], [-9, 3, -6.6]];
/** Skimming the grid, toward the lens. */
const SKIM: Pose = [[6.4, -3.4, 7.6], [5.4, -2.9, 5.6], [3.6, -2.5, 3.8], [1.4, -2.6, 2], [-1, -3.2, 0.2], [-3.4, -3, -1.4], [-5.4, -1.8, -3], [-6.4, 0, -4.8], [-6, 2, -6.6], [-4.4, 3.4, -8.4], [-2, 4, -10], [0.4, 4, -12]];
/** The arcade counts it in, then the cubes rain down out of a beam, tail first. */
const COUNT = [[0.1, '3'], [0.18, '2'], [0.26, '1'], [0.33, 'GO']] as const;
const BUILD = [0.34, 0.6] as const;

/** Patrols the right of the page. */
const PATROL: Pose = [[8.4, 1.2, -4], [9.6, 2.2, -5.4], [11.6, 2.2, -6.4], [13, 0.6, -7.4], [12, -1.6, -8.2], [9.6, -2.4, -9], [7, -1.2, -10], [5.6, 1, -11], [6, 3.2, -12], [8, 4.8, -13], [10.6, 5.2, -14], [13, 4.2, -15]];

/**
 * 02 · PIXEL — The Prism Wyrm, thousands of instanced cubes. It assembles
 * itself out of a burst of voxels like a boss loading in, then changes
 * colour for every obsession it talks about.
 */
export class Pixel extends Dragon {
  protected override bulk = 1.26;
  protected override neck = 3.6;
  protected override repertoire: Gesture[] = ['glance', 'rise', 'shake', 'flick', 'wings', 'roar'];
  private ripple = 0;
  protected override chest = 3;
  protected override hazeColor = new Color(0.012, 0.004, 0.03);
  private readonly colA = new Color(HOBBY_PALETTES[0][0]);
  private readonly colB = new Color(HOBBY_PALETTES[0][1]);
  private readonly targetA = new Color();
  private readonly targetB = new Color();
  private level = -1;
  private changedAt = -10;
  /** Where the pointer has been on the body lately: newest first, fading. */
  private readonly touches = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];
  private touchEvery = 0;
  private readonly lastTouch = new Vector3();
  private readonly sparks = new Emitter(420, { gravity: 11, drag: 1.1, turbulence: 0 });
  /** The pointer is playing the arcade: 0 is low on the screen, 1 high. */
  onStir: ((height: number) => void) | null = null;
  /** Which palette it flashes while the arcade counts it in. */
  private flashing = 0;
  private readonly beam = new Beam(new Color(1.0, 0.5, 0.95), 5.6, 70, 160);
  private readonly beamBase = new Vector3(0, GAP - 7.5, 2);

  readonly throne: Throne = {
    at: 0,
    exit: [0.14, 0.46],
    away: [0.8, -0.2, 0.6],
    narrow: { at: [2, 5, 7], fit: 0.6, wing: [-0.9, 0.08, 2, 0, 0] },
    jaw: 0.14,
    sway: 0.24,
    up: BACK,
    wing: [0.62, 0.3, 2.4, 0, 0],
    look: [-9, 1.4, 18],
    pose: [[6.4, 2.8, 8.6], [7.5, 3.7, 6.9], [9.3, 3.4, 5.4], [10.3, 1.4, 4.4], [9.3, -1, 4.4], [7.6, -3.6, 4], [8, -6.4, 2.4], [10, -9, 0.6], [12, -11, -1], [14, -12, -2], [16, -13, -3], [18, -14, -4]],
  };

  readonly beats: Beat[] = [
    { at: 0, until: 0.42, pose: BOSS, jaw: 0.1, sway: 0.2, wing: FLY, up: BACK, look: [14, 3, 19] },
    { at: 0.52, until: 0.56, pose: LOOP, jaw: 0.3, sway: 0.2, wing: FAST, up: BACK },
    { at: 0.72, until: 0.84, pose: SKIM, jaw: 0.2, sway: 0.16, wing: FLY, look: [14, -2, 19] },
    { at: 0.98, pose: PATROL, jaw: 0.1, sway: 0.34, haze: 0.45, wing: FLY },
  ];

  /**
   * An arcade boss coming in: the screen counts down, a beam hits the grid and
   * the dragon is built inside it, cube by cube, from the tip of its tail to
   * its eyes. Then the warning, the roar, and a loop around the camera.
   */
  readonly entrance: Entrance = {
    seconds: 5.4,
    wipe: 1,
    wipeSeconds: 0.6,
    title: 0.76,
    light: [[0, 0.55], [BUILD[0], 0.62], [BUILD[1], 1], [1, 1]],
    beats: [
      { at: 0, until: 0.64, pose: BOSS, jaw: 0.08, sway: 0.12, wing: FLY, up: BACK },
      { at: 0.72, until: 0.74, pose: LOOP, jaw: 0.6, sway: 0.2, wing: FAST, up: BACK },
      { at: 0.86, until: 0.88, pose: BOSS, jaw: 0.75, sway: 0.2, wing: FLY, up: BACK },
    ],
    takes: [
      // down on the grid, looking up the lane it will come down
      [
        { at: 0, pos: [0, -5.2, 36], look: [0, 1, 0], fov: 40 },
        { at: BUILD[0], pos: [0, -4.4, 31], look: [0, 1.6, 0], fov: 38 },
      ],
      // the beam comes down and it is built in front of you
      [
        { at: BUILD[0], pos: [-17, -3.6, 28], look: [0, 3, 3], fov: 44 },
        { at: 0.64, pos: [-9, -2.4, 26], look: [0, 3, 4], fov: 38 },
      ],
      // boss fight
      [
        { at: 0.64, pos: [4.5, -3.6, 19], look: [-2, 3, 2], fov: 50, roll: 0.14 },
        { at: 0.76, pos: [3, -4.6, 20], look: [-3, 4, 1], fov: 46, roll: 0.1 },
        { at: 0.88, pos: [-8, 2, 21], look: [0.4, 2.6, 6.4], fov: 31 },
      ],
    ],
  };

  readonly shots: Shot[] = [
    { at: 0, pos: [-3, 2.4, 29], look: [0, 2, 3], fov: 34 },
    { at: 0.18, pos: [-9, 3.4, 20], look: [0.6, 2.6, 7], fov: 29 },
    { at: 0.38, pos: [-8, 1.2, 21], look: [0.4, 2.2, 6.4], fov: 31 },
    { at: 0.53, pos: [4.5, -3.6, 18], look: [-3.4, 4, 1], fov: 46, roll: 0.12 },
    { at: 0.7, pos: [-4, -5.8, 18], look: [3, -2.4, 4], fov: 42, roll: -0.1 },
    { at: 0.84, pos: [-3, -4.6, 19], look: [5, -2.8, 7.2], fov: 32 },
    { at: 1, pos: [-2, 1, 30], look: [3, 1, 0], fov: 36 },
  ];

  constructor(private readonly detail = 1) {
    super('pixel', 1, PIXEL.length, 96, {
      keyDir: new Vector3(0.3, 0.85, 0.45),
      key: new Color(1, 1, 1),
      sky: new Color(0.1, 0.02, 0.15),
      ground: new Color(0.02, 0.05, 0.1),
      rim: new Color(0.6, 0.2, 0.9),
      envTop: new Color(0.1, 0.02, 0.2),
      envHorizon: new Color(0.6, 0.1, 0.5),
      envBottom: new Color(0.02, 0.1, 0.2),
    });
  }

  build(result: BlueprintResult) {
    const info = headInfo({ len: 2.3, w: 0.62, h: 0.58, snout: 0.26, brow: 1.2, cheek: 1.0, jaw: 0.22, neck: 0, eye: 0.11 });
    Object.assign(this.uniforms, {
      uColA: { value: this.colA },
      uColB: { value: this.colB },
      uBurst: { value: 0 },
      uSwirl: { value: 0 },
      uBeat: { value: 0 },
      uDrift: { value: 0 },
      uWingS: { value: PIXEL.shoulder },
      uHinge: { value: new Vector3(...info.hinge) },
    });
    this.uniforms.uTouch = { value: this.touches };
    this.uniforms.uTouching = { value: 0 };
    this.uniforms.uBuild = { value: -1 };
    this.uniforms.uPixelRatio = { value: 1 };
    const material = this.material(voxelVert, voxelFrag, {}, { side: DoubleSide });
    this.mesh(toGeometry(result.pack.voxels), material);
    this.add(this.swarm(Math.round(SWARM * this.detail)));
    this.group.add(this.sparks.points, this.beam.mesh);
    this.ready = true;
  }

  /** A cloud of single pixels riding around the body, and running from the pointer. */
  private swarm(count: number) {
    const rnd = mulberry32(41);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    const m = this.material(`#define VERTEX\n${swarmSource}`, swarmSource, {}, { blending: AdditiveBlending, depthWrite: false, transparent: true });
    return new Points(geo, m);
  }

  /** The pointer on the body: the cubes part, and pixels spray off. */
  private stir(ctx: FrameContext) {
    const t = this.touches;
    let left = 0;
    for (const q of t) {
      q.w = Math.max(0, q.w - ctx.dt * 1.5);
      left = Math.max(left, q.w);
    }
    this.uniforms.uTouching.value = left;
    if (!ctx.free) return;
    const cam = ctx.camera.position;
    const spine = this.spine;
    let best = Infinity;
    for (let k = 0; k <= 26; k++) {
      spine.sample((k / 26) * spine.length, a);
      const along = a.sub(cam).dot(ctx.ray);
      if (along <= 0) continue;
      const miss = a.lengthSq() - along * along;
      if (miss < best) {
        best = miss;
        b.copy(cam).addScaledVector(ctx.ray, along);
      }
    }
    const near = 1 - smoothstep(1, FEEL, Math.sqrt(Math.max(best, 0)));
    if (near <= 0) return;
    this.touchEvery -= ctx.dt;
    const moved = b.distanceTo(this.lastTouch);
    if (this.touchEvery <= 0 || moved > 1.1) {
      // a short trail, so the wake closes behind the pointer rather than snapping shut
      this.touchEvery = 0.09;
      const oldest = t.pop()!;
      oldest.set(b.x, b.y, b.z, near);
      t.unshift(oldest);
      if (moved > 0.15) {
        const height = clamp((ctx.pointer.y + 1) / 2);
        this.onStir?.(height);
        const [ca, cb] = this.palette;
        const count = Math.ceil(near * clamp(moved * 5, 2, 12));
        for (let i = 0; i < count; i++) {
          v.set((Math.random() - 0.5) * 12, 3 + Math.random() * 9, (Math.random() - 0.5) * 12);
          a.set(b.x + (Math.random() - 0.5) * 1.6, b.y + (Math.random() - 0.5) * 1.6, b.z + (Math.random() - 0.5) * 1.6);
          this.sparks.spawn(a, v, Math.random() < 0.5 ? ca : cb, 0.8 + Math.random() * 0.8, 0.14 + Math.random() * 0.2, Kind.Pixel);
        }
      }
      this.lastTouch.copy(b);
    }
    t[0].w = Math.max(t[0].w, near);
    this.uniforms.uTouching.value = Math.max(left, near);
  }

  /** Current hobby colours, for the sky and floor to follow. */
  get palette(): [Color, Color] {
    return [this.colA, this.colB];
  }

  /** The arcade reacts: cubes jump off the body and a ring runs across the grid. */
  protected override onGesture(kind: Gesture) {
    if (kind === 'glance') return;
    this.ripple = 1;
    this.stagehand?.light(0.65);
    this.stagehand?.voice('stir', 0.6);
  }

  protected override entering(t: number, ctx: FrameContext) {
    const h = this.stagehand;
    for (const [at, word] of COUNT) {
      if (!this.beat(at, ctx)) continue;
      const go = word === 'GO';
      h?.say(word);
      h?.light(go ? 1 : 0.45);
      h?.quake(go ? 0.45 : 0.14);
      this.flashing = (this.flashing + 1) % HOBBY_PALETTES.length;
    }
    // the cubes rain in, and the arcade plays them in as they land
    const build = clamp((t - BUILD[0]) / (BUILD[1] - BUILD[0]));
    this.uniforms.uBuild.value = t < BUILD[1] + 0.03 ? build : -1;
    this.offstage = build < 0.4;
    if (build > 0 && build < 1) this.onStir?.(build);
    this.beam.set(this.beamBase, smoothstep(BUILD[0] - 0.03, BUILD[0] + 0.02, t) * (1 - smoothstep(BUILD[1], BUILD[1] + 0.08, t)) * 0.9, ctx.time);
    if (this.beat(BUILD[1], ctx)) {
      // built: the warning, then the boss
      h?.say('BOSS');
      h?.strobe(0.9);
      h?.shock(0.5, 0.5, 1.2);
      h?.light(1);
      h?.quake(0.8);
      h?.voice('impact');
      h?.voice('roar');
    }
    if (this.beat(0.72, ctx)) h?.voice('flap');
  }

  protected act(ctx: FrameContext) {
    const { time: t, dt, chapter, p } = ctx;
    if (this.cue(0.5, ctx)) this.stagehand?.voice('flap');
    // during the film the palette follows its lines; on the page, the hobbies
    const inFilm = ctx.scene === this.stage && p < 0.98;
    const spoken = p < 0.3 ? 0 : p < 0.5 ? 1 : p < 0.7 ? 2 : 3;
    const loaded = ctx.entry >= 0 ? this.flashing : Math.round(inFilm ? spoken : chapter);
    const level = clamp(loaded, 0, 4);
    if (level !== this.level) {
      if (this.level >= 0) this.changedAt = t;
      this.level = level;
    }
    const since = t - this.changedAt;
    const burst = smoothstep(0, 0.12, since) * (1 - smoothstep(0.3, 1.25, since));
    const [a, b] = HOBBY_PALETTES[level];
    this.targetA.set(a);
    this.targetB.set(b);
    const k = 1 - Math.exp(-dt * (since < 0.6 ? 10 : 3));
    this.colA.lerp(this.targetA, k);
    this.colB.lerp(this.targetB, k);
    const u = this.uniforms;
    // the boss loads in out of a cloud of cubes
    const load = ctx.scene === this.stage ? 1 - smoothstep(0, 0.13, p) : 0;
    this.ripple = Math.max(0, this.ripple - dt * 1.6);
    u.uBurst.value = ctx.entry >= 0 ? burst * 0.3 : Math.max(burst * 0.7, this.rage * 0.8, load * 1.3, this.ripple * this.ripple * 0.5);
    if (ctx.entry < 0) {
      u.uBuild.value = -1;
      this.offstage = false;
      this.beam.set(this.beamBase, 0, t);
    }
    u.uBeat.value = (1 - clamp(Math.abs(chapter - 2))) * (0.6 + 0.4 * Math.sin(t * 8.5));
    u.uDrift.value = (1 - clamp(Math.abs(chapter - 3))) * 0.9;
    u.uFlow.value = damp(u.uFlow.value as number, Math.abs(ctx.velocity) * 0.03, 3, dt);
    u.uPixelRatio.value = ctx.pixelRatio;
    this.stir(ctx);
    this.sparks.update(dt, t, ctx.pixelRatio);
  }
}

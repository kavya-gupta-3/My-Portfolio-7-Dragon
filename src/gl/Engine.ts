import {
  Color,
  NoToneMapping,
  type Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { Quality } from '../core/quality';
import { clamp, damp, smoothstep } from '../core/math';
import { STAGES } from '../data/content';
import { curve, type Shot } from './cinema/timeline';
import { Director, STAGE_COUNT, stageCenter } from './Director';
import { PostFX } from './PostFX';
import { Sky } from './Sky';
import type { Dragon, Voice } from './dragon/Dragon';
import { GeometryFactory } from './dragon/geometry';
import { GpuClock } from './GpuClock';
import { FLOOR } from './fx/Ground';
import type { FrameContext } from './types';

export interface FrameInput {
  time: number;
  /** Unclamped frame time, for pacing and the resolution governor. */
  rawDt: number;
  /** The chapter the page has reached. */
  scene: number;
  /** Progress through that chapter's film. */
  p: number;
  /** 0 at the top of the page, 1 once the opening shot has handed over. */
  hero: number;
  locals: number[];
  chapter: number;
  velocity: number;
  /** The pointer, eased: what the camera and the dragons' eyes drift toward. */
  pointer: Vector2;
  /** The pointer, exactly where it is: what touches things. */
  aim: Vector2;
  /** The pointer is over page UI, so the dragons behind it can't be touched. */
  overUI: boolean;
  speaking: number;
  /** How far the page has come in over the end of the film (0‥1). */
  page: number;
}

/** `?cam=x,y,z,tx,ty,tz` pins the camera (inspection/screenshots). */
const DEBUG_CAM = (() => {
  const v = new URLSearchParams(location.search).get('cam');
  const n = v?.split(',').map(Number);
  return n && n.length === 6 && n.every(Number.isFinite) ? n : null;
})();

/** Per-chapter colour grade applied in the composite pass. */
const GRADES: [number, number, number][] = [
  [1.06, 0.97, 0.92],
  [1.02, 0.95, 1.08],
  [0.94, 1.0, 1.08],
  [0.94, 1.06, 1.0],
  [1.08, 1.02, 0.9],
  [1.0, 0.95, 1.1],
  [1.1, 0.94, 0.95],
];

/** Ground mist per chapter: amount, then colour. */
const MIST: [number, number, number, number][] = [
  [0.55, 0.05, 0.016, 0.008],
  [0.2, 0.02, 0.004, 0.05],
  [0.5, 0.01, 0.03, 0.05],
  [0.42, 0.004, 0.03, 0.022],
  [0.35, 0.05, 0.03, 0.006],
  [0, 0, 0, 0],
  [0.5, 0.04, 0.004, 0.008],
];

/** Where each world's light comes from: a direction, or null for the dragon's own head. */
const LIGHTS: ([number, number, number] | null)[] = [null, [0, -0.02, -1], null, [0.1, 0.72, -0.7], [0.15, 0.85, -0.5], null, [-0.35, 0.42, -1]];
/** How strongly each world throws light shafts. */
const SHAFT_POWER = [0.14, 0.09, 0.16, 0.14, 0.2, 0.12, 0.24];

/** Length of each elemental hand-over, seconds. */
const WIPE_SECONDS = [1.5, 1.35, 1.15, 1.4, 1.7, 1.5, 0.45];

/**
 * Render at most this often: a 120 Hz display shouldn't cost twice the GPU.
 * Well under 1/60, because a timer jitters and a 60 Hz frame must never look early.
 */
const MIN_FRAME = 1 / 100;

/** The render scale moves in these steps, and never below the floor. */
const SCALE_STEP = 0.14;
const SCALE_FLOOR = 0.6;
/** Milliseconds of chip time a frame may use and still make 60 Hz with room to breathe. */
const CHIP_BUDGET = 15;
/** How fast the opening shot's far world turns (radians a second): once round in about two and a half minutes. */
const SKY_TURN = 0.042;

/** Opening sequence, seconds: eyes open in the dark, then each dragon ignites. */
export const INTRO = {
  eyesAt: [1.1, 1.3, 0.8, 0.95, 1.5, 1.65, 0.65],
  igniteAt: [4.3, 3.8, 2.2, 2.6, 5.0, 3.0, 3.4],
  igniteFor: 0.95,
  length: 6.6,
};

const flashTint = new Color();
const pickPoint = new Vector3();

export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(32, 1, 0.1, 900);
  readonly post: PostFX;
  readonly sky: Sky;
  readonly director = new Director();
  readonly dragons: Dragon[] = [];
  readonly factory = new GeometryFactory();
  /** Extra per-frame hooks (particles, stage props). */
  readonly systems: { update(ctx: EngineFrame): void }[] = [];
  fps = 60;
  renderScale = 1;
  flash = 0;
  /** A surge of light through the current world (0‥1), and how far its ring has spread. */
  pulse = 0;
  ringAge = 9;
  /** A cut between chapters has begun. */
  onCut: ((from: number, to: number) => void) | null = null;
  /** A dragon has ignited in the opening sequence. */
  onIgnite: ((dragon: number) => void) | null = null;
  /** The opening sequence has reached its last beat. */
  onIntroEnd: (() => void) | null = null;
  /** The pointer has moved onto a dragon, or off one (−1). */
  onHover: ((dragon: number) => void) | null = null;
  /** A dragon's name has hit the screen in its entrance. */
  onEntryTitle: ((dragon: number) => void) | null = null;
  /** An entrance has handed over to the film. */
  onEntryEnd: ((dragon: number) => void) | null = null;
  /** The dragon under the pointer, or −1. */
  hovered = -1;
  /** Sound requests from the dragons. */
  onVoice: ((dragon: number, kind: Voice, amount?: number) => void) | null = null;
  /** Prop requests from the dragons. */
  onScatter: ((scene: number) => void) | null = null;
  /** A word for the screen from an entrance. */
  onSay: ((dragon: number, text: string) => void) | null = null;
  private frameTimes: number[] = [];
  private width = 1;
  private height = 1;
  private readonly raycaster = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 0, 1), 0);
  private readonly pointerWorld = new Vector3();
  private readonly center = new Vector3();
  private readonly subject = new Vector3();
  private readonly ctx: FrameContext;
  private readonly clock: GpuClock;
  /** How long frames have been too slow, and how long they have had time to spare. */
  private strained = 0;
  private coasting = 0;
  /** How long frames must have time to spare before sharpening. Doubles if that fails. */
  private patience = 3;
  private raisedAt = -100;
  /**
   * How sharp each world has shown it can stay. They don't cost the chip the
   * same: one that strained it before is entered straight at the scale it
   * settled at, instead of stuttering for seconds at what a lighter one earned.
   */
  private readonly ceiling = new Array<number>(STAGE_COUNT).fill(1);
  private governed = 0;
  /** The opening shot's far world: how far it has turned on its own, and toward the pointer. */
  private skyTurn = 0;
  private skyLean = 0;
  private captureNext: ((png: Blob | null) => void) | null = null;
  private readonly frameState = {} as EngineFrame;
  private rageUntil = 0;
  private now = 0;
  private since = 0;
  private current = 0;
  private sceneP = 0;
  private hero = 0;
  private cutT = -1;
  private cutLength = 1;
  private introT = -1;
  private introSpeed = 1;
  private lastIgnite = new Set<number>();
  private shockT = -1;
  private pickFrame = 0;
  private entry: { dragon: number; t: number; speed: number; take: number; titled: boolean; started: boolean; takes: readonly (readonly Shot[])[] } | null = null;
  private readonly weights = new Array<number>(STAGE_COUNT).fill(0);

  constructor(readonly canvas: HTMLCanvasElement, readonly quality: Quality) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    // a GPU reset takes every texture with it: the only clean way back is to start again
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x050407, 1);
    this.clock = new GpuClock(this.renderer.getContext() as WebGL2RenderingContext);
    this.post = new PostFX(this.renderer, quality.msaa, quality.bloomLevels, quality.skyScale);
    this.sky = new Sky(this.post.sky.texture);
    this.scene.add(this.sky.mesh);
    this.ctx = {
      time: 0,
      dt: 0,
      scene: 0,
      p: 0,
      local: 0,
      conclave: 1,
      hero: 0,
      reveal: 1,
      eyes: 1,
      center: this.center,
      camera: this.camera,
      pointer: new Vector2(),
      pointerWorld: this.pointerWorld,
      ray: new Vector3(0, 0, -1),
      free: false,
      focus: -1,
      pulse: 0,
      entry: -1,
      velocity: 0,
      chapter: 0,
      speaking: 0,
      page: 0,
      quality,
      aspect: 1,
      pixelRatio: 1,
    };
    this.resize();
  }

  addDragon(d: Dragon) {
    this.dragons[d.stage] = d;
    this.scene.add(d.group);
    d.stagehand = {
      shock: (x, y, s) => this.shock(x, y, s),
      strobe: (a) => {
        this.flash = Math.max(this.flash, a);
        flashTint.set(STAGES[d.stage].color);
        this.post.params.flashColor.set(flashTint.r * 0.5 + 0.5, flashTint.g * 0.5 + 0.5, flashTint.b * 0.5 + 0.5);
      },
      voice: (k, amount) => this.onVoice?.(d.stage, k, amount),
      scatter: () => this.onScatter?.(d.stage),
      light: (amount) => {
        this.pulse = Math.max(this.pulse, amount);
        this.ringAge = 0;
      },
      meteor: () => this.sky.meteor(),
      say: (text) => this.onSay?.(d.stage, text),
      quake: (amount) => {
        if (!this.quality.reducedMotion) this.director.shake(amount);
      },
    };
  }

  resize() {
    const w = window.innerWidth;
    // match the CSS size of the canvas (100lvh on phones)
    const h = Math.max(window.innerHeight, this.canvas.clientHeight || 0);
    this.width = w;
    this.height = h;
    const budget = Math.sqrt(this.quality.maxPixels / Math.max(1, w * h));
    const dpr = Math.min(this.quality.maxDpr, window.devicePixelRatio || 1, budget) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(Math.round(w * dpr), Math.round(h * dpr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Adaptive resolution. The picture only gets softer when frames are running
   * long and the chip is the reason, for long enough to mean it: a capped frame
   * rate or a covered window must never cost sharpness. Changing it reallocates
   * targets, so it moves rarely and in firm steps.
   */
  private govern(dt: number) {
    // a tab switch or a GC pause is not a slow GPU
    if (dt > 0.25 || document.hidden) return;
    if (this.current !== this.governed) {
      this.governed = this.current;
      // a world that strained the chip before starts where it settled
      if (this.renderScale > this.ceiling[this.current]) {
        this.rescale(this.ceiling[this.current]);
        return;
      }
    }
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const n = this.frameTimes.length;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / n;
    this.fps = damp(this.fps, 1 / Math.max(avg, 1e-3), 4, dt);
    // a struggle shows within a third of a second; sharpening wants a full one
    if (n < 20 || this.cutT >= 0 || this.entry) return;
    const chip = this.clock.ms;
    // a browser that can't time the chip: a rock-steady 30 Hz is a cap, not a struggle
    const worst = Math.max(...this.frameTimes);
    const capped = !chip && worst < 0.036 && avg > 0.0325;
    const up = this.renderScale + SCALE_STEP;
    const room = !chip || chip * (up / this.renderScale) ** 2 < CHIP_BUDGET;
    // far over budget the picture visibly stutters: give up sooner
    const over = chip > CHIP_BUDGET * 1.3 ? 3 : 1;
    this.strained = avg > 1 / 45 && !capped && (!chip || chip > CHIP_BUDGET) ? this.strained + dt * over : 0;
    this.coasting = n >= 60 && avg < 1 / 54 && room ? this.coasting + dt : 0;
    let next = this.renderScale;
    if (this.strained > 1.5) {
      next = Math.max(SCALE_FLOOR, this.renderScale - SCALE_STEP);
      this.ceiling[this.current] = next;
      // it only just got sharper and couldn't hold it: wait longer before trying again
      if (this.now - this.raisedAt < 10) this.patience = Math.min(this.patience * 2, 60);
    } else if (this.renderScale < 1 && this.coasting > this.patience) {
      next = Math.min(1, up);
      this.raisedAt = this.now;
      this.ceiling[this.current] = Math.max(this.ceiling[this.current], next);
    }
    if (next !== this.renderScale) this.rescale(next);
  }

  /** Changing the scale reallocates every target, so it happens rarely and in firm steps. */
  private rescale(scale: number) {
    this.renderScale = scale;
    this.strained = 0;
    this.coasting = 0;
    this.frameTimes.length = 0;
    this.resize();
  }

  /** The next finished frame, as a PNG. */
  capture(done: (png: Blob | null) => void) {
    this.captureNext = done;
  }

  /** Dragon Rage: every dragon furious, the image straining for a few seconds. */
  rage(seconds: number) {
    this.rageUntil = this.now + seconds;
    this.shock(0.5, 0.55, 1);
  }

  /** A ring of force through the picture, from a point on screen. */
  shock(x: number, y: number, strength = 1) {
    this.shockT = 0;
    this.post.params.shock.set(x, y, 0, strength);
    if (!this.quality.reducedMotion) this.director.shake(strength * 0.55);
  }

  /** Start the opening sequence (seven pairs of eyes in the dark). */
  playIntro() {
    this.introT = 0;
    this.lastIgnite.clear();
  }

  /** Skip through the opening when the visitor starts scrolling. */
  hurryIntro() {
    this.introSpeed = 5;
  }

  get introPlaying() {
    return this.introT >= 0;
  }

  private tickIntro(dt: number) {
    if (this.introT < 0) return;
    this.introT += dt * this.introSpeed;
    for (let i = 0; i < STAGE_COUNT; i++) {
      if (this.introT >= INTRO.igniteAt[i] && !this.lastIgnite.has(i)) {
        this.lastIgnite.add(i);
        this.onIgnite?.(i);
        this.flash = Math.max(this.flash, i === 4 ? 0.5 : 0.22);
        flashTint.set(STAGES[i].color);
        this.post.params.flashColor.set(flashTint.r, flashTint.g, flashTint.b);
        if (i === 4) this.shock(0.5, 0.72, 1);
      }
    }
    if (this.introT >= INTRO.length) {
      this.introT = -1;
      this.onIntroEnd?.();
    }
  }

  /**
   * Summon a dragon: it makes its entrance, then hands over to the film at
   * `land`. The page must jump there in the same breath; the wipe hides it.
   */
  summon(dragon: number, land: number) {
    const d = this.dragons[dragon];
    if (!d?.ready || this.entry || this.introT >= 0) return false;
    this.entry = { dragon, t: 0, speed: 1, take: -1, titled: false, started: false, takes: d.prepare(land) };
    return true;
  }

  get entering() {
    return !!this.entry;
  }

  /** The visitor is impatient: run the rest of the scene quickly. */
  hurryEntry() {
    if (this.entry) this.entry.speed = 3;
  }

  private tickEntry(dt: number) {
    const e = this.entry;
    if (!e) return;
    const spec = this.dragons[e.dragon].entrance;
    e.t += (dt * e.speed) / spec.seconds;
    if (!e.titled && e.t >= spec.title) {
      e.titled = true;
      this.onEntryTitle?.(e.dragon);
    }
    if (e.t >= 1) {
      this.entry = null;
      this.onEntryEnd?.(e.dragon);
    }
  }

  /** Which dragon is the pointer on? Tests a few points along each spine. */
  private pick(input: FrameInput) {
    let found = -1;
    if (!this.quality.touch && !input.overUI && this.introT < 0 && this.cutT < 0 && !this.entry && Math.abs(input.velocity) < 1) {
      let closest = 1;
      const cam = this.camera;
      const aspect = this.width / this.height;
      const view = Math.tan((cam.fov * Math.PI) / 360);
      for (const d of this.dragons) {
        if (!d?.group.visible) continue;
        const sp = d.spine;
        // stay on the dragon you are on: its edge is a little further away
        const reach = d.girth * (d.stage === this.hovered ? 2.1 : 1.6);
        for (let k = 0; k <= 10; k++) {
          sp.sample((k / 10) * sp.length * 0.84, pickPoint);
          const dist = pickPoint.distanceTo(cam.position);
          pickPoint.project(cam);
          if (pickPoint.z > 1) continue;
          const dx = (pickPoint.x - input.aim.x) * aspect;
          const dy = pickPoint.y - input.aim.y;
          const q = Math.hypot(dx, dy) / (reach / (dist * view));
          if (q < closest) {
            closest = q;
            found = d.stage;
          }
        }
      }
    }
    if (found !== this.hovered) {
      this.hovered = found;
      this.onHover?.(found);
    }
  }

  private cut(to: number) {
    const from = this.current;
    const reduced = this.quality.reducedMotion;
    this.post.capture();
    this.current = to;
    const w = this.post.wipe;
    const entrance = this.entry ? this.dragons[to].entrance : null;
    const kind = reduced ? 6 : entrance ? entrance.wipe : clamp(Math.min(from, to), 0, 5);
    w.active = true;
    w.kind = kind;
    w.a.set(STAGES[from].color);
    w.b.set(STAGES[to].color);
    this.cutT = 0;
    this.cutLength = entrance ? entrance.wipeSeconds : WIPE_SECONDS[kind];
    this.director.cut(reduced ? 0 : 1);
    this.onCut?.(from, to);
  }

  private tickCut(dt: number) {
    if (this.cutT < 0) return;
    this.cutT += dt;
    const t = clamp(this.cutT / this.cutLength);
    this.post.wipe.p = t;
    if (t >= 1) {
      this.cutT = -1;
      this.post.wipe.active = false;
    }
  }

  frame(input: FrameInput) {
    this.since += input.rawDt;
    // a device already at its floor, reading a page: the dragon is scenery, so spend less on it
    const reading = this.renderScale <= SCALE_FLOOR && input.p >= 1 && Math.abs(input.velocity) < 0.1 && this.cutT < 0;
    if (this.since < (reading ? 1 / 32 : MIN_FRAME)) return;
    const rawDt = this.since;
    this.since = 0;
    const dt = Math.min(rawDt, 1 / 20);
    const { time } = input;
    this.now = time;
    this.clock.read();
    // half rate on purpose says nothing about how fast the device is
    if (reading) this.frameTimes.length = 0;
    else this.govern(rawDt);
    const reduced = this.quality.reducedMotion;
    const aspect = this.width / this.height;

    const entry = this.entry;
    if (input.scene !== this.current || (entry && !entry.started)) {
      this.cut(input.scene);
      this.sceneP = input.p;
      if (entry) {
        entry.started = true;
        this.hero = input.hero;
        this.hovered = -1;
        this.onHover?.(-1);
      }
    }
    // film time is wall-clock time: a slow frame shouldn't stretch a cut
    this.tickCut(Math.min(rawDt, 0.1));
    this.tickIntro(Math.min(rawDt, 0.1));
    this.tickEntry(Math.min(rawDt, 0.1));
    const scene = this.current;
    this.sceneP = damp(this.sceneP, input.p, 7, dt);
    this.hero = Math.abs(this.hero - input.hero) < 1e-4 ? input.hero : damp(this.hero, input.hero, 7, dt);
    const conclave = scene === 0 ? 1 - this.hero : 0;
    for (let i = 0; i < STAGE_COUNT; i++) this.weights[i] = i === scene ? 1 : 0;

    const intro = this.introT < 0 ? 1 : clamp(this.introT / INTRO.length);
    const d = this.director;
    const live = this.entry;
    let shots = this.dragons[scene]?.shots ?? [];
    if (live) {
      // each take runs up to the start of the next one, and the cut between is hard
      let take = 0;
      while (take < live.takes.length - 1 && live.t >= live.takes[take + 1][0].at) take++;
      if (take !== live.take) {
        live.take = take;
        d.snap();
      }
      shots = live.takes[take];
    }
    // last frame's head: near enough, and the dragons move after the camera
    const star = this.dragons[scene];
    const subject = star?.group.visible && !star.offstage ? star.snout(this.subject, 1.1) : null;
    const floor = FLOOR[scene];
    d.update({ scene, p: live ? live.t : this.sceneP, hero: this.hero, intro, shots, pointer: input.pointer, aspect, dt, time, reduced, tight: !!live, subject, floor });

    const cam = this.camera;
    cam.position.copy(d.camPos);
    cam.up.set(Math.sin(d.roll), Math.cos(d.roll), 0);
    cam.lookAt(d.camTarget);
    if (DEBUG_CAM) {
      cam.position.set(DEBUG_CAM[0], DEBUG_CAM[1], DEBUG_CAM[2]);
      cam.lookAt(DEBUG_CAM[3], DEBUG_CAM[4], DEBUG_CAM[5]);
    }
    if (Math.abs(cam.fov - d.fov) > 0.01) {
      cam.fov = d.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // pointer → world, on the plane through this stage
    stageCenter(scene, this.center);
    this.plane.constant = -this.center.z;
    this.raycaster.setFromCamera(input.aim, cam);
    if (!this.raycaster.ray.intersectPlane(this.plane, this.pointerWorld)) this.pointerWorld.copy(this.center);

    if (++this.pickFrame % 2 === 0) this.pick(input);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.pulse = Math.max(0, this.pulse - dt * 0.8);
    this.ringAge += dt;
    // darkness first: the world only lights up as the dragons ignite
    const dawn = this.introT < 0 ? 1 : 0.12 + 0.88 * smoothstep(1.8, 5.2, this.introT);
    // the opening shot's far world turns slowly, and leans the way the pointer
    // goes: the camera seems to circle the seven while they hold their places
    if (!reduced) {
      this.skyTurn += dt * SKY_TURN;
      this.skyLean = damp(this.skyLean, input.pointer.x * 0.34, 2.2, dt);
    }
    this.sky.yaw = this.skyTurn + this.skyLean;
    this.sky.update(cam, this.weights, conclave, dawn, time, this.flash, this.pulse, dt);

    const ctx = this.ctx;
    ctx.time = time;
    ctx.dt = dt;
    ctx.scene = scene;
    ctx.p = this.sceneP;
    ctx.hero = this.hero;
    ctx.conclave = conclave;
    ctx.entry = live ? clamp(live.t) : -1;
    ctx.pointer.copy(input.pointer);
    ctx.free = !input.overUI && !live && this.introT < 0 && this.cutT < 0;
    ctx.ray.copy(this.raycaster.ray.direction);
    ctx.focus = this.hovered;
    ctx.pulse = this.pulse;
    ctx.velocity = input.velocity;
    ctx.chapter = input.chapter;
    ctx.speaking = input.speaking;
    ctx.page = input.page;
    ctx.aspect = aspect;
    ctx.pixelRatio = this.renderer.getPixelRatio();
    for (let i = 0; i < STAGE_COUNT; i++) {
      const dragon = this.dragons[i];
      if (!dragon) continue;
      ctx.local = input.locals[i] ?? 0;
      if (this.introT >= 0) {
        ctx.eyes = smoothstep(INTRO.eyesAt[i], INTRO.eyesAt[i] + 0.45, this.introT);
        ctx.reveal = clamp((this.introT - INTRO.igniteAt[i]) / INTRO.igniteFor);
      } else {
        ctx.eyes = 1;
        ctx.reveal = 1;
      }
      stageCenter(i === scene || scene !== 0 ? i : 0, this.center);
      dragon.update(ctx);
    }
    if (conclave > 0 && this.pickFrame % 16 === 0) this.nearestFirst();
    stageCenter(scene, this.center);
    const frame = Object.assign(this.frameState, ctx, {
      weights: this.weights,
      transit: this.post.wipe.active ? Math.sin(this.post.wipe.p * Math.PI) : 0,
      locals: input.locals,
      intro,
      engine: this,
    });
    for (const s of this.systems) s.update(frame);

    // grade + transition energy
    const p = this.post.params;
    const raging = time < this.rageUntil ? Math.min(1, (this.rageUntil - time) * 0.8) : 0;
    p.gain = live ? curve(this.dragons[scene].entrance.light, live.t) : 1;
    p.chroma = reduced ? 0 : frame.transit * 1.1 + raging * 1.6;
    p.flash = this.flash * 0.6;
    p.bloom = 1 + this.pulse * 0.55;
    p.streak = 0.5 + this.pulse * 0.5;
    const g = GRADES[scene];
    const c = conclave;
    p.tint.set(1 + (g[0] - 1) * (1 - c), 1 + (g[1] - 1) * (1 - c), 1 + (g[2] - 1) * (1 - c));
    if (raging > 0) p.tint.set(p.tint.x * (1 + raging * 0.4), p.tint.y * (1 - raging * 0.25), p.tint.z * (1 - raging * 0.3));
    const mist = MIST[scene];
    p.fog = mist[0] + (0.92 - mist[0]) * c;
    p.fogColor.set(mist[1] + (0.022 - mist[1]) * c, mist[2] + (0.012 - mist[2]) * c, mist[3] + (0.012 - mist[3]) * c);
    flashTint.set(STAGES[scene].color);
    p.streakTint.set(flashTint.r * 0.7 + 0.3, flashTint.g * 0.7 + 0.3, flashTint.b * 0.7 + 0.3);
    if (this.introT < 0) p.flashColor.set(flashTint.r * 0.5 + 0.5, flashTint.g * 0.5 + 0.5, flashTint.b * 0.5 + 0.5);
    this.aimShafts(p, scene, conclave);
    if (this.shockT >= 0) {
      this.shockT += dt;
      const s = p.shock;
      s.z = this.shockT * 1.35;
      s.w = Math.max(0, s.w - dt * 1.1);
      if (s.w <= 0) this.shockT = -1;
    }
    this.clock.start();
    this.post.render(this.scene, cam, time, this.sky.material);
    if (this.captureNext) {
      // read while this frame is still in the drawing buffer
      const done = this.captureNext;
      this.captureNext = null;
      this.renderer.domElement.toBlob(done, 'image/png');
    }
    this.clock.stop();
  }

  /** The seven overlap: drawing the nearest first means nothing is painted twice. */
  private nearestFirst() {
    const seen = this.dragons.filter((d) => d?.group.visible);
    const far = (d: Dragon) => d.spine.sample(d.spine.length * 0.2, pickPoint).distanceToSquared(this.camera.position);
    const order = seen.map((d) => [far(d), d] as const).sort((a, b) => a[0] - b[0]);
    order.forEach(([, d], i) => (d.group.renderOrder = i + 1));
  }

  /**
   * Light shafts and lens dust are the first things dropped on a device that
   * is struggling: the picture stays smooth, just a little plainer.
   */
  private aimShafts(p: PostFX['params'], scene: number, conclave: number) {
    if (this.renderScale < 0.8 || this.quality.tier === 'low') {
      p.shafts = 0;
      p.dirt = 0;
      return;
    }
    p.dirt = 0.9;
    const dir = conclave > 0.5 ? null : LIGHTS[scene];
    const cam = this.camera;
    if (conclave > 0.5) pickPoint.set(0, 9, -24);
    else if (dir) pickPoint.set(cam.position.x + dir[0] * 300, cam.position.y + dir[1] * 300, cam.position.z + dir[2] * 300);
    else this.dragons[scene]?.spine.sample(0, pickPoint);
    pickPoint.project(cam);
    const behind = pickPoint.z > 1;
    const off = Math.hypot(pickPoint.x, pickPoint.y);
    p.light.set(pickPoint.x * 0.5 + 0.5, pickPoint.y * 0.5 + 0.5);
    p.shafts = behind ? 0 : (SHAFT_POWER[scene] + this.pulse * 0.14) * (1 - smoothstep(1, 2, off));
  }

  /** A click anywhere: the world feels it, a little. */
  ripple() {
    if (this.entry || this.introT >= 0) return;
    this.pulse = Math.max(this.pulse, 0.3);
    this.ringAge = 0;
    if (this.current === 2) this.flash = Math.max(this.flash, 0.14);
  }

  /** A click: the dragon of the current chapter answers. `loud` when it was the one clicked. */
  provoke(loud = true) {
    const dragon = this.dragons[this.current];
    if (!dragon || !dragon.ready) return null;
    dragon.provoke(this.ctx, loud);
    if (this.ctx.conclave > 0.5) for (const d of this.dragons) if (d) d.rage = 1;
    return dragon;
  }

  /**
   * Compile everything against the real render target and draw it once, so
   * no shader link or buffer upload is left to hitch the first scroll.
   */
  async compile() {
    // everything that only appears now and then has to be ready for when it does
    const props: Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) props.push(o);
      o.visible = true;
    });
    this.camera.position.set(0, 30, 300);
    this.camera.lookAt(0, 30, 0);
    this.camera.updateMatrixWorld();
    this.renderer.setRenderTarget(this.post.scene);
    // every dragon has two programs, one for dissolving and one for once it is whole
    for (const whole of [true, false]) {
      for (const d of this.dragons) d?.settle(whole);
      try {
        await this.renderer.compileAsync(this.scene, this.camera);
      } catch {
        this.renderer.compile(this.scene, this.camera);
      }
      this.post.render(this.scene, this.camera, 0, this.sky.material);
    }
    this.post.warm();
    this.renderer.setRenderTarget(null);
    for (const o of props) o.visible = false;
    for (const d of this.dragons) if (d) d.group.visible = false;
  }
}

export interface EngineFrame extends FrameContext {
  weights: number[];
  locals: number[];
  transit: number;
  intro: number;
  engine: Engine;
}

import {
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
  Vector4,
  type BufferGeometry,
  type IUniform,
  type Material,
  type Object3D,
} from 'three';
import { clamp, damp, lerp, noise1, smootherstep, smoothstep } from '../../core/math';
import { Acting, between, film, freeze, hold, makeRig, perform, type Beat, type Entrance, type P3, type Shot, type Wing } from '../cinema/timeline';
import type { FrameContext } from '../types';
import type { BlueprintResult } from './blueprints';
import { catmullRom } from './pose';
import type { Species } from './registry';
import { Spine } from './Spine';

export interface Lighting {
  keyDir: Vector3;
  key: Color;
  sky: Color;
  ground: Color;
  rim: Color;
  envTop: Color;
  envHorizon: Color;
  envBottom: Color;
}

/** The dragon's place in the opening shot, and where it goes when it leaves. */
export interface Throne extends Beat {
  /** Hero scroll range over which this dragon takes off. */
  exit: readonly [from: number, to: number];
  /** World-space direction of that departure. */
  away: P3;
  /**
   * Its seat on an upright screen, where seven can't stand side by side:
   * where the head goes (world, relative to the stage), how much slimmer the
   * pose gets around it, and the wings, if they need to be held differently.
   */
  narrow?: { at: P3; fit: number; wing?: Wing };
}

/** Sounds a dragon can call for. Each dragon has its own version of every one. */
export type Voice = 'roar' | 'stir' | 'impact' | 'rise' | 'flap';

/** Things a dragon does on its own while the reader lingers. */
export type Gesture = 'glance' | 'rise' | 'dip' | 'shake' | 'flick' | 'wings' | 'roar';

const GESTURE_SECONDS: Record<Gesture, number> = { glance: 2.4, rise: 2.6, dip: 2.4, shake: 1.4, flick: 2, wings: 2.6, roar: 2.1 };

/** What a dragon may ask of the rest of the production. */
export interface Stagehand {
  /** A ring of force through the picture from a point on screen (0‥1). */
  shock(x: number, y: number, strength?: number): void;
  /** A burst of light over the whole frame. */
  strobe(amount: number): void;
  /** Call a sound. */
  voice(kind: Voice, amount?: number): void;
  /** Throw the world's props about (coin rain, crystal scatter). */
  scatter(): void;
  /** A surge of light through this world: sky, floor and the dragon's edges. */
  light(amount: number): void;
  /** A shooting star across the sky. */
  meteor(): void;
  /** Shake the camera. */
  quake(amount: number): void;
  /** Put a word on screen, large, for a moment (a countdown, a warning). */
  say(text: string): void;
}

/**
 * One lighting rig for the opening shot, the way a film poster is lit: a hard
 * key from high on the left, lava glowing up from below and almost nothing in
 * between, so every body has a bright side, a shadow side and a burning edge.
 */
const POSTER = {
  keyDir: new Vector3(-0.42, 0.74, 0.52).normalize(),
  key: new Color(1.0, 0.9, 0.78).multiplyScalar(1.5),
  sky: new Color(0.02, 0.022, 0.04),
  ground: new Color(0.3, 0.09, 0.025),
  envTop: new Color(0.06, 0.07, 0.11),
  envHorizon: new Color(0.1, 0.05, 0.035),
  envBottom: new Color(0.42, 0.13, 0.03),
  /** Each dragon keeps its own colour along its edges, at this brightness. */
  rim: 0.5,
};

const tmpT = new Vector3();
const tmpD = new Vector3();
const tmpF = new Vector3();
const tmpU = new Vector3();
const WORLD_UP = new Vector3(0, 1, 0);
const STRIDE = [0, Math.PI, Math.PI, 0];
const PER_SEGMENT = 12;
/** How quickly the head and the tip of the tail catch up with the pose. */
const HEAD_SPRING = 15;
const TAIL_SPRING = 5.5;
/** Tightest the body may curl, degrees per unit: at the shoulders, at the tail. */
const BEND_NECK = 18;
const BEND_TAIL = 26;
/** How far the head may turn from the line of the neck's base, radians. */
const MAX_TURN = 1.4;

/**
 * Base for all seven dragons. A dragon does not fly a loop any more: it plays
 * a performance. Each species supplies `beats` (body poses along the film),
 * `shots` (how the camera covers them) and a `throne` in the opening shot.
 * Every frame this class resolves that pose, then runs it through a body: a
 * chain of joints on springs, so the head leads and the tail follows, bones
 * keep their length and no joint can fold. The neck bends to carry the head,
 * so the two are never out of line.
 */
export abstract class Dragon {
  readonly group = new Group();
  readonly spine: Spine;
  readonly uniforms: Record<string, IUniform>;
  ready = false;
  stagehand: Stagehand | null = null;
  /** 0‥1, spikes on click and decays. */
  rage = 0;
  /** Seconds until a blow already on its way lands (another dragon's fire). */
  private incoming = 0;
  abstract readonly beats: readonly Beat[];
  abstract readonly shots: readonly Shot[];
  abstract readonly throne: Throne;
  /** How it arrives when it is summoned. */
  abstract readonly entrance: Entrance;
  /** How thick the body is, for working out whether the pointer is on it. */
  get girth() {
    return this.bulk;
  }

  /** Colour the dragon fades into when `haze` rises. */
  protected hazeColor = new Color(0.01, 0.01, 0.014);
  /** Where along the body the ribs sit (arclength), for breathing. */
  protected chest = 3;
  /** Radial size of the whole animal: girth, skull and wings. */
  protected bulk = 1.3;
  /** Length of neck that bends to carry the head. */
  protected neck = 3.2;
  /** How far each wing beat lifts the body. */
  protected heave = 0.34;
  /** What it does with itself between lines. Repeats make a gesture likelier. */
  protected repertoire: Gesture[] = ['glance', 'rise', 'dip', 'shake', 'flick'];
  /** 0‥1 once the pointer is on this dragon. */
  hover = 0;
  /** 0‥1: how closely it follows the pointer wherever it goes, not only when it's on it. */
  protected watch = 0;
  /** Not in the picture yet (still under the gold, not yet built): the camera shouldn't look for it. */
  offstage = false;
  private dimmed = 0;
  private readonly headForward = new Vector3(0, 0, 1);
  private readonly headUp = new Vector3(0, 1, 0);
  private readonly headVel = new Vector3();
  private readonly cursor = new Vector3();
  private readonly seatHead = new Vector3();
  protected wingPhase = 0;
  protected gait = 0;
  /** Joint state of the chain: positions and velocities. */
  private readonly joints: Float32Array;
  private readonly speed: Float32Array;
  private fresh = true;
  private readonly lastHead = new Vector3();
  private gesture: Gesture | null = null;
  private gestureT = 0;
  private gestureEnv = 0;
  private gestureAt = 2 + Math.random() * 5;
  private calm = 0;
  private glanceX = 0;
  private glanceY = 0;
  private waveT = 1;
  protected stride = 0;
  /** How fast the head is travelling, units per second, and which way. */
  protected headSpeed = 0;
  protected readonly drift = new Vector3();
  /** How wide the jaws are thrown open, beyond what the scene asks for (0‥1). */
  protected gape = 0;
  /** Scene progress on the previous frame, so moments fire once. */
  private lastP = 0;
  private lastEntry = -1;
  private entryBeats: readonly Beat[] = [];
  private jumping = false;
  private blinkAt = 2;
  protected readonly lookTarget = new Vector3();
  protected readonly acting: Acting;
  private readonly dense: Float32Array;
  private readonly neckPath: Float32Array;
  /** The program a material swaps to once the dragon has finished dissolving in. */
  private readonly lean = new Map<Material, ShaderMaterial>();
  private readonly swaps: [Mesh, Material, ShaderMaterial][] = [];
  private whole = false;
  private readonly posterRim: Color;
  /** How far the lights have moved to the poster rig. */
  private lit = 0;

  constructor(
    readonly species: Species,
    readonly stage: number,
    length: number,
    samples: number,
    private readonly lighting: Lighting,
    points = 12,
  ) {
    this.spine = new Spine(samples, length);
    this.acting = new Acting(points);
    this.dense = new Float32Array(points * PER_SEGMENT * 3 + 3);
    this.neckPath = new Float32Array(this.dense.length);
    this.joints = new Float32Array(points * 3);
    this.speed = new Float32Array(points * 3);
    this.uniforms = {
      uSpine: { value: this.spine.texture },
      uSpineCount: { value: samples },
      uSpineLen: { value: length },
      uJaw: { value: 0.05 },
      uLegs: { value: new Vector4() },
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uPulse: { value: 0 },
      uWave: { value: 0 },
      uOpen: { value: 0 },
      uReveal: { value: 1 },
      uEyeOpen: { value: 1 },
      uBlink: { value: 0 },
      uRage: { value: 0 },
      uHeat: { value: 0 },
      uFlap: { value: 0 },
      uFold: { value: 0 },
      uSweep: { value: 0.3 },
      uLevel: { value: 0 },
      uHaze: { value: new Vector4(0, 0, 0, 0) },
      uKeyDir: { value: lighting.keyDir.clone().normalize() },
      uKeyColor: { value: lighting.key.clone() },
      uSkyColor: { value: lighting.sky.clone() },
      uGroundColor: { value: lighting.ground.clone() },
      uRimColor: { value: lighting.rim.clone() },
      uEnvTop: { value: lighting.envTop.clone() },
      uEnvHorizon: { value: lighting.envHorizon.clone() },
      uEnvBottom: { value: lighting.envBottom.clone() },
    };
    this.posterRim = lighting.rim.clone().multiplyScalar(POSTER.rim / Math.max(lighting.rim.r, lighting.rim.g, lighting.rim.b));
    this.group.visible = false;
    this.group.name = species;
  }

  abstract build(result: BlueprintResult): void;
  /** Species-specific flourishes on top of the shared performance. */
  protected abstract act(ctx: FrameContext): void;

  /** Last chance to change the pose before the spine is rebuilt. */
  protected adjust(_ctx: FrameContext) {}

  /** A gesture has begun: each dragon answers it with its own effects. */
  protected onGesture(_kind: Gesture, _ctx: FrameContext) {}

  /** The entrance is playing (0‥1): call its moments with `beat`. */
  protected entering(_t: number, _ctx: FrameContext) {}

  /** True on the one frame the film scrolls forward past `at`. */
  protected cue(at: number, ctx: FrameContext) {
    return ctx.entry < 0 && ctx.scene === this.stage && this.lastP < at && ctx.p >= at;
  }

  /** True on the one frame the entrance passes `at`. */
  protected beat(at: number, ctx: FrameContext) {
    return this.lastEntry < at && ctx.entry >= at;
  }

  /** A hard cut in an entrance: the body is in its new pose on the next frame. */
  protected jump() {
    this.jumping = true;
  }

  /**
   * Get ready to make an entrance that ends on the film at `land`. The last
   * pose and the last camera key become that exact moment of the film, so the
   * scene hands over with no seam at all.
   */
  prepare(land: number) {
    const e = this.entrance;
    perform(this.beats, land, this.acting);
    this.entryBeats = [...e.beats, freeze(this.acting)];
    this.lastEntry = -1;
    this.jump();
    this.gesture = null;
    this.gestureEnv = 0;
    const rig = makeRig();
    film(this.shots, land, rig);
    const lastTake = e.takes[e.takes.length - 1];
    const landing: Shot = { at: 1, pos: rig.pos.toArray(), look: rig.look.toArray(), fov: rig.fov, roll: rig.roll };
    return [...e.takes.slice(0, -1), [...lastTake, landing]];
  }

  /** Click reaction. Subclasses add their own flourish; `loud` says whether it may make a sound. */
  provoke(_ctx: FrameContext, _loud = true) {
    this.rage = 1;
  }

  /** Hit by something that takes `seconds` to reach it: it flares as it lands. */
  struck(seconds: number) {
    if (this.incoming <= 0) this.incoming = seconds;
  }

  /** How far this dragon has left the opening shot (Ignis never leaves). */
  private departure(ctx: FrameContext) {
    if (this.stage === 0) return 0;
    return smootherstep(this.throne.exit[0], this.throne.exit[1], ctx.hero);
  }

  update(ctx: FrameContext) {
    const mine = ctx.scene === this.stage;
    const away = this.departure(ctx);
    const seated = ctx.scene === 0 && ctx.conclave > 0.001 && away < 1;
    const visible = this.ready && (mine || seated);
    if (visible && !this.group.visible) this.fresh = true;
    this.group.visible = visible;
    if (!visible) return;
    if (this.jumping) this.fresh = true;
    this.jumping = false;
    this.rage = Math.max(0, this.rage - ctx.dt * 0.45);
    if (this.incoming > 0) {
      this.incoming -= ctx.dt;
      if (this.incoming <= 0) this.rage = 1;
    }
    this.behave(ctx, mine);
    this.hover = damp(this.hover, ctx.focus === this.stage ? 1 : 0, 7, ctx.dt);
    this.dimmed = damp(this.dimmed, ctx.focus >= 0 && ctx.focus !== this.stage ? 1 : 0, 6, ctx.dt);
    const u = this.uniforms;
    u.uTime.value = ctx.time;
    u.uReveal.value = mine && ctx.scene !== 0 ? 1 : ctx.reveal * (1 - away);
    // its eyes go with it as it leaves the opening shot; in its own chapter they are open
    u.uEyeOpen.value = ctx.eyes * (mine && ctx.scene !== 0 ? 1 : 1 - away);
    u.uRage.value = Math.max(this.rage, this.hover * 0.42, this.gesture === 'roar' ? this.gestureEnv * 0.85 : 0);
    u.uPulse.value = mine ? ctx.pulse : 0;
    // in the line-up the wings sit level, and let go as the dragon takes off
    u.uLevel.value = seated && !mine ? 1 - smoothstep(0, 0.6, away) : 0;
    this.relight(ctx.conclave);
    this.compose(ctx, mine, seated, away);
    this.spine.up.copy(this.acting.up);
    this.adjust(ctx);
    this.idle(ctx);
    this.simulate(ctx.dt);
    this.aim(ctx);
    this.breathe(ctx);
    this.lay(ctx);
    this.expression(ctx);
    if (ctx.entry >= 0) this.entering(ctx.entry, ctx);
    this.act(ctx);
    this.settle((u.uReveal.value as number) >= 1);
    this.lastP = ctx.scene === this.stage ? ctx.p : 0;
    this.lastEntry = ctx.entry;
    this.fresh = false;
  }

  /** The opening shot has its own lights; each world has the dragon's own. */
  private relight(c: number) {
    if (c === this.lit) return;
    this.lit = c;
    const u = this.uniforms;
    const l = this.lighting;
    (u.uKeyDir.value as Vector3).lerpVectors(l.keyDir, POSTER.keyDir, c).normalize();
    (u.uKeyColor.value as Color).lerpColors(l.key, POSTER.key, c);
    (u.uSkyColor.value as Color).lerpColors(l.sky, POSTER.sky, c);
    (u.uGroundColor.value as Color).lerpColors(l.ground, POSTER.ground, c);
    (u.uRimColor.value as Color).lerpColors(l.rim, this.posterRim, c);
    (u.uEnvTop.value as Color).lerpColors(l.envTop, POSTER.envTop, c);
    (u.uEnvHorizon.value as Color).lerpColors(l.envHorizon, POSTER.envHorizon, c);
    (u.uEnvBottom.value as Color).lerpColors(l.envBottom, POSTER.envBottom, c);
  }

  /** While the reader lingers the dragon doesn't freeze: it finds things to do. */
  private behave(ctx: FrameContext, mine: boolean) {
    const dt = ctx.dt;
    this.calm = Math.abs(ctx.velocity) < 0.35 ? this.calm + dt : 0;
    if (this.gesture) {
      this.gestureT += dt / GESTURE_SECONDS[this.gesture];
      const g = this.gestureT;
      this.gestureEnv = g < 0.2 ? smoothstep(0, 0.2, g) : 1 - smoothstep(0.66, 1, g);
      if (g >= 1) {
        this.gesture = null;
        this.gestureEnv = 0;
      }
    } else if (this.calm > 0.8 && ctx.time > this.gestureAt && ctx.reveal >= 1 && ctx.entry < 0) {
      this.gestureAt = ctx.time + 2.6 + Math.random() * (mine ? 3.4 : 7);
      // nobody roars in the line-up: a dragon there would be breathing fire into the lens
      const options = mine && ctx.conclave < 0.5 ? this.repertoire : this.repertoire.filter((g) => g !== 'roar');
      const pick = options[Math.floor(Math.random() * options.length)];
      this.gesture = pick;
      this.gestureT = 0;
      this.glanceX = (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 9);
      this.glanceY = -3 + Math.random() * 7;
      if (pick !== 'glance') this.waveT = 0;
      if (mine) this.onGesture(pick, ctx);
    }
    if (this.waveT < 1) this.waveT += dt * 0.8;
    this.uniforms.uWave.value = this.waveT < 1 ? this.waveT : 0;
  }

  /** Blend the film with the throne, then place the pose in the world. */
  private compose(ctx: FrameContext, mine: boolean, seated: boolean, away: number) {
    const out = this.acting;
    const c = ctx.center;
    if (seated && mine) {
      // Ignis steps out of the line-up into its own film
      const k = smoothstep(0.08, 1, ctx.hero);
      between(this.throne, this.beats[0], k, out);
      this.seat(out, ctx.aspect, 1 - k);
    } else if (seated) {
      hold(this.throne, out);
      this.seat(out, ctx.aspect, 1);
      const a = this.throne.away;
      for (const q of out.ctrl) {
        q.x += a[0] * away * 40;
        q.y += a[1] * away * 40;
        q.z += a[2] * away * 40;
      }
    } else {
      perform(ctx.entry >= 0 ? this.entryBeats : this.beats, ctx.entry >= 0 ? ctx.entry : ctx.p, out);
    }
    for (const q of out.ctrl) q.add(c);
    if (out.lookWeight > 0) out.look.add(c);
  }

  /**
   * The line-up is staged for a wide screen, and a narrower one closes the
   * ranks. An upright screen has its own seat for each dragon: the pose keeps
   * its shape, a little slimmer, and the head goes where the phone picture
   * has room for it. `weight` 0 leaves the pose alone.
   */
  private seat(out: Acting, aspect: number, weight: number) {
    const wide = lerp(1, clamp(aspect / 1.6, 0.42, 1), weight);
    const narrow = this.throne.narrow;
    // only upright screens: any window wider than it is tall keeps the wide line-up
    const tall = narrow ? (1 - smoothstep(0.62, 0.9, aspect)) * weight : 0;
    const head = this.seatHead.copy(out.ctrl[0]);
    for (const q of out.ctrl) {
      const x = q.x * wide;
      if (!narrow || tall <= 0) {
        q.x = x;
        continue;
      }
      const [ax, ay, az] = narrow.at;
      q.x = lerp(x, ax + (q.x - head.x) * narrow.fit, tall);
      q.y += (ay - head.y) * tall;
      q.z += (az - head.z) * tall;
    }
    const w = narrow?.wing;
    if (w && tall > 0) {
      out.flapBase = lerp(out.flapBase, w[0], tall);
      out.flapAmp = lerp(out.flapAmp, w[1], tall);
      out.sweep = lerp(out.sweep, w[3], tall);
      out.fold = lerp(out.fold, w[4], tall);
    }
  }

  /** The ribs swell and settle; the whole animal is sized by `bulk`. */
  private breathe(ctx: FrameContext) {
    const { scale, count, length } = this.spine;
    const inhale = Math.sin(ctx.time * 1.35) * 0.024 + Math.sin(ctx.time * 0.61) * 0.012;
    const span = length * 0.16;
    for (let i = 0; i < count; i++) {
      const s = (i / (count - 1)) * length;
      const d = (s - this.chest) / span;
      scale[i] = this.bulk * (1 + inhale * Math.exp(-d * d));
    }
  }

  /** A slow wave runs down the body, and wing beats lift the chest. */
  private idle(ctx: FrameContext) {
    const a = this.acting;
    const t = ctx.time;
    const n = a.ctrl.length;
    const seed = this.stage * 7.3;
    const lift = -Math.cos(this.wingPhase) * a.flapAmp * this.heave;
    // the pointer draws a dragon's head toward it
    const reach = Math.max(this.hover * 0.5, this.watch * 1.4);
    const g = this.gesture;
    const e = this.gestureEnv;
    const f = this.headForward;
    const lunge = g === 'roar' ? Math.sin((this.gestureT - 0.3) * Math.PI * 1.5) : 0;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const k = a.sway * (0.1 + s * 1.05);
      const w = t * 0.85 - s * 5.2 + seed;
      const q = a.ctrl[i];
      q.x += Math.sin(w) * k;
      q.y += Math.cos(w * 0.8 + 1.1) * k * 0.7;
      q.z += Math.sin(w * 1.2 + 2.3) * k * 0.8;
      // strongest at the shoulders: the head stays steady, like a bird's
      q.y += lift * Math.exp(-Math.pow((s - 0.3) / 0.26, 2));
      const near = Math.exp(-s * 7);
      q.x += ctx.pointer.x * reach * near;
      q.y += ctx.pointer.y * reach * near;
      if (e <= 0) continue;
      if (g === 'rise') q.y += e * 1.6 * near;
      else if (g === 'dip') q.y -= e * 1.3 * near;
      else if (g === 'shake') {
        q.x += Math.sin(t * 15) * e * 0.42 * near;
        q.z += Math.cos(t * 12) * e * 0.22 * near;
      } else if (g === 'flick') {
        const wave = this.gestureT * 15 - s * 17;
        const amount = e * 1.5 * Math.min(1, s * 2) ** 2;
        q.x += Math.sin(wave) * amount;
        q.y += Math.cos(wave * 0.7) * amount * 0.5;
      } else if (g === 'roar') {
        // draws back, then throws the head forward
        q.y += e * 0.7 * near;
        q.addScaledVector(f, e * lunge * 1.1 * near);
      }
    }
  }

  /**
   * The body. Each joint is a critically damped spring on its posed position,
   * loosest at the tail, so motion starts at the head and drags down the body
   * with no sudden starts or stops. Bones then keep their length and no joint
   * may bend past what the animal's girth allows.
   */
  private simulate(dt: number) {
    const { ctrl, rest } = this.acting;
    const n = ctrl.length;
    const p = this.joints;
    const v = this.speed;
    if (this.fresh) {
      for (let i = 0; i < n; i++) {
        p[i * 3] = ctrl[i].x;
        p[i * 3 + 1] = ctrl[i].y;
        p[i * 3 + 2] = ctrl[i].z;
      }
      v.fill(0);
      this.spine.reset();
      this.lastHead.copy(ctrl[0]);
    } else {
      const steps = dt > 1 / 70 ? 2 : 1;
      const h = dt / steps;
      for (let step = 0; step < steps; step++) {
        let along = 0;
        for (let i = 0; i < n; i++) {
          // poses run on past the tip of the tail; only the body itself counts
          if (i > 0) along += rest[i - 1];
          const w = lerp(HEAD_SPRING, TAIL_SPRING, clamp(along / this.spine.length));
          const o = i * 3;
          for (let c = 0; c < 3; c++) {
            const target = c === 0 ? ctrl[i].x : c === 1 ? ctrl[i].y : ctrl[i].z;
            v[o + c] += (w * w * (target - p[o + c]) - 2 * w * v[o + c]) * h;
            p[o + c] += v[o + c] * h;
          }
        }
      }
    }
    // walk down the body: every bone at its length, every bend within reach
    let ax = 0, ay = 0, az = 0;
    let run = 0;
    for (let i = 1; i < n; i++) {
      const o = i * 3;
      const l = rest[i - 1];
      run += l;
      let dx = p[o] - p[o - 3];
      let dy = p[o + 1] - p[o - 2];
      let dz = p[o + 2] - p[o - 1];
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      if (i > 1) {
        const cos = clamp(dx * ax + dy * ay + dz * az, -1, 1);
        const th = Math.acos(cos);
        const s = clamp(run / this.spine.length);
        const most = ((BEND_NECK + (BEND_TAIL - BEND_NECK) * s * s) * Math.PI / 180) * l;
        if (th > most) {
          const k = Math.sin(most) / Math.sin(th);
          const q = Math.sin(th - most) / Math.sin(th);
          const bx = ax * q + dx * k, by = ay * q + dy * k, bz = az * q + dz * k;
          const bl = Math.hypot(bx, by, bz) || 1;
          dx = bx / bl;
          dy = by / bl;
          dz = bz / bl;
        }
      }
      ax = dx;
      ay = dy;
      az = dz;
      p[o] = p[o - 3] + dx * l;
      p[o + 1] = p[o - 2] + dy * l;
      p[o + 2] = p[o - 1] + dz * l;
    }
    for (let i = 0; i < n; i++) ctrl[i].set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }

  /** Where the head wants to point. It leads, the neck bends to follow it. */
  private aim(ctx: FrameContext) {
    const a = this.acting;
    const t = ctx.time;
    const dt = ctx.dt;
    const head = a.ctrl[0];
    const look = this.lookTarget.copy(ctx.camera.position);
    if (a.lookWeight > 0) look.lerp(a.look, a.lookWeight);
    // a living eyeline: it wanders a little, nods on stressed words, finds the pointer
    if (this.gesture === 'glance') {
      look.x += this.glanceX * this.gestureEnv;
      look.y += this.glanceY * this.gestureEnv;
    }
    look.x += noise1(t * 0.37 + this.stage * 3) * 1.6 + ctx.pointer.x * 5;
    look.y += noise1(t * 0.29 + this.stage * 5) * 0.9 + ctx.pointer.y * 3 + ctx.speaking * Math.sin(t * 3.3) * 0.5;
    const follow = Math.max(this.hover, this.watch);
    if (follow > 0.01) {
      const d = ctx.camera.position.distanceTo(head);
      this.cursor.copy(ctx.camera.position).addScaledVector(ctx.ray, d * 0.8);
      look.lerp(this.cursor, follow);
    }
    const want = tmpD.copy(look).sub(head).normalize();
    // the line of the body where the neck meets it
    let k = 1;
    for (let run = a.rest[0]; k < a.rest.length - 1 && run < this.neck; k++) run += a.rest[k];
    const base = tmpF.copy(a.ctrl[k]).sub(a.ctrl[k + 1]).normalize();
    const angle = base.angleTo(want);
    if (angle > MAX_TURN) want.lerp(base, 1 - MAX_TURN / angle).normalize();
    if (this.fresh) {
      this.headForward.copy(want);
      this.headVel.set(0, 0, 0);
    } else {
      // a spring, so the head eases into and out of every turn
      const w = 8.5;
      tmpU.copy(want).sub(this.headForward).multiplyScalar(w * w).addScaledVector(this.headVel, -2 * w);
      this.headVel.addScaledVector(tmpU, dt);
      this.headForward.addScaledVector(this.headVel, dt).normalize();
    }
    // mostly world-up: a real head levels itself
    tmpU.copy(WORLD_UP).addScaledVector(this.headForward, -WORLD_UP.dot(this.headForward));
    if (tmpU.lengthSq() > 0.01) this.headUp.lerp(tmpU.normalize(), this.fresh ? 1 : 1 - Math.exp(-7 * dt));
    this.headUp.addScaledVector(this.headForward, -this.headUp.dot(this.headForward)).normalize();
  }

  /** Curve → neck → spine. The neck is rebuilt so it runs straight into the skull. */
  private lay(ctx: FrameContext) {
    const m = catmullRom(this.acting.ctrl, PER_SEGMENT, this.dense);
    this.bendNeck(m);
    this.relax(m);
    this.spine.n0.copy(this.headUp);
    this.spine.ease = 1 - Math.exp(-ctx.dt * 8);
    this.spine.fromPoints(this.dense, m);
  }

  /**
   * A curve through joints bends hardest at the joints. A few passes of a
   * small filter along the body spread that out into one long, even arc, the
   * way a spine really curves, and the inside of a bend stops folding.
   */
  private relax(m: number) {
    const d = this.dense;
    for (let pass = 0; pass < 5; pass++) {
      let px = d[0], py = d[1], pz = d[2];
      for (let i = 1; i < m - 1; i++) {
        const o = i * 3;
        // the first samples stay put: that is where the skull is bolted on
        const w = 0.5 * clamp((i - 2) / 6);
        const x = d[o], y = d[o + 1], z = d[o + 2];
        d[o] = x + ((px + d[o + 3]) * 0.5 - x) * w;
        d[o + 1] = y + ((py + d[o + 4]) * 0.5 - y) * w;
        d[o + 2] = z + ((pz + d[o + 5]) * 0.5 - z) * w;
        px = x;
        py = y;
        pz = z;
      }
    }
  }

  /**
   * Rebuilds the start of the curve as a neck that turns evenly along its
   * length: it leaves the skull exactly along the line of the head and arrives
   * at the shoulders along the line of the body. Head tracking becomes the
   * whole neck turning, with no joint in sight.
   */
  private bendNeck(m: number) {
    const d = this.dense;
    const walk = this.neckPath;
    let run = 0;
    let j = 1;
    for (; j < m - 1; j++) {
      const o = j * 3;
      run += Math.hypot(d[o] - d[o - 3], d[o + 1] - d[o - 2], d[o + 2] - d[o - 1]);
      if (run >= this.neck) break;
    }
    if (j >= m - 1 || j * 3 + 3 > walk.length) return;
    const o = j * 3;
    const f = this.headForward;
    let tx = d[o + 3] - d[o - 3], ty = d[o + 4] - d[o - 2], tz = d[o + 5] - d[o - 1];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // from "away from the snout" to "down the body", spherically
    const cos = clamp(-(f.x * tx + f.y * ty + f.z * tz), -1, 1);
    const th = Math.acos(cos);
    const sinTh = Math.sin(th) || 1e-4;
    const step = run / j;
    let px = d[0], py = d[1], pz = d[2];
    for (let i = 1; i <= j; i++) {
      const u = (i - 0.5) / j;
      const k = u * u * (3 - 2 * u);
      const wa = th > 1e-3 ? Math.sin((1 - k) * th) / sinTh : 1 - k;
      const wb = th > 1e-3 ? Math.sin(k * th) / sinTh : k;
      px += (-f.x * wa + tx * wb) * step;
      py += (-f.y * wa + ty * wb) * step;
      pz += (-f.z * wa + tz * wb) * step;
      walk[i * 3] = px;
      walk[i * 3 + 1] = py;
      walk[i * 3 + 2] = pz;
    }
    // the walk lands near the shoulders; ease the miss in along the neck
    const ex = d[o] - px, ey = d[o + 1] - py, ez = d[o + 2] - pz;
    for (let i = 1; i < j; i++) {
      const u = i / j;
      const w = u * u * (3 - 2 * u);
      d[i * 3] = walk[i * 3] + ex * w;
      d[i * 3 + 1] = walk[i * 3 + 1] + ey * w;
      d[i * 3 + 2] = walk[i * 3 + 2] + ez * w;
    }
  }

  /** Blinking, the speaking jaw, wings, legs and atmosphere. */
  private expression(ctx: FrameContext) {
    const u = this.uniforms;
    const a = this.acting;
    const t = ctx.time;
    const dt = ctx.dt;

    if (t > this.blinkAt) this.blinkAt = t + 2.4 + Math.random() * 3.6;
    const since = this.blinkAt - t;
    u.uBlink.value = 1 - clamp(Math.abs(since - 0.09) / 0.09);

    const talk = ctx.speaking * (ctx.scene === this.stage ? 1 : 0);
    const syllable = Math.abs(noise1(t * 7.5 + this.stage * 9)) * 0.9 + Math.abs(noise1(t * 13.1)) * 0.25;
    const roaring = this.gesture === 'roar' ? this.gestureEnv : 0;
    const jaw = Math.max(a.jaw + talk * (0.05 + syllable * 0.34) + this.rage * 0.5 + this.hover * 0.14 + roaring * 0.7, this.gape * 0.48);
    u.uJaw.value = damp(u.uJaw.value as number, jaw, 16, dt);

    this.wingPhase += dt * (a.flapRate + this.rage * 3);
    // a stretch: wings lifted high and held nearly still
    const stretch = this.gesture === 'wings' ? this.gestureEnv : 0;
    u.uFlap.value = a.flapBase + stretch * 0.34 + Math.sin(this.wingPhase) * a.flapAmp * (1 - stretch * 0.6);
    // the hand lags the arm: the wing whips through the air instead of hinging
    u.uFold.value = a.fold * Math.sin(this.wingPhase - 1.15);
    u.uSweep.value = a.sweep - stretch * 0.22;

    // feet only move when the body does
    const moved = a.ctrl[0].distanceTo(this.lastHead) / Math.max(dt, 1e-3);
    this.drift.copy(a.ctrl[0]).sub(this.lastHead).divideScalar(Math.max(dt, 1e-3));
    this.lastHead.copy(a.ctrl[0]);
    this.headSpeed = damp(this.headSpeed, moved, 8, dt);
    this.gait = damp(this.gait, clamp(moved / 2.2), 6, dt);
    this.stride += dt * moved * 1.5;
    const legs = u.uLegs.value as Vector4;
    const reach = 0.5 * a.walk * this.gait;
    const set = (i: number) => this.legRest(i) + Math.sin(this.stride + STRIDE[i]) * reach;
    legs.set(set(0), set(1), set(2), set(3));

    const haze = u.uHaze.value as Vector4;
    // on a narrow screen there is no room beside the text, so it sinks further back
    const behind = ctx.aspect < 1 && ctx.scene === this.stage ? smoothstep(0, 0.4, ctx.page) * 0.78 * (ctx.entry < 0 ? 1 : smoothstep(0.84, 1, ctx.entry)) : 0;
    haze.set(this.hazeColor.r, this.hazeColor.g, this.hazeColor.b, Math.max(a.haze, this.dimmed * 0.5, behind));
  }

  /** Resting hip angle for leg 0‥3. */
  protected legRest(_index: number) {
    return 0.3;
  }

  protected material(vertexShader: string, fragmentShader: string, extra: Record<string, IUniform> = {}, opts: Partial<ShaderMaterial> = {}) {
    const uniforms = { ...this.uniforms, ...extra };
    const m = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, ...opts });
    if (fragmentShader.includes('SOLID')) {
      this.lean.set(m, new ShaderMaterial({ vertexShader, fragmentShader, uniforms, ...opts, defines: { ...opts.defines, SOLID: '' } }));
    }
    return m;
  }

  /**
   * A shader that can `discard` stops the chip from skipping surfaces that are
   * hidden, so it pays for every layer of the body. The dissolve is the only
   * thing that needs it: once the dragon is whole it runs without.
   */
  settle(whole: boolean) {
    if (whole === this.whole) return;
    this.whole = whole;
    for (const [mesh, dissolving, solid] of this.swaps) mesh.material = whole ? solid : dissolving;
  }

  protected add<T extends Object3D>(obj: T): T {
    obj.frustumCulled = false;
    obj.matrixAutoUpdate = false;
    obj.updateMatrix();
    this.group.add(obj);
    return obj;
  }

  protected mesh(geometry: BufferGeometry, material: Material) {
    const mesh = this.add(new Mesh(geometry, material));
    const solid = this.lean.get(material);
    if (solid) this.swaps.push([mesh, material, solid]);
    return mesh;
  }

  /** World-space point at the snout (for fire breath etc.). */
  snout(out: Vector3, ahead = 2.4) {
    this.spine.sample(0, out);
    this.facing(tmpT);
    return out.addScaledVector(tmpT, ahead * this.bulk);
  }

  /** World-space point between the jaws: `ahead` along the head, `below` under its line. */
  protected mouthAt(out: Vector3, ahead: number, below: number) {
    this.spine.sample(0, out);
    return out.addScaledVector(this.headForward, ahead * this.bulk).addScaledVector(this.headUp, -below * this.bulk);
  }

  /** World-space direction the head is pointing. */
  facing(out: Vector3) {
    return out.copy(this.headForward);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });
  }
}

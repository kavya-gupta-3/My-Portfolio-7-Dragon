import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  NormalBlending,
  Points,
  RepeatWrapping,
  ShaderMaterial,
  Sphere,
  Sprite,
  SpriteMaterial,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { mulberry32 } from '../../core/math';
import breathSource from '../shaders/fx/breath.glsl';

/** Soft, lumpy texture the puffs are cut from: a few hundred overlapping blobs. */
function puffTexture() {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const rnd = mulberry32(5);
  for (let i = 0; i < 260; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 4 + rnd() * 18;
    // drawn on all four sides too, so the texture tiles
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, `rgba(255,255,255,${0.12 + rnd() * 0.12})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** How a fire leaves its source: how fast, how wide, how much of it, how big. */
export interface FireStyle {
  speed: readonly [number, number];
  cone: readonly [number, number];
  rate: number;
  size: number;
}

/** A dragon's breath: fast, narrow and a lot of it. */
const BREATH: FireStyle = { speed: [25, 37], cone: [0.07, 0.19], rate: 300, size: 1 };

const dir = new Vector3();
const side = new Vector3();
const lift = new Vector3();
const UP = new Vector3(0, 1, 0);

/**
 * Fire breath: a stream of turbulent flame and the smoke it leaves, from
 * between a dragon's jaws. Particles are written once, when they leave the
 * mouth; their whole flight is worked out on the GPU from there.
 */
export class FireBreath {
  readonly group = new Group();
  private readonly birth: Float32Array;
  private readonly origin: Float32Array;
  private readonly vel: Float32Array;
  private readonly geo = new BufferGeometry();
  private readonly fire: ShaderMaterial;
  private readonly smoke: ShaderMaterial;
  private readonly flare: Sprite;
  private readonly rnd = mulberry32(17);
  private cursor = 0;
  private owed = 0;
  private alive = 0;

  constructor(private readonly capacity: number, core: Color, flame: Color, ember: Color, private readonly style: FireStyle = BREATH) {
    this.birth = new Float32Array(capacity).fill(-100);
    this.origin = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    const seed = new Float32Array(capacity * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = this.rnd();
    this.geo.setAttribute('position', new BufferAttribute(this.origin, 3));
    this.geo.setAttribute('aVel', new BufferAttribute(this.vel, 3));
    this.geo.setAttribute('aBirth', new BufferAttribute(this.birth, 1));
    this.geo.setAttribute('aSeed', new BufferAttribute(seed, 4));
    this.geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    const puff = puffTexture();
    const uniforms = {
      uTime: { value: 0 },
      uProj: { value: 1000 },
      uSize: { value: style.size },
      tPuff: { value: puff },
      uCore: { value: core },
      uFlame: { value: flame },
      uEmber: { value: ember },
    };
    const make = (smoke: boolean) =>
      new ShaderMaterial({
        vertexShader: `#define VERTEX\n${smoke ? '#define SMOKE\n' : ''}${breathSource}`,
        fragmentShader: `${smoke ? '#define SMOKE\n' : ''}${breathSource}`,
        uniforms,
        blending: smoke ? NormalBlending : AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
    this.smoke = make(true);
    this.fire = make(false);
    const smokePoints = new Points(this.geo, this.smoke);
    const firePoints = new Points(this.geo, this.fire);
    smokePoints.renderOrder = 5;
    firePoints.renderOrder = 6;
    this.flare = new Sprite(new SpriteMaterial({ map: glowTexture(), color: core.clone().lerp(flame, 0.4), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.flare.renderOrder = 7;
    for (const o of [smokePoints, firePoints, this.flare]) {
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.group.visible = false;
  }

  /**
   * One frame of breathing. `power` 0‥1 is how hard (0 lets the last of it burn
   * out); `drift` is how fast the head itself is moving, which the fire inherits.
   */
  update(mouth: Vector3, facing: Vector3, drift: Vector3, power: number, time: number, dt: number, camera: PerspectiveCamera, height: number) {
    const u = this.fire.uniforms;
    u.uTime.value = time;
    u.uProj.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const { speed: [slow, fast], cone: [narrow, wide], rate } = this.style;
    this.owed += power * rate * dt;
    let spawned = false;
    if (this.owed >= 1) {
      side.crossVectors(facing, UP);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      lift.crossVectors(side, facing);
      const rnd = this.rnd;
      while (this.owed >= 1) {
        this.owed -= 1;
        const i = this.cursor;
        this.cursor = (this.cursor + 1) % this.capacity;
        const a = rnd() * Math.PI * 2;
        const cone = narrow + rnd() * (wide - narrow);
        dir.copy(facing).addScaledVector(side, Math.cos(a) * cone).addScaledVector(lift, Math.sin(a) * cone - 0.04).normalize();
        const speed = (slow + rnd() * (fast - slow)) * (0.75 + power * 0.25);
        this.origin[i * 3] = mouth.x + (rnd() - 0.5) * 0.25;
        this.origin[i * 3 + 1] = mouth.y + (rnd() - 0.5) * 0.25;
        this.origin[i * 3 + 2] = mouth.z + (rnd() - 0.5) * 0.25;
        this.vel[i * 3] = dir.x * speed + drift.x * 0.6;
        this.vel[i * 3 + 1] = dir.y * speed + drift.y * 0.6;
        this.vel[i * 3 + 2] = dir.z * speed + drift.z * 0.6;
        // a few birth times spread over the frame, so the stream has no gaps
        this.birth[i] = time - rnd() * dt;
      }
      spawned = true;
      this.alive = time + 0.85;
    }
    if (spawned) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.aVel.needsUpdate = true;
      this.geo.attributes.aBirth.needsUpdate = true;
    }
    this.group.visible = time < this.alive;
    // the jaws themselves glow while it pours out
    this.flare.position.copy(mouth).addScaledVector(facing, 0.5);
    this.flare.scale.setScalar(0.9 + power * 1.1);
    this.flare.material.opacity = Math.min(0.75, power * 0.9);
    this.flare.visible = power > 0.02;
  }
}

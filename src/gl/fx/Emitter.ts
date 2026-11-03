import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Sphere, Vector3, type Color } from 'three';
import particleSource from '../shaders/fx/particles.glsl';

export const enum Kind {
  Fire = 0,
  Spark = 1,
  Glint = 2,
  Shard = 3,
  Dust = 4,
  Pixel = 5,
}

export interface EmitterPhysics {
  gravity: number;
  drag: number;
  turbulence: number;
  /** Upward lift for fire (opposes gravity as particles heat). */
  buoyancy?: number;
}

/**
 * A ring-buffer particle system simulated on the CPU (so trails stay where
 * they were emitted, unlike analytic GPU particles). Drawn as additive
 * HDR points.
 */
export class Emitter {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly state: Float32Array;
  private readonly life: Float32Array;
  private readonly material: ShaderMaterial;
  private cursor = 0;
  private live = 0;
  /** A spawn since the last upload: colours never change after that. */
  private fresh = false;

  constructor(readonly capacity: number, readonly physics: EmitterPhysics) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.state = new Float32Array(capacity * 4);
    this.life = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.state[i * 4] = 2;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(this.col, 3));
    geo.setAttribute('aState', new BufferAttribute(this.state, 4));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${particleSource}`,
      fragmentShader: particleSource,
      uniforms: { uPixelRatio: { value: 1 }, uTime: { value: 0 } },
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(p: Vector3, v: Vector3, color: Color, life: number, size: number, kind: Kind) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.state[i * 4] = 0;
    this.state[i * 4 + 1] = size;
    this.state[i * 4 + 2] = kind;
    this.state[i * 4 + 3] = Math.random();
    this.life[i] = life;
    this.live = this.capacity;
    this.fresh = true;
    this.points.visible = true;
  }

  update(dt: number, time: number, pixelRatio: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
    if (this.live === 0) {
      this.points.visible = false;
      return;
    }
    const { gravity, drag, turbulence, buoyancy = 0 } = this.physics;
    const damp = Math.exp(-drag * dt);
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const s = i * 4;
      if (this.state[s] > 1) continue;
      alive++;
      const age = this.state[s] + dt / this.life[i];
      this.state[s] = age;
      const o = i * 3;
      const px = this.pos[o], py = this.pos[o + 1], pz = this.pos[o + 2];
      let vx = this.vel[o] * damp;
      let vy = this.vel[o + 1] * damp + (buoyancy * age - gravity) * dt;
      let vz = this.vel[o + 2] * damp;
      if (turbulence > 0) {
        const ph = time * 2.3 + this.state[s + 3] * 40;
        vx += Math.sin(py * 1.7 + ph) * turbulence * dt;
        vz += Math.cos(px * 1.3 + ph * 0.8) * turbulence * dt;
        vy += Math.sin(pz * 1.1 + ph * 1.2) * turbulence * 0.5 * dt;
      }
      this.vel[o] = vx;
      this.vel[o + 1] = vy;
      this.vel[o + 2] = vz;
      this.pos[o] = px + vx * dt;
      this.pos[o + 1] = py + vy * dt;
      this.pos[o + 2] = pz + vz * dt;
    }
    this.live = alive;
    // draw nothing at all once every particle has died
    this.points.visible = alive > 0;
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aState.needsUpdate = true;
    if (this.fresh) geo.attributes.aColor.needsUpdate = true;
    this.fresh = false;
  }
}

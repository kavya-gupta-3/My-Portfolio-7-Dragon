import {
  CanvasTexture,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OctahedronGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
  type BufferGeometry,
  type IUniform,
} from 'three';
import { mulberry32 } from '../../core/math';
import { stageCenter } from '../Director';
import type { EngineFrame } from '../Engine';
import propsSource from '../shaders/fx/props.glsl';

function program(kind: 'CRYSTAL' | 'COIN', uniforms: Record<string, IUniform>, extra: Partial<ShaderMaterial> = {}) {
  return new ShaderMaterial({
    vertexShader: `#define VERTEX\n#define ${kind}\n${propsSource}`,
    fragmentShader: `#define ${kind}\n${propsSource}`,
    uniforms: { uTime: { value: 0 }, uWeight: { value: 0 }, uBurst: { value: 0 }, uCenter: { value: new Vector3() }, ...uniforms },
    ...extra,
  });
}

function instanced(base: BufferGeometry, count: number, seed: number) {
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  geo.attributes = base.attributes;
  const rnd = mulberry32(seed);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  geo.boundingSphere = new Sphere(new Vector3(), 1e5);
  return geo;
}

export function rupeeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '800 76px "Plus Jakarta Sans Variable", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₹', 64, 68);
  const t = new CanvasTexture(c);
  return t;
}

/**
 * Set dressing per world: drifting crystals around JADE and a rain of rupee
 * coins over AURUM's hoard. The floors live in `Ground`.
 */
export class Props {
  readonly crystals: Mesh;
  readonly coins: Mesh;
  private readonly crystalMat: ShaderMaterial;
  private readonly coinMat: ShaderMaterial;
  private coinBurst = 0;
  private crystalBurst = 0;

  constructor(detail: number) {
    this.crystalMat = program('CRYSTAL', {});
    this.crystals = new Mesh(instanced(new OctahedronGeometry(1, 0), Math.round(40 * detail), 3), this.crystalMat);
    this.crystals.frustumCulled = false;

    this.coinMat = program('COIN', { tRupee: { value: rupeeTexture() } });
    this.coins = new Mesh(instanced(new CylinderGeometry(1, 1, 0.14, 24, 1), Math.round(70 * detail), 7), this.coinMat);
    this.coins.frustumCulled = false;
  }

  /** Extra coins on demand (Aurum provoked / achievements). */
  shower() {
    this.coinBurst = 1;
  }

  scatter() {
    this.crystalBurst = 1;
  }

  update(f: EngineFrame) {
    const w = f.weights;
    this.coinBurst = Math.max(0, this.coinBurst - f.dt * 0.4);
    this.crystalBurst = Math.max(0, this.crystalBurst - f.dt * 0.6);
    const set = (m: ShaderMaterial, weight: number, stage: number, burst = 0) => {
      m.uniforms.uTime.value = f.time;
      m.uniforms.uWeight.value = weight;
      m.uniforms.uBurst.value = burst;
      stageCenter(stage, m.uniforms.uCenter.value);
    };
    set(this.crystalMat, w[3], 3, this.crystalBurst);
    this.crystals.visible = w[3] > 0.01;
    set(this.coinMat, w[4], 4, this.coinBurst);
    this.coins.visible = w[4] > 0.01;
  }
}

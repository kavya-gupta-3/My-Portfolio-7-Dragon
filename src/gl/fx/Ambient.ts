import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Sphere, Vector3 } from 'three';
import { mulberry32 } from '../../core/math';
import { GAP, STAGE_COUNT } from '../Director';
import type { EngineFrame } from '../Engine';
import ambientSource from '../shaders/fx/ambient.glsl';

/**
 * The stage-aware GPU particle atmosphere. Seeds are grouped by world, so a
 * single draw range shows only the cloud around the current dragon: the
 * other six worlds cost nothing at all.
 */
export class Ambient {
  readonly points: Points;
  private readonly material: ShaderMaterial;
  private speed = 1;

  constructor(private readonly perWorld: number) {
    const rnd = mulberry32(99);
    const count = perWorld * STAGE_COUNT;
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = (Math.floor(i / perWorld) + 0.5) / STAGE_COUNT;
      for (let k = 1; k < 4; k++) seeds[i * 4 + k] = rnd();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 4));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${ambientSource}`,
      fragmentShader: ambientSource,
      uniforms: {
        uTime: { value: 0 },
        uGap: { value: GAP },
        uPixelRatio: { value: 1 },
        uSize: { value: 1 },
        uCam: { value: new Vector3() },
        uPhase: { value: 0 },
      },
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  update(f: EngineFrame) {
    this.points.geometry.setDrawRange(f.scene * this.perWorld, this.perWorld);
    const u = this.material.uniforms;
    u.uTime.value = f.time;
    u.uPixelRatio.value = f.pixelRatio;
    u.uSize.value = f.aspect < 1 ? 0.8 : 1;
    // embers rush upward while the reader scrolls fast
    this.speed += (1 + Math.min(4, Math.abs(f.velocity) * 0.08) - this.speed) * Math.min(1, f.dt * 3);
    u.uPhase.value += f.dt * this.speed;
  }
}

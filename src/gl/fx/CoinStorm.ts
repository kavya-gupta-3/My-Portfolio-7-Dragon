import { CylinderGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial, Sphere, Vector3, type Texture } from 'three';
import { mulberry32 } from '../../core/math';
import stormSource from '../shaders/fx/storm.glsl';

/**
 * The hoard lifting into a spiral of coins and then going off like a bomb,
 * for AURUM's entrance. One draw for every coin; nothing at all when it's off.
 */
export class CoinStorm {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private turn = 0;

  constructor(center: Vector3, rupee: Texture, count: number) {
    const coin = new CylinderGeometry(1, 1, 0.14, 20, 1);
    const geo = new InstancedBufferGeometry();
    geo.index = coin.index;
    geo.attributes = coin.attributes;
    const rnd = mulberry32(29);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
    geo.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${stormSource}`,
      fragmentShader: stormSource,
      uniforms: {
        uCenter: { value: center },
        uRise: { value: 0 },
        uTurn: { value: 0 },
        uBlast: { value: 0 },
        uTime: { value: 0 },
        uShine: { value: 1 },
        tRupee: { value: rupee },
      },
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** `rise` 0‥1 lifts the hoard, `speed` turns the spiral, `blast` 0‥ throws it all out. */
  update(rise: number, speed: number, blast: number, time: number, dt: number) {
    this.mesh.visible = rise > 0.001 && blast < 1.6;
    if (!this.mesh.visible) {
      this.turn = 0;
      return;
    }
    this.turn += speed * dt;
    const u = this.material.uniforms;
    u.uRise.value = rise;
    u.uTurn.value = this.turn;
    u.uBlast.value = blast;
    u.uTime.value = time;
  }
}

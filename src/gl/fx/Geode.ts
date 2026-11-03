import { BufferAttribute, BufferGeometry, Color, DoubleSide, IcosahedronGeometry, Mesh, ShaderMaterial, Sphere, Vector3 } from 'three';
import { mulberry32 } from '../../core/math';
import geodeSource from '../shaders/fx/geode.glsl';

/** Half its width, height and depth. Big enough to hold a dragon curled up. */
const SIZE = new Vector3(9, 8, 8.6);

/**
 * A giant faceted crystal, shaped like an egg and only there for JADE's
 * entrance. It costs nothing until then: it isn't drawn.
 */
export class Geode {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(center: Vector3, gem: Color, gemHi: Color) {
    const rnd = mulberry32(61);
    const base = new IcosahedronGeometry(1, 3);
    const raw = base.attributes.position;
    const count = raw.count;
    // a corner shared by several facets has to move with all of them
    const moved = new Map<string, Vector3>();
    const pos = new Float32Array(count * 3);
    const v = new Vector3();
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(raw, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let at = moved.get(key);
      if (!at) {
        at = v.clone().multiplyScalar(0.9 + rnd() * 0.2).multiply(SIZE);
        moved.set(key, at);
      }
      at.toArray(pos, i * 3);
    }
    const centroid = new Float32Array(count * 3);
    const bary = new Float32Array(count * 3);
    const seed = new Float32Array(count * 3);
    for (let t = 0; t < count; t += 3) {
      const s = [rnd(), rnd(), rnd()];
      for (let c = 0; c < 3; c++) {
        const mid = (pos[t * 3 + c] + pos[(t + 1) * 3 + c] + pos[(t + 2) * 3 + c]) / 3;
        for (let k = 0; k < 3; k++) {
          centroid[(t + k) * 3 + c] = mid;
          bary[(t + k) * 3 + c] = k === c ? 1 : 0;
          seed[(t + k) * 3 + c] = s[c];
        }
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aCentroid', new BufferAttribute(centroid, 3));
    geo.setAttribute('aBary', new BufferAttribute(bary, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 3));
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    base.dispose();
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${geodeSource}`,
      fragmentShader: geodeSource,
      uniforms: {
        uCenter: { value: center },
        uGem: { value: gem },
        uGemHi: { value: gemHi },
        uHeart: { value: 0 },
        uCrack: { value: 0 },
        uBurst: { value: 0 },
        uFade: { value: 1 },
      },
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  set(heart: number, crack: number, burst: number, fade: number) {
    const u = this.material.uniforms;
    u.uHeart.value = heart;
    u.uCrack.value = crack;
    u.uBurst.value = burst;
    u.uFade.value = fade;
  }
}

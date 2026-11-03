import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Mesh, ShaderMaterial, Sphere, Vector2, Vector3 } from 'three';
import lightningSource from '../shaders/fx/lightning.glsl';

interface Bolt {
  life: number;
  max: number;
  width: number;
  flicker: number;
}

const tmp = new Vector3();

/**
 * Pool of jagged lightning bolts (midpoint displacement), rendered as
 * screen-space ribbons with additive HDR colour.
 */
export class Lightning {
  readonly mesh: Mesh;
  private readonly bolts: Bolt[];
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly next: Float32Array;
  private readonly prev: Float32Array;
  private readonly info: Float32Array;
  private readonly material: ShaderMaterial;
  private cursor = 0;
  private readonly path: Vector3[];

  constructor(readonly count: number, readonly points = 28, color = new Color(0.4, 0.9, 1.0)) {
    this.n = points;
    const verts = count * points * 2;
    this.pos = new Float32Array(verts * 3);
    this.next = new Float32Array(verts * 3);
    this.prev = new Float32Array(verts * 3);
    this.info = new Float32Array(verts * 2);
    const side = new Float32Array(verts);
    const index: number[] = [];
    for (let b = 0; b < count; b++) {
      for (let i = 0; i < points; i++) {
        const v = (b * points + i) * 2;
        side[v] = -1;
        side[v + 1] = 1;
        if (i < points - 1) index.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    this.bolts = Array.from({ length: count }, () => ({ life: 0, max: 1, width: 2, flicker: 0 }));
    this.path = Array.from({ length: points }, () => new Vector3());
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aNext', new BufferAttribute(this.next, 3));
    geo.setAttribute('aPrev', new BufferAttribute(this.prev, 3));
    geo.setAttribute('aSide', new BufferAttribute(side, 1));
    geo.setAttribute('aInfo', new BufferAttribute(this.info, 2));
    geo.setIndex(index);
    geo.boundingSphere = new Sphere(new Vector3(), 1e5);
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${lightningSource}`,
      fragmentShader: lightningSource,
      uniforms: { uResolution: { value: new Vector2(1, 1) }, uColor: { value: color } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  /** Fire a bolt from a to b. `rough` = displacement relative to length. */
  strike(a: Vector3, b: Vector3, opts: { life?: number; width?: number; rough?: number } = {}) {
    const k = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const bolt = this.bolts[k];
    bolt.life = 0;
    bolt.max = opts.life ?? 0.25;
    bolt.width = opts.width ?? 2.5;
    bolt.flicker = Math.random() * 10;
    const n = this.n;
    const p = this.path;
    p[0].copy(a);
    p[n - 1].copy(b);
    const len = a.distanceTo(b);
    const rough = (opts.rough ?? 0.22) * len;
    // recursive midpoint displacement on index ranges
    const stack: [number, number, number][] = [[0, n - 1, rough]];
    while (stack.length) {
      const [i0, i1, r] = stack.pop()!;
      if (i1 - i0 < 2) continue;
      const m = (i0 + i1) >> 1;
      p[m].lerpVectors(p[i0], p[i1], 0.5);
      p[m].x += (Math.random() - 0.5) * r;
      p[m].y += (Math.random() - 0.5) * r;
      p[m].z += (Math.random() - 0.5) * r;
      stack.push([i0, m, r * 0.55], [m, i1, r * 0.55]);
    }
    // fill any untouched points linearly
    for (let i = 1; i < n - 1; i++) if (p[i].lengthSq() === 0) p[i].lerpVectors(a, b, i / (n - 1));
    for (let i = 0; i < n; i++) {
      const v = (k * n + i) * 2;
      const nx = p[Math.min(n - 1, i + 1)];
      const pv = p[Math.max(0, i - 1)];
      for (let s = 0; s < 2; s++) {
        const o = (v + s) * 3;
        this.pos[o] = p[i].x; this.pos[o + 1] = p[i].y; this.pos[o + 2] = p[i].z;
        this.next[o] = nx.x; this.next[o + 1] = nx.y; this.next[o + 2] = nx.z;
        this.prev[o] = pv.x; this.prev[o + 1] = pv.y; this.prev[o + 2] = pv.z;
      }
    }
    for (const q of p) q.set(0, 0, 0);
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aNext.needsUpdate = true;
    g.attributes.aPrev.needsUpdate = true;
  }

  update(dt: number, width: number, height: number) {
    this.material.uniforms.uResolution.value.set(width / 2, height / 2);
    for (let k = 0; k < this.count; k++) {
      const b = this.bolts[k];
      b.life += dt;
      const t = b.life / b.max;
      const alpha = t >= 1 ? 0 : (1 - t) * (0.55 + 0.45 * Math.sin(b.life * 60 + b.flicker) ** 2);
      for (let i = 0; i < this.n; i++) {
        const taper = 1 - Math.abs(i / (this.n - 1) - 0.5) * 0.9;
        const v = (k * this.n + i) * 2;
        for (let s = 0; s < 2; s++) {
          this.info[(v + s) * 2] = alpha;
          this.info[(v + s) * 2 + 1] = b.width * taper;
        }
      }
    }
    this.mesh.geometry.attributes.aInfo.needsUpdate = true;
  }

  /** Point on a random path between two points — used for branching. */
  static jitter(a: Vector3, amount: number, out = tmp) {
    return out.set(a.x + (Math.random() - 0.5) * amount, a.y + (Math.random() - 0.5) * amount, a.z + (Math.random() - 0.5) * amount);
  }
}

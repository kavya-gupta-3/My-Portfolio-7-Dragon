import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { stageCenter } from '../Director';
import type { EngineFrame } from '../Engine';
import groundSource from '../shaders/fx/ground.glsl';

/** Floor height per world, relative to its stage; null = open space. */
export const FLOOR: (number | null)[] = [-9, -7.5, -11, -7, -7.5, null, -9];
const GLOW = ['#ff5a14', '#ff2bd6', '#22b8ff', '#1bf28e', '#ffb32e', '#a76bff', '#ff2a4d'];
/** Worlds whose pattern is baked; the others are cheap enough to paint live. */
const BAKED = new Set([0, 3, 4, 6]);
const TILE = 1024;
const tmp = new Vector3();

/** One quad that follows the camera and paints whichever world is on screen. */
export class Ground {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly bakeTarget = new WebGLRenderTarget(TILE, TILE, {
    wrapS: RepeatWrapping,
    wrapT: RepeatWrapping,
    minFilter: LinearMipmapLinearFilter,
    magFilter: LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    anisotropy: 4,
  });
  private readonly bakeMaterial: ShaderMaterial;
  private readonly bakeQuad: Mesh;
  private readonly bakeCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private baked = -1;
  readonly colors = { a: new Color('#ff2bd6'), b: new Color('#2bf0ff') };

  constructor() {
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${groundSource}`,
      fragmentShader: groundSource,
      uniforms: {
        tBake: { value: this.bakeTarget.texture },
        uWorld: { value: 0 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uColA: { value: this.colors.a },
        uColB: { value: this.colors.b },
        uGlowPos: { value: new Vector3() },
        uGlowCol: { value: new Color() },
        uFar: { value: new Color(0, 0, 0) },
        uDim: { value: 1 },
        uPulse: { value: 0 },
        uRing: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    const plane = new PlaneGeometry(420, 420, 1, 1);
    plane.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(plane, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;

    this.bakeMaterial = new ShaderMaterial({
      defines: { BAKE: '' },
      vertexShader: `#define VERTEX\n${groundSource}`,
      fragmentShader: groundSource,
      uniforms: { uWorld: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    });
    const tri = new BufferGeometry();
    tri.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.bakeQuad = new Mesh(tri, this.bakeMaterial);
    this.bakeQuad.frustumCulled = false;
  }

  /** Paint this world's tile once. Costs one frame's sliver, then nothing. */
  bake(renderer: WebGLRenderer, world: number) {
    if (world === this.baked || !BAKED.has(world)) return;
    this.baked = world;
    this.bakeMaterial.uniforms.uWorld.value = world;
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(this.bakeTarget);
    renderer.render(this.bakeQuad, this.bakeCam);
    renderer.setRenderTarget(was);
  }

  update(f: EngineFrame) {
    const floor = FLOOR[f.scene];
    this.mesh.visible = floor !== null;
    if (floor === null) return;
    this.bake(f.engine.renderer, f.scene);
    const u = this.material.uniforms;
    u.uWorld.value = f.scene;
    u.uTime.value = f.time;
    u.uFlash.value = f.engine.flash;
    u.uPulse.value = f.pulse;
    u.uRing.value = f.engine.ringAge * 46;
    u.uDim.value = (1 - f.conclave * 0.86) * (0.2 + 0.8 * f.intro * f.intro);
    u.uGlowCol.value.set(GLOW[f.scene]);
    const dragon = f.engine.dragons[f.scene];
    if (dragon) dragon.spine.sample(dragon.spine.length * 0.25, u.uGlowPos.value);
    const c = stageCenter(f.scene, tmp);
    this.mesh.position.set(f.camera.position.x, c.y + floor, f.camera.position.z);
    this.mesh.updateMatrixWorld();
  }
}

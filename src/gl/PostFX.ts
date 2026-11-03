import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  RGBAFormat,
  RGBFormat,
  ShaderMaterial,
  UnsignedInt101111Type,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  UnsignedByteType,
  type Camera,
  type PixelFormat,
  type Scene,
  type Texture,
  type TextureDataType,
  type WebGLRenderer,
} from 'three';
import postSource from './shaders/post/post.glsl';

function pass(define: string, uniforms: Record<string, { value: unknown }>) {
  return new ShaderMaterial({
    defines: { [define]: '' },
    uniforms,
    vertexShader: `#define VERTEX\n${postSource}`,
    fragmentShader: postSource,
    depthTest: false,
    depthWrite: false,
  });
}

/** Dust and smears on the front of the lens, painted once. */
function lensDirt() {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 320, 180);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 120; i++) {
    const r = 1 + rnd() * rnd() * 26;
    const x = rnd() * 320;
    const y = rnd() * 180;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.06 + rnd() * 0.3;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.7, `rgba(255,255,255,${a * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return new CanvasTexture(c);
}

/**
 * The picture needs far more range than a screen, but no alpha channel: packed
 * floats hold the same light as half-floats in half the memory, which on a
 * shared-memory chip makes the whole frame about twice as fast. Half-floats
 * where the GPU can't render to those, and 8-bit where it can't do either.
 */
let color: { type: TextureDataType; format: PixelFormat } = { type: UnsignedByteType, format: RGBAFormat };

function target(w: number, h: number, samples = 0) {
  return new WebGLRenderTarget(w, h, {
    ...color,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: samples >= 0,
    samples: Math.max(0, samples),
  });
}

/**
 * Low-res sky → HDR scene target → optional elemental wipe against a frozen
 * frame → 13-tap dual-filter bloom (Jimenez, CoD: AW) from quarter resolution
 * plus an anamorphic streak → one composite pass: FXAA, exposure, grading,
 * mist, shockwave, ACES, vignette, grain and dithering.
 */
export class PostFX {
  readonly scene: WebGLRenderTarget;
  /** The procedural sky, drawn small and sampled as the scene's backdrop. */
  readonly sky: WebGLRenderTarget;
  private readonly prev: WebGLRenderTarget;
  private readonly mixed: WebGLRenderTarget;
  private readonly streak: WebGLRenderTarget;
  private readonly streakWide: WebGLRenderTarget;
  private readonly shaftTarget: WebGLRenderTarget;
  private down: WebGLRenderTarget[] = [];
  private up: WebGLRenderTarget[] = [];
  private readonly quad: Mesh;
  private readonly cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly prefilter: ShaderMaterial;
  private readonly downMat: ShaderMaterial;
  private readonly upMat: ShaderMaterial;
  private readonly streakMat: ShaderMaterial;
  private readonly shaftMat: ShaderMaterial;
  private readonly copyMat: ShaderMaterial;
  private readonly wipeMat: ShaderMaterial;
  readonly composite: ShaderMaterial;
  private levels: number;
  private last: WebGLRenderTarget;
  /** MSAA samples actually in use (0 when the GPU can't multisample HDR). */
  readonly samples: number;

  readonly params = {
    bloom: 1.0,
    streak: 0.5,
    exposure: 1.0,
    /** How much light the incoming world gets. Below 1 while an entrance is in the dark. */
    gain: 1,
    chroma: 0,
    flash: 0,
    flashColor: new Vector3(0.75, 0.85, 1.0),
    vignette: 0.85,
    grain: 0.035,
    saturation: 1.06,
    threshold: 1.15,
    radius: 1.0,
    tint: new Vector3(1, 1, 1),
    lift: new Vector3(0, 0, 0),
    fog: 0,
    fogColor: new Vector3(0, 0, 0),
    streakTint: new Vector3(1, 0.8, 0.6),
    /** Strength of the light shafts, 0 skips the pass. */
    shafts: 0,
    /** Where they come from, in screen uv. */
    light: new Vector2(0.5, 0.8),
    dirt: 0,
    shock: new Vector4(0.5, 0.5, 0, 0),
  };

  /** Set while a section change is playing. */
  readonly wipe = { active: false, p: 0, kind: 0, a: new Color(), b: new Color() };

  constructor(private readonly renderer: WebGLRenderer, msaa: number, levels: number, private readonly skyScale: number) {
    const ext = renderer.extensions;
    const packed = ext.has('EXT_color_buffer_float');
    const hdr = packed || ext.has('EXT_color_buffer_half_float');
    if (packed) color = { type: UnsignedInt101111Type, format: RGBFormat };
    else if (hdr) color = { type: HalfFloatType, format: RGBAFormat };
    if (!hdr) msaa = 0;
    this.samples = msaa;
    this.levels = levels;
    this.scene = target(2, 2, msaa);
    this.sky = target(2, 2, -1);
    this.prev = target(2, 2, -1);
    this.mixed = target(2, 2, -1);
    this.streak = target(2, 2, -1);
    this.streakWide = target(2, 2, -1);
    this.shaftTarget = target(2, 2, -1);
    this.last = this.scene;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new Mesh(geo);
    this.quad.frustumCulled = false;
    this.prefilter = pass('PREFILTER', {
      tInput: { value: null },
      uTexel: { value: new Vector2() },
      uThreshold: { value: 0.9 },
      uKnee: { value: 0.6 },
    });
    this.downMat = pass('DOWN', { tInput: { value: null }, uTexel: { value: new Vector2() } });
    this.upMat = pass('UP', {
      tInput: { value: null },
      tBase: { value: null },
      uTexel: { value: new Vector2() },
      uRadius: { value: 1 },
    });
    this.streakMat = pass('STREAK', { tInput: { value: null }, uTexel: { value: new Vector2() } });
    this.shaftMat = pass('SHAFTS', { tInput: { value: null }, uTexel: { value: new Vector2() }, uLight: { value: new Vector2(0.5, 0.5) } });
    this.copyMat = pass('COPY', { tInput: { value: null }, uTexel: { value: new Vector2() } });
    this.wipeMat = pass('WIPE', {
      tScene: { value: this.scene.texture },
      tPrev: { value: this.prev.texture },
      uP: { value: 0 },
      uKind: { value: 0 },
      uGain: { value: 1 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uColA: { value: this.wipe.a },
      uColB: { value: this.wipe.b },
    });
    this.composite = pass('COMPOSITE', {
      tScene: { value: this.scene.texture },
      tBloom: { value: null },
      tStreak: { value: this.streakWide.texture },
      tShafts: { value: this.shaftTarget.texture },
      tDirt: { value: lensDirt() },
      uShafts: { value: 0 },
      uDirt: { value: 0 },
      uBloom: { value: 1 },
      uStreak: { value: 0 },
      uStreakTint: { value: new Vector3(1, 1, 1) },
      uExposure: { value: 1 },
      uChroma: { value: 0 },
      uFlash: { value: 0 },
      uFlashColor: { value: new Vector3(1, 1, 1) },
      uVignette: { value: 0.85 },
      uGrain: { value: 0.04 },
      uSharpen: { value: 0.9 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uPixel: { value: new Vector2(1, 1) },
      uTint: { value: new Vector3(1, 1, 1) },
      uLift: { value: new Vector3() },
      uSaturation: { value: 1 },
      uFog: { value: 0 },
      uFogColor: { value: new Vector3() },
      uShock: { value: new Vector4() },
    });
  }

  setSize(width: number, height: number) {
    this.scene.setSize(width, height);
    this.prev.setSize(width, height);
    this.mixed.setSize(width, height);
    this.sky.setSize(Math.max(2, Math.round(width * this.skyScale)), Math.max(2, Math.round(height * this.skyScale)));
    this.streak.setSize(Math.max(2, Math.round(width / 8)), Math.max(2, Math.round(height / 8)));
    this.streakWide.setSize(Math.max(2, Math.round(width / 8)), Math.max(2, Math.round(height / 8)));
    this.shaftTarget.setSize(Math.max(2, Math.round(width / 8)), Math.max(2, Math.round(height / 8)));
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.down = [];
    this.up = [];
    // the half-resolution mips cost as much as all the others put together,
    // and a wide glow doesn't need them
    let w = Math.max(1, Math.floor(width / 4));
    let h = Math.max(1, Math.floor(height / 4));
    for (let i = 0; i < this.levels; i++) {
      this.down.push(target(w, h, -1));
      if (i < this.levels - 1) this.up.push(target(w, h, -1));
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
    const aspect = width / Math.max(1, height);
    this.composite.uniforms.uPixel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
    this.composite.uniforms.uAspect.value = aspect;
    this.wipeMat.uniforms.uAspect.value = aspect;
  }

  private blit(material: ShaderMaterial, out: WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(out);
    this.renderer.render(this.quad, this.cam);
  }

  /** Freeze the frame that is on screen right now, for the next wipe. */
  capture() {
    this.copyMat.uniforms.tInput.value = this.last.texture;
    this.blit(this.copyMat, this.prev);
  }

  /** Compile and link every post program so the first wipe doesn't hitch. */
  warm() {
    const was = this.wipe.active;
    this.wipe.active = true;
    this.wipeMat.uniforms.tScene.value = this.scene.texture;
    this.blit(this.wipeMat, this.mixed);
    this.wipe.active = was;
    this.capture();
  }

  render(scene: Scene, camera: Camera, time: number, sky: ShaderMaterial) {
    const r = this.renderer;
    this.blit(sky, this.sky);
    r.setRenderTarget(this.scene);
    r.render(scene, camera);

    let src: WebGLRenderTarget = this.scene;
    if (this.wipe.active) {
      const w = this.wipeMat.uniforms;
      w.uP.value = this.wipe.p;
      w.uKind.value = this.wipe.kind;
      w.uGain.value = this.params.gain;
      w.uTime.value = time;
      this.blit(this.wipeMat, this.mixed);
      src = this.mixed;
    }
    this.last = src;

    const p = this.params;
    const pf = this.prefilter.uniforms;
    pf.tInput.value = src.texture;
    pf.uTexel.value.set(2 / src.width, 2 / src.height);
    pf.uThreshold.value = p.threshold;
    this.blit(this.prefilter, this.down[0]);
    for (let i = 1; i < this.down.length; i++) {
      const from = this.down[i - 1];
      this.downMat.uniforms.tInput.value = from.texture;
      this.downMat.uniforms.uTexel.value.set(1 / from.width, 1 / from.height);
      this.blit(this.downMat, this.down[i]);
    }
    let prev: WebGLRenderTarget = this.down[this.down.length - 1];
    for (let i = this.down.length - 2; i >= 0; i--) {
      const u = this.upMat.uniforms;
      u.tInput.value = prev.texture;
      u.tBase.value = this.down[i].texture;
      u.uTexel.value.set(1 / prev.width, 1 / prev.height);
      u.uRadius.value = p.radius;
      this.blit(this.upMat, this.up[i]);
      prev = this.up[i];
    }
    const bloomTex: Texture = prev.texture;
    const st = this.streakMat.uniforms;
    st.tInput.value = this.down[Math.min(1, this.down.length - 1)].texture;
    st.uTexel.value.set(0.035, 0);
    this.blit(this.streakMat, this.streak);
    st.tInput.value = this.streak.texture;
    st.uTexel.value.set(0.26, 0);
    this.blit(this.streakMat, this.streakWide);
    if (p.shafts > 0.01) {
      this.shaftMat.uniforms.tInput.value = this.down[Math.min(1, this.down.length - 1)].texture;
      this.shaftMat.uniforms.uLight.value.copy(p.light);
      this.blit(this.shaftMat, this.shaftTarget);
    }

    const c = this.composite.uniforms;
    c.tScene.value = src.texture;
    c.tBloom.value = bloomTex;
    c.uBloom.value = p.bloom / this.levels;
    c.uStreak.value = p.streak;
    c.uShafts.value = p.shafts;
    c.uDirt.value = p.dirt;
    c.uStreakTint.value.copy(p.streakTint);
    // under a wipe the gain has already been applied to the incoming world alone
    c.uExposure.value = p.exposure * (this.wipe.active ? 1 : p.gain);
    c.uChroma.value = p.chroma;
    c.uFlash.value = p.flash;
    c.uFlashColor.value.copy(p.flashColor);
    c.uVignette.value = p.vignette;
    c.uGrain.value = p.grain;
    c.uTime.value = time;
    c.uSaturation.value = p.saturation;
    c.uTint.value.copy(p.tint);
    c.uLift.value.copy(p.lift);
    c.uFog.value = p.fog;
    c.uFogColor.value.copy(p.fogColor);
    c.uShock.value.copy(p.shock);
    this.blit(this.composite, null);
  }
}

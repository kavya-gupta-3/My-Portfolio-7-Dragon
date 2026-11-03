import {
  BufferGeometry,
  Color,
  Data3DTexture,
  Float32BufferAttribute,
  LinearFilter,
  Matrix4,
  Mesh,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { mulberry32 } from '../core/math';
import skySource from './shaders/sky/sky.glsl';

/** Random values that tile in all three directions: the sky's clouds are read from it. */
function noiseVolume() {
  const size = 32;
  const data = new Uint8Array(size ** 3);
  const rnd = mulberry32(17);
  for (let i = 0; i < data.length; i++) data[i] = rnd() * 256;
  const t = new Data3DTexture(data, size, size, size);
  t.format = RedFormat;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.wrapR = RepeatWrapping;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/**
 * The sky is soft, so it never needs full resolution: `material` paints it
 * into a small target and `mesh` stretches that across the far plane. This
 * is the single biggest GPU saving on the site.
 */
export class Sky {
  readonly mesh: Mesh;
  readonly material: ShaderMaterial;
  /** How far the opening shot's far world has turned round the seven (radians). */
  yaw = 0;

  constructor(backdrop: Texture) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${skySource}`,
      fragmentShader: skySource,
      uniforms: {
        uInvProj: { value: new Matrix4() },
        uCamWorld: { value: new Matrix4() },
        uW: { value: [1, 0, 0, 0, 0, 0, 0] },
        uConclave: { value: 0 },
        uGain: { value: 1 },
        uTime: { value: 0 },
        uFlash: { value: 0 },
        uPulse: { value: 0 },
        uMeteorA: { value: new Vector3(0, 1, 0) },
        uMeteorB: { value: new Vector3(0, 1, 0) },
        uMeteorT: { value: -1 },
        uMoonDir: { value: new Vector3(-0.35, 0.42, -1).normalize() },
        uHobbyA: { value: new Color('#ff2bd6') },
        uHobbyB: { value: new Color('#2bf0ff') },
        uYaw: { value: 0 },
        tNoise: { value: noiseVolume() },
      },
      depthTest: false,
      depthWrite: false,
    });
    const blit = new ShaderMaterial({
      uniforms: { tSky: { value: backdrop } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSky;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tSky, vUv).rgb, 1.0); }`,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new Mesh(geo, blit);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
  }

  /** A shooting star across whatever part of the sky the camera is facing. */
  meteor() {
    const u = this.material.uniforms;
    const across = Math.random() < 0.5 ? -1 : 1;
    u.uMeteorA.value.set(across * (0.3 + Math.random() * 0.5), 0.2 + Math.random() * 0.5, -1).normalize();
    u.uMeteorB.value.set(-across * (0.2 + Math.random() * 0.5), -0.1 + Math.random() * 0.3, -1).normalize();
    u.uMeteorT.value = 0;
  }

  update(camera: PerspectiveCamera, weights: number[], conclave: number, gain: number, time: number, flash: number, pulse: number, dt: number) {
    const u = this.material.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    for (let i = 0; i < 7; i++) u.uW.value[i] = weights[i];
    u.uConclave.value = conclave;
    u.uYaw.value = this.yaw;
    u.uGain.value = gain;
    u.uTime.value = time;
    u.uFlash.value = flash;
    u.uPulse.value = pulse;
    if (u.uMeteorT.value >= 0) {
      u.uMeteorT.value += dt / 1.1;
      if (u.uMeteorT.value > 1) u.uMeteorT.value = -1;
    }
  }
}

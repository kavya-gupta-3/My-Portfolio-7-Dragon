import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, Mesh, ShaderMaterial, type Vector3 } from 'three';
import beamSource from '../shaders/fx/beam.glsl';

/** A column of light from the sky, for an entrance. Hidden when it's off. */
export class Beam {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(color: Color, radius: number, height: number, bands = 120) {
    const geo = new CylinderGeometry(radius, radius * 1.15, height, 48, 1, true);
    geo.translate(0, height / 2, 0);
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${beamSource}`,
      fragmentShader: beamSource,
      uniforms: { uColor: { value: color }, uPower: { value: 0 }, uTime: { value: 0 }, uBands: { value: bands } },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }

  set(base: Vector3, power: number, time: number) {
    this.mesh.visible = power > 0.005;
    if (!this.mesh.visible) return;
    this.mesh.position.copy(base);
    this.mesh.updateMatrixWorld();
    this.material.uniforms.uPower.value = power;
    this.material.uniforms.uTime.value = time;
  }
}

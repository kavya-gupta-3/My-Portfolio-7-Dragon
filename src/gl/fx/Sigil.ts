import { AdditiveBlending, Color, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { damp, smoothstep } from '../../core/math';
import { STAGES } from '../../data/content';
import type { EngineFrame } from '../Engine';
import sigilSource from '../shaders/fx/sigil.glsl';

/** Which point of the star each dragon sits at, counting round from the top. */
const SEAT_OF = [3, 4, 2, 5, 0, 1, 6];

/**
 * The summoning circle in the opening shot, far behind the seven. It draws
 * itself on in the dark, every dragon's seat catches as that dragon wakes,
 * and the seat of the one under the pointer burns brighter.
 */
export class Sigil {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly seats = new Array<number>(7).fill(0);
  private focus = -1;

  constructor(private readonly igniteAt: readonly number[], private readonly introLength: number) {
    const colors = Array.from({ length: 7 }, (_, k) => new Color(STAGES[SEAT_OF.indexOf(k)].color));
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${sigilSource}`,
      fragmentShader: sigilSource,
      uniforms: {
        uTime: { value: 0 },
        uDraw: { value: 0 },
        uGlow: { value: 0 },
        uFocus: { value: -1 },
        uSeat: { value: this.seats },
        uSeatCol: { value: colors },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(50, 50), this.material);
    this.mesh.position.set(0, 3.6, -38);
    this.mesh.rotation.x = -0.08;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  update(f: EngineFrame) {
    const glow = f.scene === 0 ? f.conclave : 0;
    this.mesh.visible = glow > 0.01;
    if (!this.mesh.visible) return;
    const u = this.material.uniforms;
    const t = f.intro * this.introLength;
    const opening = f.intro < 1;
    u.uTime.value = f.time;
    u.uGlow.value = glow * (opening ? smoothstep(0.2, 1.6, t) : 1);
    u.uDraw.value = opening ? smoothstep(0.4, 2.6, t) : 1;
    for (let i = 0; i < 7; i++) {
      const k = SEAT_OF[i];
      const lit = opening ? smoothstep(this.igniteAt[i], this.igniteAt[i] + 0.5, t) : 1;
      this.seats[k] = damp(this.seats[k], lit * (1 + f.pulse * 0.8), 8, f.dt);
    }
    this.focus = f.focus >= 0 ? SEAT_OF[f.focus] : -1;
    u.uFocus.value = this.focus;
  }
}

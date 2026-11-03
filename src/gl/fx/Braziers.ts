import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Group, LatheGeometry, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three';
import { smoothstep } from '../../core/math';
import { POSTER, pullBack } from '../Director';
import type { EngineFrame } from '../Engine';
import pillarSource from '../shaders/fx/pillar.glsl';
import { FireBreath, type FireStyle } from './FireBreath';

/** A little behind the seven, standing on the same floor. */
const DEPTH = -16;
const FLOOR = -9;
const HEIGHT = 19;
/** Where across the picture they stand: right out at its edges, clear of the seven. */
const EDGE = 0.91;
/** The stone is a little see-through: the pillars frame the picture, they don't fill it. */
const OPACITY = 0.7;
/** How far they sink into the floor when they leave. */
const SINK = 7;
/** A fire bowl: slow flames that climb, and not so many of them. */
const BOWL: FireStyle = { speed: [4.5, 9], cone: [0.15, 0.45], rate: 120, size: 0.95 };

const UP = new Vector3(0, 1, 0);
const STILL = new Vector3();

/** A tall obsidian column, narrowing as it rises, on a stepped base, with a bowl on top. */
function column(): BufferGeometry[] {
  const shaft = new BoxGeometry(2.2, HEIGHT, 2.2, 1, 24, 1);
  shaft.translate(0, HEIGHT / 2, 0);
  const p = shaft.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 - (p.getY(i) / HEIGHT) * 0.3;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  shaft.computeVertexNormals();
  const step1 = new BoxGeometry(4, 1.1, 4);
  step1.translate(0, 0.55, 0);
  const step2 = new BoxGeometry(3.1, 0.9, 3.1);
  step2.translate(0, 1.55, 0);
  const collar = new CylinderGeometry(1.25, 1.05, 0.7, 8);
  collar.translate(0, HEIGHT + 0.35, 0);
  const bowl = new LatheGeometry([new Vector2(0, 0), new Vector2(1.1, 0), new Vector2(2.1, 0.7), new Vector2(2.3, 1.4), new Vector2(2.0, 1.45), new Vector2(1.7, 0.9), new Vector2(0, 0.8)], 10);
  bowl.translate(0, HEIGHT + 0.7, 0);
  return [shaft, step1, step2, collar, bowl];
}

/**
 * Two fire bowls on obsidian pillars, framing the opening shot at its edges.
 * They rise out of the floor as the opening lights up, and as the reader
 * scrolls on they dim and sink back into it, flames dying down as they go.
 */
export class Braziers {
  readonly group = new Group();
  private readonly material: ShaderMaterial;
  private readonly pillars: Group[] = [];
  private readonly fires: FireBreath[] = [];
  private readonly mouths: Vector3[] = [];

  constructor(private readonly introLength: number) {
    this.material = new ShaderMaterial({
      vertexShader: `#define VERTEX\n${pillarSource}`,
      fragmentShader: pillarSource,
      uniforms: {
        uTime: { value: 0 },
        uFire: { value: 0 },
        uTop: { value: HEIGHT },
        uGlow: { value: new Color(1.0, 0.42, 0.1) },
        uOpacity: { value: 0 },
      },
      transparent: true,
    });
    const parts = column();
    for (const side of [-1, 1]) {
      const pillar = new Group();
      for (const g of parts) {
        const mesh = new Mesh(g, this.material);
        // behind the seven, in front of the circle
        mesh.renderOrder = -5;
        pillar.add(mesh);
      }
      pillar.rotation.y = side * 0.35;
      this.pillars.push(pillar);
      this.group.add(pillar);
      const fire = new FireBreath(260, new Color(1.0, 0.9, 0.62), new Color(1.0, 0.5, 0.12), new Color(1.0, 0.15, 0.03), BOWL);
      this.fires.push(fire);
      this.mouths.push(new Vector3());
      this.group.add(fire.group);
    }
    this.group.visible = false;
  }

  update(f: EngineFrame) {
    const t = f.intro * this.introLength;
    const opening = f.intro < 1;
    // only in the opening shot, and only where there is room beside the seven
    const there = f.scene === 0 ? smoothstep(0.12, 0.7, f.conclave) * smoothstep(0.85, 1, f.aspect) : 0;
    const shown = (opening ? smoothstep(0.3, 1.9, t) : 1) * there;
    const lit = (opening ? smoothstep(1.4, 2.4, t) : 1) * there;
    // a replayed opening starts in the dark: flames from before burn out unseen
    const dark = opening && t < 0.9;
    // the last flames are let to burn out before the pair is put away
    this.group.visible = shown > 0.002 || (!dark && this.fires.some((fire) => fire.group.visible));
    if (!this.group.visible) return;
    const u = this.material.uniforms;
    u.uTime.value = f.time;
    u.uFire.value = lit * (0.85 + 0.15 * Math.sin(f.time * 7.3) * Math.sin(f.time * 4.1));
    u.uOpacity.value = OPACITY * shown;
    // at the edges of the resting picture, whatever the shape of the screen
    const distance = POSTER.z * pullBack(f.aspect) - DEPTH;
    const spread = Math.tan((POSTER.fov * Math.PI) / 360) * f.aspect * distance * EDGE;
    const sink = (1 - shown) * (1 - shown) * SINK;
    const height = window.innerHeight * f.pixelRatio;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const pillar = this.pillars[i];
      pillar.visible = shown > 0.002;
      pillar.position.set(side * spread, FLOOR - sink, DEPTH);
      this.mouths[i].set(side * spread, FLOOR + HEIGHT + 1.4 - sink, DEPTH);
      if (dark) this.fires[i].group.visible = false;
      else this.fires[i].update(this.mouths[i], UP, STILL, lit * 0.85, f.time, f.dt, f.camera, height);
    }
  }
}

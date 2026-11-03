import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshMatcapMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  Scene,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  SplineCurve,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { damp, mulberry32, smoothstep } from '../core/math';
import coreSource from './shaders/fx/mindcore.glsl';

const TAU = Math.PI * 2;
/** How long each food stays on the turntable, seconds. */
const COURSE = 3.8;
const SWAP = 0.7;
/** The canvas against the box it sits in. */
const BLEED = 1.24;

const rnd = mulberry32(23);
const tmp = new Vector3();
const up = new Vector3(0, 1, 0);

function paint(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Light baked into a picture of a sphere. A surface looks up its colour by the
 * way it faces, so everything gets a studio's soft key, warm bounce and rim for
 * the price of one texture read, and no lights in the scene at all.
 */
function matcap(shine: number) {
  return paint(256, (ctx, s) => {
    const mid = s / 2;
    const base = ctx.createRadialGradient(s * 0.4, s * 0.32, s * 0.03, mid, mid, s * 0.56);
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.4, '#e4e0dc');
    base.addColorStop(0.72, '#9a9390');
    base.addColorStop(0.95, '#4b4644');
    base.addColorStop(1, '#2e2b2a');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const bounce = ctx.createRadialGradient(s * 0.6, s * 0.92, 0, s * 0.6, s * 0.92, s * 0.5);
    bounce.addColorStop(0, 'rgba(255,190,130,.55)');
    bounce.addColorStop(1, 'rgba(255,190,130,0)');
    ctx.fillStyle = bounce;
    ctx.fillRect(0, 0, s, s);
    if (!shine) return;
    const spot = ctx.createRadialGradient(s * 0.36, s * 0.27, 0, s * 0.36, s * 0.27, s * 0.14);
    spot.addColorStop(0, `rgba(255,255,255,${shine})`);
    spot.addColorStop(0.35, `rgba(255,255,255,${shine * 0.45})`);
    spot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = `rgba(255,255,255,${shine * 0.3})`;
    ctx.lineWidth = s * 0.018;
    ctx.beginPath();
    ctx.arc(mid, mid, s * 0.45, Math.PI * 0.15, Math.PI * 0.55);
    ctx.stroke();
  });
}

const glowTexture = (inner: string) =>
  paint(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.3, inner.replace(/[\d.]+\)$/, '.3)'));
    g.addColorStop(1, inner.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });

/** A smooth solid of revolution from a profile, bottom to top. */
function lathe(points: [number, number][], segments = 56) {
  const curve = new SplineCurve(points.map(([x, y]) => new Vector2(x, y)));
  return new LatheGeometry(curve.getPoints(44), segments);
}

/** A sheet from a function of (u, v), the closed edge sewn shut. */
function surface(nu: number, nv: number, closed: boolean, at: (u: number, v: number, out: Vector3) => void) {
  const row = nu + 1;
  const pos = new Float32Array(row * (nv + 1) * 3);
  const index: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      at(i / nu, j / nv, tmp);
      tmp.toArray(pos, (j * row + i) * 3);
      if (i < nu && j < nv) {
        const a = j * row + i;
        const c = a + row;
        index.push(a, a + 1, c, a + 1, c + 1, c);
      }
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  if (closed) {
    const n = geo.attributes.normal;
    for (let j = 0; j <= nv; j++) {
      const a = j * row;
      const b = a + nu;
      tmp.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, tmp.x, tmp.y, tmp.z);
      n.setXYZ(b, tmp.x, tmp.y, tmp.z);
    }
  }
  return geo;
}

/** Scatters copies over a surface, each lying flat on it. */
function strew(mesh: InstancedMesh, place: (i: number, at: Vector3, normal: Vector3) => number) {
  const at = new Vector3();
  const normal = new Vector3();
  const q = new Quaternion();
  const spin = new Quaternion();
  const m = new Matrix4();
  const size = new Vector3();
  for (let i = 0; i < mesh.count; i++) {
    const s = place(i, at, normal);
    q.setFromUnitVectors(up, normal);
    spin.setFromAxisAngle(up, rnd() * TAU);
    size.set(s, s, s);
    m.compose(at, q.multiply(spin), size);
    mesh.setMatrixAt(i, m);
  }
  return mesh;
}

class Kitchen {
  readonly soft = matcap(0);
  readonly gloss = matcap(0.95);
  readonly satin = matcap(0.4);

  skin(color: string, finish: Texture = this.soft, map?: Texture) {
    return new MeshMatcapMaterial({ color: new Color(color), matcap: finish, map: map ?? null, side: DoubleSide });
  }

  burger() {
    const g = new Group();
    const add = (geo: BufferGeometry, m: Material, y: number) => {
      const mesh = new Mesh(geo, m);
      mesh.position.y = y;
      g.add(mesh);
      return mesh;
    };
    const bun = this.skin('#f0a542', this.satin);
    const crumb = this.skin('#e8953a');
    add(lathe([[0, 0], [0.85, 0], [1, 0.05], [1.05, 0.18], [0.98, 0.3], [0.55, 0.33], [0, 0.33]]), crumb, -0.86);
    const patty = lathe([[0, 0], [1, 0], [1.12, 0.08], [1.14, 0.18], [1.03, 0.29], [0.5, 0.31], [0, 0.31]]);
    const p = patty.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z) || 1;
      const lump = (Math.sin(x * 9 + y * 13) * Math.cos(z * 11) + Math.sin(z * 23 + x * 5) * 0.5) * 0.022;
      p.setXYZ(i, x + (x / r) * lump, y + lump * 0.7, z + (z / r) * lump);
    }
    patty.computeVertexNormals();
    add(patty, this.skin('#6b3417', this.satin), -0.52);
    const fold = (r: number) => Math.max(0, r - 1.02);
    add(
      surface(40, 40, false, (u, v, out) => {
        const a = (u - 0.5) * 2.02;
        const b = (v - 0.5) * 2.02;
        const x = (a - b) * 0.7071;
        const z = (a + b) * 0.7071;
        const r = Math.hypot(x, z);
        out.set(x, -1.5 * fold(r) ** 1.4, z);
      }),
      this.skin('#ffb81c', this.gloss),
      -0.18,
    );
    const tomato = lathe([[0, 0], [0.6, 0], [0.64, 0.05], [0.6, 0.1], [0, 0.1]], 32);
    const red = this.skin('#e5281f', this.gloss);
    add(tomato, red, -0.12).position.set(0.5, -0.12, 0.26);
    add(tomato, red, -0.12).position.set(-0.46, -0.11, -0.3);
    add(tomato, red, -0.12).position.set(-0.14, -0.13, 0.56);
    add(
      surface(140, 7, true, (u, v, out) => {
        const t = u * TAU;
        const r = 0.7 + 0.64 * v;
        const frill = (Math.sin(t * 8) + 0.6 * Math.sin(t * 17 + 1) + 0.35 * Math.sin(t * 31 + 2)) * 0.075 * v * v;
        out.set(Math.cos(t) * r, frill - 0.05 * v, Math.sin(t) * r);
      }),
      this.skin('#62c63a', this.satin),
      0.02,
    );
    const top = add(lathe([[0, 0], [0.92, 0], [1.05, 0.08], [1.06, 0.26], [0.92, 0.5], [0.66, 0.68], [0.34, 0.79], [0, 0.82]]), bun, 0.12);
    top.scale.set(1, 1.05, 1);
    const seeds = new InstancedMesh(new SphereGeometry(1, 10, 8).scale(0.6, 0.34, 1), this.skin('#fff0cc', this.satin), 84);
    strew(seeds, (_, at, normal) => {
      const t = rnd() * TAU;
      const f = 0.3 + Math.sqrt(rnd()) * 1.15;
      at.set(Math.cos(t) * Math.cos(f) * 1.05, Math.sin(f) * 0.84 + 0.14, Math.sin(t) * Math.cos(f) * 1.05);
      normal.set(Math.cos(t) * Math.cos(f), Math.sin(f) * 1.3, Math.sin(t) * Math.cos(f)).normalize();
      return 0.055;
    });
    seeds.position.y = 0.1;
    g.add(seeds);
    g.scale.setScalar(0.92);
    return g;
  }

  pizza() {
    const g = new Group();
    const R = 2.55;
    const half = 0.42;
    const cheese = paint(256, (ctx, s) => {
      ctx.fillStyle = '#ffc636';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 90; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const r = 6 + rnd() * 26;
        const b = ctx.createRadialGradient(x, y, 0, x, y, r);
        const warm = rnd() < 0.3;
        b.addColorStop(0, warm ? 'rgba(214,92,18,.5)' : 'rgba(255,226,120,.6)');
        b.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = b;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    cheese.wrapS = cheese.wrapT = RepeatWrapping;
    cheese.repeat.set(0.42, 0.42);
    const wedge = new Shape();
    wedge.moveTo(0, 0);
    wedge.lineTo(Math.cos(half) * R, -Math.sin(half) * R);
    wedge.absarc(0, 0, R, -half, half, false);
    wedge.closePath();
    const base = new ExtrudeGeometry(wedge, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 28 });
    base.rotateX(-Math.PI / 2);
    g.add(new Mesh(base, this.skin('#ffffff', this.satin, cheese)));
    const crust = new TorusGeometry(R, 0.2, 14, 40, half * 2);
    crust.rotateZ(-half);
    crust.rotateX(-Math.PI / 2);
    const rim = new Mesh(crust, this.skin('#d98a35', this.satin));
    rim.position.y = 0.12;
    g.add(rim);
    const meat = new CylinderGeometry(0.27, 0.27, 0.05, 28);
    const pepperoni = this.skin('#c6281c', this.gloss);
    for (const [r, a] of [[1.95, 0.2], [2.0, -0.22], [1.32, 0.03], [0.82, -0.07], [1.42, -0.27]] as const) {
      const m = new Mesh(meat, pepperoni);
      m.position.set(Math.cos(a) * r, 0.18, Math.sin(a) * r);
      m.scale.setScalar(r > 1 ? 1 : 0.72);
      g.add(m);
    }
    const leaf = new SphereGeometry(1, 10, 8).scale(0.2, 0.025, 0.1);
    const basil = this.skin('#2f9e44', this.satin);
    for (const [r, a, t] of [[1.6, 0.26, 0.6], [1.0, 0.16, 2.1], [1.75, -0.03, 4]] as const) {
      const m = new Mesh(leaf, basil);
      m.position.set(Math.cos(a) * r, 0.21, Math.sin(a) * r);
      m.rotation.y = t;
      g.add(m);
    }
    const drip = new CapsuleGeometry(0.06, 0.2, 4, 10);
    const melt = this.skin('#ffc636', this.gloss);
    for (const [r, side, l] of [[1.0, 1, 1], [1.7, 1, 0.7], [1.3, -1, 1.1]] as const) {
      const a = (half - 0.02) * side;
      const m = new Mesh(drip, melt);
      m.position.set(Math.cos(a) * r, -0.1, Math.sin(a) * r);
      m.scale.y = l;
      g.add(m);
    }
    // the centre of the slice, not its tip, turns on the axis
    for (const c of g.children) c.position.x -= R * 0.56;
    g.scale.setScalar(0.86);
    return g;
  }

  donut() {
    const g = new Group();
    const dough = new TorusGeometry(1, 0.52, 32, 72);
    dough.rotateX(Math.PI / 2);
    g.add(new Mesh(dough, this.skin('#d9974f', this.satin)));
    const R = 1;
    const r = 0.535;
    const lip = (t: number) => 0.24 + Math.sin(t * 5) * 0.16 + Math.sin(t * 9 + 2) * 0.08;
    const point = (t: number, a: number, out: Vector3) => out.set(Math.cos(t) * (R + r * Math.cos(a)), r * Math.sin(a), Math.sin(t) * (R + r * Math.cos(a)));
    g.add(
      new Mesh(
        surface(160, 26, true, (u, v, out) => {
          const t = u * TAU;
          const a = -lip(t) + (Math.PI + lip(t + 1.4) + lip(t)) * v;
          point(t, a, out);
        }),
        this.skin('#ff5fa2', this.gloss),
      ),
    );
    const bits = new InstancedMesh(new CapsuleGeometry(0.028, 0.1, 3, 8), this.skin('#ffffff', this.satin), 120);
    strew(bits, (_, at, normal) => {
      const t = rnd() * TAU;
      const a = 0.25 + rnd() * (Math.PI - 0.5);
      point(t, a, at);
      normal.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      return 1;
    });
    const hues = ['#ffe45c', '#7fe3ff', '#ffffff', '#ff9d3c', '#b98cff'];
    for (let i = 0; i < bits.count; i++) bits.setColorAt(i, new Color(hues[i % hues.length]));
    g.add(bits);
    g.scale.setScalar(0.92);
    return g;
  }
}

/** One level's little world. */
interface Set3D {
  scene: Scene;
  camera: PerspectiveCamera;
  /** What leans toward the pointer. */
  stage: Group;
  animate(time: number): void;
}

function foodSet(): Set3D {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 1.5, 9.2);
  camera.lookAt(0, -0.12, 0);
  const stage = new Group();
  scene.add(stage);
  const k = new Kitchen();
  // each dish turns on its own axis, tipped toward the viewer so its best side stays up
  const menu: [Group, number][] = [[k.burger(), 0.14], [k.pizza(), 0.66], [k.donut(), 0.5]];
  const trays = menu.map(([food, tip]) => {
    const tray = new Group();
    tray.rotation.x = tip;
    tray.add(food);
    tray.visible = false;
    stage.add(tray);
    return tray;
  });
  const halo = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,150,50,.55)'), blending: AdditiveBlending, depthWrite: false, depthTest: false }));
  halo.scale.setScalar(4.3);
  halo.position.set(0, 0.1, -1.6);
  stage.add(halo);
  const ring = (radius: number, opacity: number) => {
    const geo = new TorusGeometry(radius, 0.012, 8, 120);
    geo.rotateX(Math.PI / 2);
    const m = new Mesh(geo, new MeshBasicMaterial({ color: '#ffb257', transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }));
    m.position.y = -1.42;
    stage.add(m);
    return m;
  };
  const rings = [ring(1.42, 0.9), ring(1.66, 0.35)];
  const under = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,170,70,.5)'), blending: AdditiveBlending, depthWrite: false }));
  under.scale.set(3.9, 0.9, 1);
  under.position.y = -1.44;
  stage.add(under);
  // little sparks of flavour drifting up past the food
  const count = 46;
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  const pos = new Float32Array(count * 3);
  const motes = new BufferGeometry();
  motes.setAttribute('position', new BufferAttribute(pos, 3));
  const dust = new Points(motes, new PointsMaterial({ map: glowTexture('rgba(255,225,170,1)'), size: 0.16, transparent: true, blending: AdditiveBlending, depthWrite: false, color: '#ffd9a0' }));
  stage.add(dust);
  let course = -1;
  return {
    scene,
    camera,
    stage,
    animate(time) {
      const at = time / COURSE;
      const now = Math.floor(at) % menu.length;
      const into = (at % 1) * COURSE;
      if (now !== course) {
        course = now;
        trays.forEach((t, i) => (t.visible = i === now));
      }
      // each dish lands with a little bounce and leaves with a whirl
      const arrive = smoothstep(0, SWAP, into);
      const leave = smoothstep(COURSE - SWAP * 0.6, COURSE, into);
      const bounce = 1 + Math.sin(Math.min(1, into / SWAP) * Math.PI) * 0.14;
      const tray = trays[now];
      tray.scale.setScalar(Math.max(0.001, arrive * bounce * (1 - leave)));
      tray.children[0].rotation.y = time * 0.62 + (1 - arrive) * -2.4 + leave * 3.4;
      tray.position.y = 0.04 + Math.sin(time * 1.5) * 0.07 + (1 - arrive) * 1.1 + leave * -0.5;
      rings[0].rotation.y = time * 0.3;
      rings[0].scale.setScalar(1 + (1 - arrive) * 0.16);
      rings[1].scale.setScalar(1 + Math.sin(time * 1.2) * 0.03);
      under.material.opacity = 0.8 + Math.sin(time * 2.1) * 0.2;
      for (let i = 0; i < count; i++) {
        const o = i * 3;
        const life = (time * (0.08 + seeds[o] * 0.14) + seeds[o + 1]) % 1;
        const a = seeds[o + 2] * TAU + time * 0.25;
        const r = 0.9 + seeds[o] * 0.9;
        pos[o] = Math.cos(a) * r;
        pos[o + 1] = -1.4 + life * 2.8;
        pos[o + 2] = Math.sin(a) * r;
      }
      motes.attributes.position.needsUpdate = true;
    },
  };
}

function mindSet(): Set3D {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0.5, 12.4);
  camera.lookAt(0, 0, 0);
  const stage = new Group();
  scene.add(stage);
  const a = new Color('#20ffc8');
  const b = new Color('#7a5bff');
  const c = new Color('#ff6fd8');

  const halo = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(90,150,255,.6)'), blending: AdditiveBlending, depthWrite: false, depthTest: false }));
  halo.scale.setScalar(6.4);
  halo.position.z = -2.4;
  stage.add(halo);

  const core = new Mesh(
    new SphereGeometry(1.12, 64, 48),
    new ShaderMaterial({
      vertexShader: `#define VERTEX\n${coreSource}`,
      fragmentShader: coreSource,
      uniforms: { uTime: { value: 0 }, uA: { value: a }, uB: { value: b }, uC: { value: c } },
    }),
  );
  stage.add(core);

  const shine = matcap(0.9);
  const orbits: { pivot: Group; rate: number }[] = [];
  const orbit = (radius: number, tilt: number, roll: number, rate: number, color: Color, moon: number, ringed: boolean) => {
    const plane = new Group();
    plane.rotation.set(tilt, 0, roll);
    stage.add(plane);
    const geo = new TorusGeometry(radius, 0.014, 8, 160);
    geo.rotateX(Math.PI / 2);
    plane.add(new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })));
    const pivot = new Group();
    plane.add(pivot);
    const body = new Mesh(new SphereGeometry(moon, 28, 20), new MeshMatcapMaterial({ color, matcap: shine }));
    body.position.x = radius;
    pivot.add(body);
    const glow = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,255,255,.8)'), color, blending: AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(moon * 6);
    body.add(glow);
    if (ringed) {
      const band = new TorusGeometry(moon * 1.75, moon * 0.11, 6, 48);
      band.rotateX(1.2);
      body.add(new Mesh(band, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 })));
    }
    orbits.push({ pivot, rate });
  };
  orbit(1.72, 0.3, 0.42, 0.62, a, 0.1, false);
  orbit(2.24, 1.2, -0.3, -0.42, b.clone().lerp(c, 0.4), 0.15, true);
  orbit(2.76, 0.86, 0.9, 0.28, c, 0.085, false);

  const count = 150;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(2 + rnd() * 2.4);
    tmp.toArray(pos, i * 3);
  }
  const sky = new BufferGeometry();
  sky.setAttribute('position', new BufferAttribute(pos, 3));
  const stars = new Points(sky, new PointsMaterial({ map: glowTexture('rgba(255,255,255,1)'), size: 0.09, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  stage.add(stars);

  const uniforms = (core.material as ShaderMaterial).uniforms;
  return {
    scene,
    camera,
    stage,
    animate(time) {
      uniforms.uTime.value = time;
      core.rotation.y = time * 0.16;
      for (const o of orbits) o.pivot.rotation.y = time * o.rate;
      stars.rotation.y = -time * 0.03;
      stars.rotation.x = time * 0.012;
      halo.material.opacity = 0.84 + Math.sin(time * 0.9) * 0.16;
    },
  };
}

/**
 * The two hobby levels that are real objects: food on a turntable and a mind
 * with moons. They have their own small canvas, which moves to whichever of the
 * two is on screen. They are never both on screen, so one is enough, and it
 * draws nothing at all the rest of the time.
 */
export class HobbyArt {
  private readonly canvas = document.createElement('canvas');
  private renderer: WebGLRenderer | null = null;
  private readonly sets = new Map<HTMLElement, Set3D>();
  private readonly seen = new Set<HTMLElement>();
  private host: HTMLElement | null = null;
  private size = 0;
  private tiltX = 0;
  private tiltY = 0;

  constructor(hosts: HTMLElement[], private readonly still: boolean) {
    this.canvas.className = 'hv-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    const watch = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this.seen.add(e.target as HTMLElement);
          else this.seen.delete(e.target as HTMLElement);
        }
      },
      { rootMargin: '10%' },
    );
    for (const h of hosts) watch.observe(h);
  }

  private build(hosts: Iterable<HTMLElement>) {
    try {
      this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      document.documentElement.classList.add('no-art');
      return false;
    }
    this.renderer.setClearColor(0x000000, 0);
    for (const h of hosts) this.sets.set(h, h.dataset.art === 'food' ? foodSet() : mindSet());
    return true;
  }

  /**
   * Builds everything ahead of time, so the first look at it doesn't cost a
   * frame: the canvas gets its drawing buffer now, and each set is drawn once
   * with every dish on the menu showing, which puts all of it on the chip.
   */
  prepare(hosts: HTMLElement[]) {
    if (!this.build(hosts)) return;
    const r = this.renderer!;
    if (hosts[0]) this.fit(hosts[0]);
    for (const set of this.sets.values()) {
      set.animate(0);
      const hidden: Object3D[] = [];
      set.scene.traverse((o) => {
        if (!o.visible) hidden.push(o);
        o.visible = true;
      });
      r.compile(set.scene, set.camera);
      r.render(set.scene, set.camera);
      for (const o of hidden) o.visible = false;
    }
  }

  private fit(host: HTMLElement) {
    const r = this.renderer!;
    // a little larger than its box, so the glow has room to fade out
    const css = Math.round(host.clientWidth * BLEED);
    if (css === this.size || !css) return;
    this.size = css;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(css, css, false);
  }

  update(time: number, dt: number, pointer: Vector2) {
    if (!this.renderer) return;
    const host = [...this.seen][0];
    if (!host) return;
    if (host !== this.host) {
      // the two hosts are the same size: the drawing buffer can stay as it is
      this.host = host;
      host.prepend(this.canvas);
    }
    const set = this.sets.get(host);
    if (!set) return;
    this.fit(host);
    this.tiltX = damp(this.tiltX, -pointer.y * 0.3, 5, dt);
    this.tiltY = damp(this.tiltY, pointer.x * 0.5, 5, dt);
    set.stage.rotation.set(this.tiltX, this.tiltY, 0);
    set.animate(this.still ? 1.2 : time);
    this.renderer.render(set.scene, set.camera);
  }
}

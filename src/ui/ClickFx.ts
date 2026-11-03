/**
 * A click answers in the language of the chapter it lands in: embers, pixels,
 * lightning, crystal, coins, stars or a blade of fire. A small canvas over the
 * whole page draws them. It only exists on screen while something is flying,
 * so it costs nothing the rest of the time.
 */

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);

type Draw = (c: CanvasRenderingContext2D, u: number, dt: number) => void;
interface Effect {
  age: number;
  life: number;
  draw: Draw;
}

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  spin: number;
  heat: number;
}

function burst(x: number, y: number, count: number, lo: number, hi: number, size: [number, number]): Bit[] {
  return Array.from({ length: count }, () => {
    const a = Math.random() * TAU;
    const s = rnd(lo, hi);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rnd(size[0], size[1]), spin: Math.random() * TAU, heat: Math.random() };
  });
}

function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, style: string) {
  c.strokeStyle = style;
  c.lineWidth = width;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.stroke();
}

function ember(x: number, y: number): Effect[] {
  const bits = burst(x, y, 34, 60, 420, [1.5, 4.5]);
  return [
    {
      age: 0,
      life: 0.9,
      draw(c, u, dt) {
        const fade = 1 - u;
        ring(c, x, y, easeOut(Math.min(1, u * 2.4)) * 92, 16 * fade * fade, `rgba(255,120,36,${0.5 * fade})`);
        ring(c, x, y, easeOut(Math.min(1, u * 2.4)) * 92, 2.5 * fade, `rgba(255,226,170,${fade})`);
        for (const b of bits) {
          b.vx *= 1 - 2.2 * dt;
          b.vy = b.vy * (1 - 2.2 * dt) - 240 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          const r = b.size * fade;
          c.fillStyle = `rgba(255,${Math.round(80 + b.heat * 150)},${Math.round(20 + b.heat * 50)},${0.28 * fade})`;
          c.beginPath();
          c.arc(b.x, b.y, r * 3, 0, TAU);
          c.fill();
          c.fillStyle = `rgba(255,${Math.round(190 + b.heat * 60)},150,${fade})`;
          c.beginPath();
          c.arc(b.x, b.y, r, 0, TAU);
          c.fill();
        }
      },
    },
  ];
}

const PIXELS = ['#ff2bd6', '#2bf0ff', '#ffe14d', '#8a5bff', '#ffffff'];

function pixels(x: number, y: number): Effect[] {
  const bits = burst(x, y, 44, 120, 560, [4, 9]);
  const snap = (v: number) => Math.round(v / 4) * 4;
  return [
    {
      age: 0,
      life: 0.95,
      draw(c, u, dt) {
        // two square shock rings, stepped like old hardware
        const r = snap(easeOut(Math.min(1, u * 2)) * 120);
        for (let k = 0; k < 2; k++) {
          const q = r * (k ? 0.6 : 1);
          c.strokeStyle = PIXELS[k];
          c.globalAlpha = Math.max(0, 1 - u * 1.8);
          c.lineWidth = 4;
          c.strokeRect(snap(x - q), snap(y - q), snap(q * 2), snap(q * 2));
        }
        c.globalAlpha = 1;
        for (const [i, b] of bits.entries()) {
          b.vy += 1100 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          // they blink out rather than fade
          if (u > 0.55 && Math.floor(u * 28 + i) % 3 === 0) continue;
          c.fillStyle = PIXELS[i % PIXELS.length];
          c.fillRect(snap(b.x), snap(b.y), Math.round(b.size), Math.round(b.size));
        }
      },
    },
  ];
}

function jag(x0: number, y0: number, x1: number, y1: number, rough: number) {
  let pts: [number, number][] = [[x0, y0], [x1, y1]];
  let r = rough;
  for (let level = 0; level < 5; level++) {
    const next: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      next.push([(ax + bx) / 2 + rnd(-r, r), (ay + by) / 2 + rnd(-r, r) * 0.4], [bx, by]);
    }
    pts = next;
    r *= 0.55;
  }
  return pts;
}

function trace(c: CanvasRenderingContext2D, pts: [number, number][]) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
}

function lightning(x: number, y: number): Effect[] {
  const top = x + rnd(-160, 160);
  const sparks = burst(x, y, 22, 180, 760, [8, 26]);
  let main = jag(top, -20, x, y, 90);
  let forks: [number, number][][] = [];
  let beat = 0;
  const reforge = () => {
    main = jag(top, -20, x, y, 90);
    forks = [0.4, 0.62].map((f) => {
      const p = main[Math.floor(main.length * f)];
      return jag(p[0], p[1], p[0] + rnd(-220, 220), p[1] + rnd(70, 240), 44);
    });
  };
  reforge();
  return [
    {
      age: 0,
      life: 0.5,
      draw(c, u, dt) {
        beat += dt;
        if (beat > 0.05) {
          beat = 0;
          reforge();
        }
        const a = (1 - u) * (u < 0.3 || Math.random() > 0.45 ? 1 : 0.35);
        c.lineCap = 'round';
        c.lineJoin = 'round';
        for (const [width, style] of [[18, `rgba(40,150,255,${0.16 * a})`], [8, `rgba(90,210,255,${0.42 * a})`], [2.4, `rgba(240,252,255,${a})`]] as const) {
          c.strokeStyle = style;
          c.lineWidth = width;
          trace(c, main);
          c.lineWidth = width * 0.5;
          for (const f of forks) trace(c, f);
        }
        const g = c.createRadialGradient(x, y, 0, x, y, 130);
        g.addColorStop(0, `rgba(190,240,255,${0.55 * (1 - u)})`);
        g.addColorStop(1, 'rgba(60,160,255,0)');
        c.fillStyle = g;
        c.fillRect(x - 130, y - 130, 260, 260);
        c.strokeStyle = `rgba(220,248,255,${1 - u})`;
        c.lineWidth = 1.6;
        c.beginPath();
        for (const b of sparks) {
          const len = b.size * (1 - u);
          const sp = Math.hypot(b.vx, b.vy) || 1;
          c.moveTo(b.x, b.y);
          c.lineTo(b.x - (b.vx / sp) * len, b.y - (b.vy / sp) * len);
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vy += 900 * dt;
        }
        c.stroke();
      },
    },
  ];
}

function crystal(x: number, y: number): Effect[] {
  const shards = Array.from({ length: 11 }, (_, i) => ({
    a: (i / 11) * TAU + rnd(-0.2, 0.2),
    len: rnd(52, 118),
    wide: rnd(8, 17),
    drift: rnd(30, 120),
    turn: rnd(-2, 2),
  }));
  return [
    {
      age: 0,
      life: 0.95,
      draw(c, u) {
        const grow = easeOut(Math.min(1, u * 5));
        const fade = 1 - Math.max(0, (u - 0.42) / 0.58);
        // a six-sided ring across the floor of the page
        c.strokeStyle = `rgba(120,255,190,${0.8 * fade})`;
        c.lineWidth = 2.5 * fade;
        c.beginPath();
        const r = easeOut(Math.min(1, u * 1.6)) * 150;
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * TAU + Math.PI / 6;
          c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        c.stroke();
        const out = Math.max(0, u - 0.42) * 1.72;
        for (const s of shards) {
          const a = s.a + s.turn * out * out;
          const d = 8 + s.drift * out;
          const px = x + Math.cos(s.a) * d;
          const py = y + Math.sin(s.a) * d;
          const l = s.len * grow;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const wx = -sa * s.wide * grow;
          const wy = ca * s.wide * grow;
          const tipX = px + ca * l;
          const tipY = py + sa * l;
          const g = c.createLinearGradient(px, py, tipX, tipY);
          g.addColorStop(0, `rgba(27,242,142,${0.5 * fade})`);
          g.addColorStop(1, `rgba(230,255,240,${fade})`);
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(px + ca * l * 0.42 + wx, py + sa * l * 0.42 + wy);
          c.lineTo(tipX, tipY);
          c.lineTo(px + ca * l * 0.42 - wx, py + sa * l * 0.42 - wy);
          c.closePath();
          c.fill();
          c.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(px, py);
          c.lineTo(tipX, tipY);
          c.stroke();
        }
      },
    },
  ];
}

function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, waist = 0.16) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const q = i % 2 ? r * waist : r;
    c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
  c.fill();
}

function coins(x: number, y: number): Effect[] {
  const bits = Array.from({ length: 18 }, () => {
    const a = -Math.PI / 2 + rnd(-1.1, 1.1);
    const s = rnd(260, 720);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rnd(8, 15), spin: Math.random() * TAU, heat: rnd(7, 16) };
  });
  const glints = burst(x, y, 9, 60, 190, [7, 15]);
  return [
    {
      age: 0,
      life: 1.25,
      draw(c, u, dt) {
        const fade = Math.min(1, (1 - u) * 3.2);
        ring(c, x, y, easeOut(Math.min(1, u * 3)) * 100, 3 * Math.max(0, 1 - u * 3), `rgba(255,226,140,${Math.max(0, 1 - u * 3)})`);
        c.fillStyle = `rgba(255,244,200,${Math.max(0, 1 - u * 1.6)})`;
        for (const g of glints) {
          g.x += g.vx * dt;
          g.y += g.vy * dt;
          star(c, g.x, g.y, g.size * Math.max(0, 1 - u * 1.6));
        }
        for (const b of bits) {
          b.vy += 1250 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.spin += b.heat * dt;
          const w = Math.abs(Math.cos(b.spin)) * b.size + 1;
          c.fillStyle = `rgba(190,120,24,${fade})`;
          c.beginPath();
          c.ellipse(b.x + 1.5, b.y + 1.5, w, b.size, 0, 0, TAU);
          c.fill();
          c.fillStyle = Math.cos(b.spin) > 0 ? `rgba(255,205,70,${fade})` : `rgba(255,232,150,${fade})`;
          c.beginPath();
          c.ellipse(b.x, b.y, w, b.size, 0, 0, TAU);
          c.fill();
          if (w > b.size * 0.6) {
            c.strokeStyle = `rgba(255,246,205,${0.8 * fade})`;
            c.lineWidth = 1.2;
            c.beginPath();
            c.ellipse(b.x, b.y, w * 0.68, b.size * 0.68, 0, 0, TAU);
            c.stroke();
          }
        }
      },
    },
  ];
}

function stars(x: number, y: number, from: [number, number] | null): Effect[] {
  const bits = burst(x, y, 16, 24, 150, [3, 12]);
  const list: Effect[] = [
    {
      age: 0,
      life: 1.5,
      draw(c, u, dt) {
        const fade = 1 - u;
        for (const [i, b] of bits.entries()) {
          b.vx *= 1 - 1.6 * dt;
          b.vy *= 1 - 1.6 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          const twinkle = 0.55 + 0.45 * Math.sin(u * 22 + i * 2.4);
          c.fillStyle = i % 3 ? `rgba(190,150,255,${fade * twinkle})` : `rgba(255,190,240,${fade * twinkle})`;
          star(c, b.x, b.y, b.size * (0.5 + fade * 0.7));
        }
        c.fillStyle = `rgba(255,255,255,${fade})`;
        star(c, x, y, 26 * easeOut(Math.min(1, u * 6)) * fade, 0.1);
        ring(c, x, y, easeOut(u) * 70, 1.4, `rgba(190,150,255,${0.8 * fade})`);
      },
    },
  ];
  if (from) {
    // each click joins the last one: you are drawing your own constellation
    list.push({
      age: 0,
      life: 2.6,
      draw(c, u) {
        const reach = Math.min(1, u * 5);
        c.strokeStyle = `rgba(214,190,255,${0.75 * (1 - u)})`;
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(from[0], from[1]);
        c.lineTo(from[0] + (x - from[0]) * reach, from[1] + (y - from[1]) * reach);
        c.stroke();
      },
    });
  }
  return list;
}

function slash(x: number, y: number): Effect[] {
  const bits = burst(x, y, 30, 120, 640, [1.5, 3.5]);
  const cuts = [-0.72, 0.84].map((a, i) => ({ a: a + rnd(-0.14, 0.14), bend: rnd(0.14, 0.26) * (i ? 1 : -1), len: rnd(180, 250), delay: i * 0.09 }));
  return [
    {
      age: 0,
      life: 0.72,
      draw(c, u, dt) {
        const fade = 1 - u;
        for (const cut of cuts) {
          const head = Math.min(1, Math.max(0, (u - cut.delay) * 6));
          if (head <= 0) continue;
          const ca = Math.cos(cut.a);
          const sa = Math.sin(cut.a);
          const point = (s: number, side: number): [number, number] => {
            const along = (s - 0.5) * 2 * cut.len;
            // bowed like a blade's swing, but through the point that was clicked
            const off = -((s * 2 - 1) ** 2) * cut.len * cut.bend + side * Math.sin(Math.PI * s) * 13 * fade;
            return [x + ca * along - sa * off, y + sa * along + ca * off];
          };
          for (const [grow, style] of [[3, `rgba(255,40,70,${0.3 * fade})`], [1.4, `rgba(255,120,60,${0.8 * fade})`], [0.5, `rgba(255,240,220,${fade})`]] as const) {
            c.fillStyle = style;
            c.beginPath();
            const steps = 18;
            for (let i = 0; i <= steps; i++) {
              const [px, py] = point((i / steps) * head, grow);
              c[i ? 'lineTo' : 'moveTo'](px, py);
            }
            for (let i = steps; i >= 0; i--) {
              const [px, py] = point((i / steps) * head, -grow);
              c.lineTo(px, py);
            }
            c.closePath();
            c.fill();
          }
        }
        for (const b of bits) {
          b.vy += 420 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          c.fillStyle = `rgba(255,${Math.round(90 + b.heat * 120)},60,${fade})`;
          c.beginPath();
          c.arc(b.x, b.y, b.size * fade, 0, TAU);
          c.fill();
        }
      },
    },
  ];
}

export class ClickFx {
  private readonly canvas = document.createElement('canvas');
  private readonly c = this.canvas.getContext('2d')!;
  private effects: Effect[] = [];
  private running = false;
  private last = 0;
  private lastStar: [number, number] | null = null;
  private lastStarAt = 0;
  private scale = 1;

  constructor() {
    this.canvas.className = 'click-fx';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.append(this.canvas);
  }

  fire(stage: number, x: number, y: number) {
    let made: Effect[];
    if (stage === 0) made = ember(x, y);
    else if (stage === 1) made = pixels(x, y);
    else if (stage === 2) made = lightning(x, y);
    else if (stage === 3) made = crystal(x, y);
    else if (stage === 4) made = coins(x, y);
    else if (stage === 5) {
      const now = performance.now();
      made = stars(x, y, now - this.lastStarAt < 4000 ? this.lastStar : null);
      this.lastStar = [x, y];
      this.lastStarAt = now;
    } else made = slash(x, y);
    this.effects.push(...made);
    if (this.running) return;
    this.running = true;
    this.fit();
    this.canvas.style.display = 'block';
    this.last = performance.now();
    requestAnimationFrame(this.step);
  }

  /** The page's own width: a window's includes a scrollbar the canvas doesn't cover. */
  private get size() {
    const root = document.documentElement;
    return [root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight];
  }

  private fit() {
    this.scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const [cw, ch] = this.size;
    const w = Math.round(cw * this.scale);
    const h = Math.round(ch * this.scale);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private readonly step = (now: number) => {
    // a frame's timestamp can be from just before the click that started it
    const dt = Math.min(0.05, Math.max(0, now - this.last) / 1000);
    this.last = now;
    const c = this.c;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    const [w, h] = this.size;
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    for (const e of this.effects) {
      e.age += dt;
      e.draw(c, Math.min(1, e.age / e.life), dt);
    }
    this.effects = this.effects.filter((e) => e.age < e.life);
    if (this.effects.length) {
      requestAnimationFrame(this.step);
      return;
    }
    this.running = false;
    c.clearRect(0, 0, w, h);
    this.canvas.style.display = 'none';
  };
}

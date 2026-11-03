import { $, store } from './dom';

interface Vec {
  x: number;
  y: number;
}
interface Ember extends Vec {
  r: number;
  phase: number;
  gold: boolean;
}
interface Mine extends Vec {
  vx: number;
  vy: number;
  r: number;
  spin: number;
}
interface Spark extends Vec {
  vx: number;
  vy: number;
  life: number;
  hue: number;
}

export interface GameHooks {
  open: () => void;
  close: () => void;
  sound: (kind: 'eat' | 'gold' | 'die' | 'start') => void;
}

/**
 * EMBER HUNT — a tiny original arcade game for the gaming hobby. Steer a
 * wyrm with the pointer (or arrow keys), eat embers to grow, dodge the void
 * mines. Your own tail is safe: it's a dragon.
 */
export class EmberHunt {
  private readonly root = $('#game')!;
  private readonly canvas = $<HTMLCanvasElement>('#game-canvas')!;
  private readonly ctx = this.canvas.getContext('2d')!;
  private readonly card = $('#game-card')!;
  private readonly scoreEl = $('#game-score')!;
  private readonly bestEl = $('#game-best')!;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private raf = 0;
  private last = 0;
  private state: 'ready' | 'play' | 'dead' = 'ready';
  private body: Vec[] = [];
  private head: Vec = { x: 0, y: 0 };
  private heading = 0;
  private target: Vec = { x: 0, y: 0 };
  private keys = { x: 0, y: 0 };
  private embers: Ember[] = [];
  private mines: Mine[] = [];
  private sparks: Spark[] = [];
  private score = 0;
  private best = Number(store.get('kg-ember-best') ?? 0) || 0;
  private length = 18;
  private shake = 0;
  private time = 0;
  private spawnMine = 2;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly hooks: GameHooks) {
    this.bestEl.textContent = String(this.best);
    document.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!t) return;
      if (t.dataset.action === 'game') this.open();
      if (t.dataset.action === 'game-close') this.close();
      if (t.dataset.action === 'game-start') this.start();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.target.x = e.clientX;
      this.target.y = e.clientY;
      this.keys.x = this.keys.y = 0;
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      this.target.x = e.clientX;
      this.target.y = e.clientY;
      if (this.state === 'dead') this.start();
    });
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') this.close();
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.keys.x = -1;
      if (k === 'arrowright' || k === 'd') this.keys.x = 1;
      if (k === 'arrowup' || k === 'w') this.keys.y = -1;
      if (k === 'arrowdown' || k === 's') this.keys.y = 1;
      if ((k === ' ' || k === 'enter') && this.state !== 'play') {
        e.preventDefault();
        this.start();
      }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) this.keys.x = 0;
      if (['arrowup', 'arrowdown', 'w', 's'].includes(k)) this.keys.y = 0;
    });
    window.addEventListener('resize', () => !this.root.hidden && this.resize());
  }

  open() {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.root.hidden = false;
    this.resize();
    this.reset();
    this.state = 'ready';
    this.card.hidden = false;
    this.card.querySelector<HTMLButtonElement>('[data-action="game-start"]')?.focus();
    this.hooks.open();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
    this.hooks.close();
    this.returnFocus?.focus?.({ preventScroll: true });
  }

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
  }

  private reset() {
    this.head = { x: this.w * 0.3, y: this.h * 0.5 };
    this.target = { x: this.w * 0.6, y: this.h * 0.5 };
    this.heading = 0;
    this.length = 18;
    this.body = Array.from({ length: 120 }, (_, i) => ({ x: this.head.x - i * 6, y: this.head.y }));
    this.embers = [];
    this.mines = [];
    this.sparks = [];
    this.score = 0;
    this.spawnMine = 2.5;
    this.scoreEl.textContent = '0';
    for (let i = 0; i < 6; i++) this.addEmber();
  }

  private start() {
    this.reset();
    this.state = 'play';
    this.card.hidden = true;
    this.canvas.focus?.();
    this.hooks.sound('start');
  }

  private addEmber() {
    const pad = 60;
    this.embers.push({
      x: pad + Math.random() * (this.w - pad * 2),
      y: pad + Math.random() * (this.h - pad * 2),
      r: 7 + Math.random() * 4,
      phase: Math.random() * 6.28,
      gold: Math.random() < 0.12,
    });
  }

  private addMine() {
    const edge = Math.floor(Math.random() * 4);
    const x = edge === 0 ? -30 : edge === 1 ? this.w + 30 : Math.random() * this.w;
    const y = edge === 2 ? -30 : edge === 3 ? this.h + 30 : Math.random() * this.h;
    const a = Math.atan2(this.head.y - y, this.head.x - x) + (Math.random() - 0.5) * 0.8;
    const sp = 60 + Math.random() * 70 + this.score * 2;
    this.mines.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 14 + Math.random() * 10, spin: Math.random() * 6 });
  }

  private burst(x: number, y: number, hue: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 240;
      this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, hue });
    }
  }

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (this.state === 'play') this.update(dt);
    this.updateSparks(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    // steering: toward pointer, or keys
    let tx = this.target.x;
    let ty = this.target.y;
    if (this.keys.x || this.keys.y) {
      tx = this.head.x + this.keys.x * 200;
      ty = this.head.y + this.keys.y * 200;
    }
    const want = Math.atan2(ty - this.head.y, tx - this.head.x);
    let d = want - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const dist = Math.hypot(tx - this.head.x, ty - this.head.y);
    if (dist > 8) this.heading += Math.max(-1, Math.min(1, d)) * dt * 7;
    const speed = 210 + this.score * 3;
    this.head.x += Math.cos(this.heading) * speed * dt;
    this.head.y += Math.sin(this.heading) * speed * dt;
    // wrap around the arena
    if (this.head.x < -20) this.head.x = this.w + 20;
    if (this.head.x > this.w + 20) this.head.x = -20;
    if (this.head.y < -20) this.head.y = this.h + 20;
    if (this.head.y > this.h + 20) this.head.y = -20;
    // follow-the-leader body
    this.body[0].x = this.head.x;
    this.body[0].y = this.head.y;
    const spacing = 7;
    const n = Math.min(this.body.length, Math.round(this.length));
    for (let i = 1; i < n; i++) {
      const a = this.body[i - 1];
      const b = this.body[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy);
      if (l > spacing) {
        if (l > 200) {
          b.x = a.x;
          b.y = a.y;
        } else {
          b.x = a.x + (dx / l) * spacing;
          b.y = a.y + (dy / l) * spacing;
        }
      }
    }
    // eat
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      if (Math.hypot(e.x - this.head.x, e.y - this.head.y) < e.r + 14) {
        this.embers.splice(i, 1);
        this.score += e.gold ? 5 : 1;
        this.length = Math.min(this.body.length, this.length + (e.gold ? 6 : 2.5));
        this.scoreEl.textContent = String(this.score);
        this.burst(e.x, e.y, e.gold ? 45 : 18, e.gold ? 40 : 18);
        this.hooks.sound(e.gold ? 'gold' : 'eat');
        this.addEmber();
      }
    }
    // mines
    this.spawnMine -= dt;
    if (this.spawnMine <= 0) {
      this.addMine();
      this.spawnMine = Math.max(0.55, 2.6 - this.score * 0.05);
    }
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.spin += dt * 3;
      if (m.x < -80 || m.x > this.w + 80 || m.y < -80 || m.y > this.h + 80) {
        this.mines.splice(i, 1);
        continue;
      }
      if (Math.hypot(m.x - this.head.x, m.y - this.head.y) < m.r + 10) this.die();
    }
  }

  private die() {
    this.state = 'dead';
    this.shake = 1;
    this.burst(this.head.x, this.head.y, 330, 120);
    this.hooks.sound('die');
    if (this.score > this.best) {
      this.best = this.score;
      store.set('kg-ember-best', String(this.best));
      this.bestEl.textContent = String(this.best);
    }
    const card = this.card;
    card.querySelector('h3')!.textContent = `Score ${this.score}. ${this.score >= this.best && this.score > 0 ? 'New best!' : 'Again?'}`;
    card.querySelector('[data-action="game-start"] span')!.textContent = 'Play again';
    window.setTimeout(() => {
      if (this.state === 'dead') card.hidden = false;
    }, 700);
  }

  private updateSparks(dt: number) {
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt * 1.4;
      s.vx *= 1 - dt * 2.5;
      s.vy *= 1 - dt * 2.5;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) this.sparks.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }

  private draw() {
    const { ctx, dpr, w, h } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#060409';
    ctx.fillRect(0, 0, w, h);
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 18 * this.shake, (Math.random() - 0.5) * 18 * this.shake);
    // grid
    ctx.strokeStyle = 'rgba(255, 70, 200, 0.07)';
    ctx.lineWidth = 1;
    const g = 48;
    const off = (this.time * 12) % g;
    ctx.beginPath();
    for (let x = -off; x < w; x += g) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = -off; y < h; y += g) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    // embers
    for (const e of this.embers) {
      const pulse = 1 + Math.sin(this.time * 5 + e.phase) * 0.18;
      const r = e.r * pulse;
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r * 3.2);
      grad.addColorStop(0, e.gold ? 'rgba(255,240,170,1)' : 'rgba(255,220,150,1)');
      grad.addColorStop(0.3, e.gold ? 'rgba(255,190,40,0.8)' : 'rgba(255,110,30,0.75)');
      grad.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // mines
    for (const m of this.mines) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.spin);
      ctx.strokeStyle = 'rgba(160, 90, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const rr = k % 2 ? m.r * 0.55 : m.r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(40, 0, 80, 0.6)';
      ctx.fill();
      ctx.restore();
    }
    // wyrm
    const n = Math.min(this.body.length, Math.round(this.length));
    if (this.state !== 'dead') {
      for (let i = n - 1; i >= 0; i--) {
        const p = this.body[i];
        const t = i / n;
        const r = (1 - t) * 11 + 3;
        const hue = 330 - t * 140 + Math.sin(this.time * 2 + i * 0.2) * 20;
        ctx.fillStyle = `hsla(${hue}, 100%, ${55 + (1 - t) * 15}%, ${0.55 + (1 - t) * 0.4})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // head: horns + eyes
      const hx = this.head.x;
      const hy = this.head.y;
      const a = this.heading;
      ctx.fillStyle = '#fff';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(hx + Math.cos(a + s * 0.6) * 8, hy + Math.sin(a + s * 0.6) * 8, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(a + s * 1.8) * 9, hy + Math.sin(a + s * 1.8) * 9);
        ctx.lineTo(hx + Math.cos(a + s * 2.4) * 22, hy + Math.sin(a + s * 2.4) * 22);
        ctx.stroke();
      }
    }
    // sparks
    for (const s of this.sparks) {
      ctx.fillStyle = `hsla(${s.hue}, 100%, 65%, ${s.life})`;
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

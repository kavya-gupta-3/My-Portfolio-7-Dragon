import { mulberry32 } from '../core/math';
import { $$ } from './dom';

/**
 * Generative cover art for each project card — no screenshots, just a
 * seeded drawing in the project's hue (flow fields, rings, isometric
 * blocks, waveforms or a pixel grid).
 */
function draw(canvas: HTMLCanvasElement) {
  const seed = Number(canvas.dataset.seed ?? 1);
  const hue = Number(canvas.dataset.hue ?? 200);
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rnd = mulberry32(seed * 7919);
  const col = (l: number, a: number, dh = 0) => `hsla(${hue + dh}, 100%, ${l}%, ${a})`;
  ctx.fillStyle = '#07060a';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.8);
  g.addColorStop(0, col(30, 0.55));
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';
  const mode = seed % 5;
  if (mode === 1) {
    // flow field streaks
    for (let i = 0; i < 520; i++) {
      let x = rnd() * w;
      let y = rnd() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 26; k++) {
        const a = Math.sin(x * 0.006 + seed) * 2 + Math.cos(y * 0.008 - seed) * 2;
        x += Math.cos(a) * 6 * dpr;
        y += Math.sin(a) * 6 * dpr;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col(50 + rnd() * 30, 0.16, rnd() * 60 - 30);
      ctx.lineWidth = dpr;
      ctx.stroke();
    }
  } else if (mode === 2) {
    // rings and orbiting dots
    const cx = w * (0.35 + rnd() * 0.3);
    const cy = h * 0.55;
    for (let r = 10; r < w; r += 14 * dpr) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = col(55, 0.12 + 0.12 * Math.sin(r * 0.05));
      ctx.lineWidth = dpr;
      ctx.stroke();
      const a = rnd() * Math.PI * 2;
      ctx.fillStyle = col(75, 0.8, 30);
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3 * dpr, 3 * dpr);
    }
  } else if (mode === 3) {
    // waveform lines
    for (let l = 0; l < 26; l++) {
      ctx.beginPath();
      const y0 = (l / 26) * h;
      for (let x = 0; x <= w; x += 4 * dpr) {
        const y = y0 + Math.sin(x * 0.012 + l * 0.6) * 14 * dpr * Math.sin(l * 0.4 + seed) + Math.sin(x * 0.05 + l) * 3 * dpr;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = col(55 + l, 0.22, l * 3);
      ctx.lineWidth = dpr * 1.2;
      ctx.stroke();
    }
  } else if (mode === 4) {
    // pixel grid with flux
    const s = 12 * dpr;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        const v = Math.sin(x * 0.01 + seed) * Math.cos(y * 0.013) + rnd() * 0.6;
        if (v > 0.45) {
          ctx.fillStyle = col(45 + v * 30, 0.15 + v * 0.35, v * 40);
          ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        }
      }
    }
  } else {
    // isometric blocks
    const s = 26 * dpr;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const k = s * (0.4 + rnd());
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + k, y - k * 0.5);
      ctx.lineTo(x + k * 2, y);
      ctx.lineTo(x + k, y + k * 0.5);
      ctx.closePath();
      ctx.strokeStyle = col(60, 0.35, rnd() * 50);
      ctx.lineWidth = dpr;
      ctx.stroke();
      ctx.fillStyle = col(50, 0.06);
      ctx.fill();
    }
  }
  // scanlines
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 3 * dpr) ctx.fillRect(0, y, w, dpr);
}

export function initProjectArt() {
  const canvases = $$<HTMLCanvasElement>('.proj-canvas');
  const paint = () => canvases.forEach(draw);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) draw(e.target as HTMLCanvasElement);
    },
    { rootMargin: '200px' },
  );
  canvases.forEach((c) => io.observe(c));
  let t = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(t);
    t = window.setTimeout(paint, 250);
  });

}

import { gsap } from 'gsap';
import type { Scroll } from '../core/scroll';
import { toast } from './dom';

/** How fast it goes, in screen heights a second: each film plays out, the whole site takes about two minutes. */
const PACE = 0.3;
/** Seconds it holds the first picture before setting off. */
const HOLD = 1.6;
const TAKE_OVER = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * The auto-tour: the page scrolls itself, at a steady pace you can watch,
 * from wherever it starts to the very end. Anything the visitor does (a
 * scroll, a tap, a key) hands the wheel straight back.
 */
export class Tour {
  private y = 0;
  private wait = 0;
  private running = false;
  private readonly tick = (_time: number, deltaMs: number) => this.step(deltaMs / 1000);
  private readonly takeOver = () => this.stop('Tour stopped. The wheel is yours.');

  constructor(private readonly scroll: Scroll) {}

  get active() {
    return this.running;
  }

  /** From `from` (px), or from where the page is now when it's null. */
  start(from: number | null) {
    this.stop();
    this.running = true;
    if (from !== null) this.scroll.to(from, true);
    this.y = from ?? window.scrollY;
    this.wait = from === null ? 0.3 : HOLD;
    gsap.ticker.add(this.tick);
    // the press that started it must not be the one that ends it
    window.setTimeout(() => {
      if (this.running) for (const type of TAKE_OVER) window.addEventListener(type, this.takeOver, { passive: true });
    }, 400);
    toast('Auto-tour: sit back. Scroll, tap or press any key to take over.', 3800);
  }

  stop(message?: string) {
    if (!this.running) return;
    this.running = false;
    gsap.ticker.remove(this.tick);
    for (const type of TAKE_OVER) window.removeEventListener(type, this.takeOver);
    if (message) toast(message);
  }

  private step(dt: number) {
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    const end = document.documentElement.scrollHeight - window.innerHeight;
    this.y = Math.min(end, this.y + window.innerHeight * PACE * Math.min(dt, 0.05));
    this.scroll.to(this.y, true);
    if (this.y >= end) this.stop('That’s all seven. Thanks for watching.');
  }
}

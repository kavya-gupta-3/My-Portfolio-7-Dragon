import { gsap } from 'gsap';
import { smoothstep } from '../core/math';
import { $ } from './dom';

/**
 * The forged name on the page. The bitmap itself never changes: a mask wipes
 * it on and burns it away, and a hot edge, a slow glint and a light that
 * follows the pointer are composited over the letters.
 */
export class HeroName {
  private readonly root = $('.hero-name');
  private readonly hot = $('.hn-hot');
  private readonly spot = $('.hn-spot');
  private readonly canvas = $<HTMLCanvasElement>('#hero-name-canvas');
  private burn = -1;
  private revealing = false;
  private box: DOMRect | null = null;
  private scrolled = -1;

  get element() {
    return this.canvas;
  }

  /** Set the hot edge: `at` is 0‥1 across the name, `lean` keeps it on the metal side of the wipe. */
  private edge(at: number, power: number, lean = 0) {
    if (!this.hot) return;
    this.hot.style.opacity = String(power);
    this.hot.style.transform = `translate3d(${(at * 6.82 - 1.73 + lean) * 100}%, 0, 0) skewX(-12deg)`;
  }

  /** The name burns on from left to right. */
  reveal(seconds: number) {
    const el = this.root;
    if (!el) return;
    this.revealing = true;
    el.classList.add('is-forging');
    const state = { r: 0 };
    gsap.to(state, {
      r: 1,
      duration: seconds,
      ease: 'power2.inOut',
      onUpdate: () => {
        el.style.setProperty('--r', state.r.toFixed(4));
        this.edge(state.r, Math.sin(state.r * Math.PI), -0.5);
      },
      onComplete: () => {
        el.classList.remove('is-forging');
        this.edge(1, 0);
        this.revealing = false;
      },
    });
  }

  show() {
    this.root?.classList.add('is-shown');
  }

  /** Hide it again, ready to be forged on (the opening can be replayed). */
  reset() {
    this.root?.classList.remove('is-shown');
    this.root?.style.setProperty('--r', '0');
  }

  /** Scroll: the name burns away as the seven leave. */
  scroll(hero: number) {
    const el = this.root;
    if (!el || this.revealing) return;
    const b = smoothstep(0.02, 0.4, hero);
    if (b === this.burn) return;
    this.burn = b;
    el.classList.toggle('is-burning', b > 0 && b < 1);
    el.style.visibility = b >= 1 ? 'hidden' : '';
    if (b > 0) {
      el.style.setProperty('--b', b.toFixed(4));
      this.edge(b, Math.sin(b * Math.PI), 0.5);
    } else this.edge(1, 0);
  }

  /** The light that follows the pointer across the metal. */
  pointer(x: number, y: number) {
    const el = this.root;
    const spot = this.spot;
    if (!el || !spot || this.burn > 0) return;
    if (window.scrollY !== this.scrolled || !this.box) {
      this.scrolled = window.scrollY;
      this.box = el.getBoundingClientRect();
    }
    const b = this.box;
    const inside = x > b.left - 60 && x < b.right + 60 && y > b.top - 60 && y < b.bottom + 60;
    spot.classList.toggle('is-on', inside);
    if (inside) gsap.set(spot, { x: x - b.left, y: y - b.top });
  }

  resized() {
    this.box = null;
  }
}

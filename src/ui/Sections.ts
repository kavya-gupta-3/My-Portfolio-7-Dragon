import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Keeps only three chapters alive: the one on screen and its two neighbours.
 * The rest stay in the page at their exact height so the scrollbar and every
 * position stay true, but the browser skips their style, layout, paint and
 * animations until the reader gets near. They stay searchable and focusable.
 */
export class LiveWindow {
  private current = -1;
  private measured = false;

  constructor(private readonly sections: HTMLElement[]) {
    // ScrollTrigger measures the real page, so it has to see all of it
    ScrollTrigger.addEventListener('refreshInit', () => this.wake());
    ScrollTrigger.addEventListener('refresh', () => this.settle());
  }

  private wake() {
    for (const s of this.sections) s.classList.remove('is-dormant');
  }

  private settle() {
    for (const s of this.sections) {
      const body = s.querySelector<HTMLElement>('.stage-body');
      if (body) s.style.setProperty('--h', `${body.getBoundingClientRect().height}px`);
    }
    this.measured = true;
    this.apply();
  }

  private apply() {
    if (!this.measured) return;
    this.sections.forEach((s, i) => s.classList.toggle('is-dormant', Math.abs(i - this.current) > 1));
  }

  update(scene: number) {
    if (scene === this.current) return;
    this.current = scene;
    this.apply();
  }
}

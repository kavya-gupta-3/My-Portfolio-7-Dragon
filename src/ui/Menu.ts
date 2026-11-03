import { gsap } from 'gsap';
import { $, $$ } from './dom';

export class Menu {
  private readonly el = $('#menu');
  private readonly btn = $<HTMLButtonElement>('[data-action="menu"]');
  open = false;

  constructor(private readonly onToggle: (open: boolean) => void) {
    this.btn?.addEventListener('click', () => this.toggle());
    this.el?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('a, [data-action="menu-close"]')) this.toggle(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.toggle(false);
    });
  }

  toggle(force?: boolean) {
    const next = force ?? !this.open;
    if (next === this.open || !this.el) return;
    this.open = next;
    document.documentElement.classList.toggle('menu-open', next);
    this.btn?.setAttribute('aria-expanded', String(next));
    if (next) {
      this.el.hidden = false;
      requestAnimationFrame(() => this.el!.classList.add('is-open'));
      $('.menu-close', this.el)?.focus({ preventScroll: true });
      gsap.fromTo(
        $$('.menu-list li', this.el),
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.05, duration: 0.7, ease: 'expo.out', delay: 0.2 },
      );
    } else {
      this.el.classList.remove('is-open');
      this.btn?.focus({ preventScroll: true });
      window.setTimeout(() => {
        if (!this.open && this.el) this.el.hidden = true;
      }, 800);
    }
    this.onToggle(next);
  }
}

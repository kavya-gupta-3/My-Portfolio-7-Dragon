import { STAGES } from '../data/content';
import { $, $$ } from './dom';

/**
 * The quiet frame around the film: accent theming per dragon, nav and rail
 * state, the nav's sliding indicator and the small "who is this" chip.
 */
export class Hud {
  private stage = -1;
  private readonly links = $$<HTMLAnchorElement>('[data-goto]');
  private readonly name = $('#sp-name');
  private readonly epithet = $('#sp-epithet');
  private readonly theme = $<HTMLMetaElement>('meta[name="theme-color"]');
  private readonly nav = $('.hud-nav');

  constructor() {
    this.nav?.addEventListener('pointerover', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a');
      if (a) this.slide(a);
    });
    this.nav?.addEventListener('pointerleave', () => this.slide());
  }

  setStage(i: number) {
    if (i === this.stage) return;
    this.stage = i;
    const s = STAGES[i];
    // only the frame around the film takes the new accent: the page's
    // chapters carry their own, and restyling all of them is a dropped frame
    for (const el of Array.from(document.body.children) as HTMLElement[]) if (el.id !== 'main') el.dataset.stage = String(i);
    this.theme?.setAttribute('content', '#07060a');
    for (const a of this.links) a.classList.toggle('is-active', Number(a.dataset.goto) === i);
    if (this.name) this.name.textContent = s.dragon;
    if (this.epithet) this.epithet.textContent = s.epithet;
    this.slide();
  }

  /** Move the pill behind a nav link: the active one unless the pointer says otherwise. */
  slide(to?: HTMLElement) {
    const a = to ?? this.nav?.querySelector<HTMLElement>('a.is-active');
    if (!a || !this.nav) return;
    const box = this.nav.getBoundingClientRect();
    const r = a.getBoundingClientRect();
    this.nav.style.setProperty('--x', `${r.left - box.left}px`);
    this.nav.style.setProperty('--w', `${r.width}px`);
  }
}

import { FILM, STAGES } from '../data/content';
import { $ } from './dom';

/**
 * The name that hits the screen in a dragon's entrance. Every dragon's letters
 * arrive in their own way (see `.entry` in sections.css): this only fills the
 * card in and says when.
 */
export class EntryTitle {
  private readonly root = $('#entry');
  private readonly kicker = $('.en-kicker');
  private readonly name = $('.en-name');
  private readonly sub = $('.en-sub');
  private readonly word = $('.en-say');
  private timer = 0;

  arm(i: number) {
    const el = this.root;
    if (!el) return;
    window.clearTimeout(this.timer);
    const s = STAGES[i];
    el.dataset.dragon = String(i);
    el.style.setProperty('--c1', s.color);
    el.style.setProperty('--c2', s.color2);
    el.classList.remove('is-on', 'is-out');
    el.classList.add('is-armed');
    if (this.kicker) this.kicker.textContent = s.epithet;
    if (this.sub) this.sub.textContent = FILM[i].title;
    if (this.name) this.name.innerHTML = [...s.dragon].map((c, k) => `<span style="--i:${k}">${c}</span>`).join('');
  }

  slam() {
    this.root?.classList.add('is-on');
  }

  /** A word that punches onto the screen and is gone again (a countdown, a warning). */
  say(text: string) {
    const w = this.word;
    if (!w) return;
    w.textContent = text;
    w.classList.remove('is-said');
    // restart the animation from its first frame
    void w.offsetWidth;
    w.classList.add('is-said');
  }

  leave() {
    const el = this.root;
    if (!el) return;
    el.classList.add('is-out');
    this.timer = window.setTimeout(() => {
      el.classList.remove('is-on', 'is-out', 'is-armed');
      this.word?.classList.remove('is-said');
    }, 800);
  }
}

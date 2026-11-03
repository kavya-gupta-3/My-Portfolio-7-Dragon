import { smoothstep } from '../core/math';
import { $, $$ } from './dom';

interface FilmLine {
  el: HTMLElement;
  at: number;
  to: number;
  words: number;
}

interface FilmEl {
  root: HTMLElement;
  card: HTMLElement | null;
  sub: HTMLElement | null;
  cardAt: number;
  cardTo: number;
  lines: FilmLine[];
}

/** Rough speaking pace, seconds per word: the jaw moves for this long. */
const PACE = 0.27;

/**
 * Runs the film overlays: the chapter card, one subtitle at a time, and the
 * "speaking" signal the dragon's jaw follows. Everything is a class toggle,
 * so nothing here touches layout while the reader scrolls.
 */
export class Story {
  private readonly films: FilmEl[];
  private activeFilm = -1;
  private activeLine: FilmLine | null = null;
  private cardOn: HTMLElement | null = null;
  private lineStart = 0;
  private filming = false;
  /** The things that step back while a film plays. */
  private readonly framed = $$('.hud-top, .bars, .hud-chip');
  private readonly chip = $('.hud-chip');
  private chipTimer = 0;
  speaking = 0;

  /** How many words the line on screen has. */
  get words() {
    return this.activeLine?.words ?? 0;
  }

  constructor() {
    this.films = $$('.film').map((root) => {
      const [cardAt, cardTo] = (root.dataset.card ?? '0,0.1').split(',').map(Number);
      return {
        root,
        card: root.querySelector<HTMLElement>('.film-card'),
        sub: root.querySelector<HTMLElement>('.film-sub'),
        cardAt,
        cardTo,
        lines: $$('.line', root).map((el) => ({
          el,
          at: Number(el.dataset.at),
          to: Number(el.dataset.to),
          words: Number(el.dataset.words),
        })),
      };
    });
  }

  /** Say whose chapter this is, then get out of the way of the page. */
  private announce() {
    const chip = this.chip;
    if (!chip) return;
    chip.classList.add('is-on');
    window.clearTimeout(this.chipTimer);
    this.chipTimer = window.setTimeout(() => chip.classList.remove('is-on'), 4500);
  }

  update(scene: number, p: number, inFilm: boolean, time: number, dt: number) {
    // on the three things that care: a class on <html> restyles the whole page
    if (inFilm !== this.filming) {
      this.filming = inFilm;
      for (const el of this.framed) el.classList.toggle('in-film', inFilm);
      if (!inFilm) this.announce();
    }
    const film = this.films[scene];
    if (this.activeFilm !== scene) {
      this.setLine(null);
      this.setCard(null);
      this.activeFilm = scene;
    }
    if (!film) return;
    this.setCard(p >= film.cardAt && p < film.cardTo && inFilm ? film.card : null);
    let line: FilmLine | null = null;
    if (inFilm) for (const l of film.lines) if (p >= l.at && p < l.to) line = l;
    if (line !== this.activeLine) {
      this.setLine(line);
      film.sub?.classList.toggle('is-on', !!line);
      this.lineStart = time;
    }
    const spoken = this.activeLine ? (time - this.lineStart) / (this.activeLine.words * PACE) : 2;
    const target = spoken < 1 ? 1 - smoothstep(0.92, 1, spoken) : 0;
    this.speaking += (target - this.speaking) * Math.min(1, dt * 12);
  }

  private setCard(el: HTMLElement | null) {
    if (el === this.cardOn) return;
    this.cardOn?.classList.remove('is-on');
    el?.classList.add('is-on');
    this.cardOn = el;
  }

  private setLine(line: FilmLine | null) {
    this.activeLine?.el.classList.remove('is-on');
    line?.el.classList.add('is-on');
    if (!line) for (const f of this.films) f.sub?.classList.remove('is-on');
    this.activeLine = line;
  }
}

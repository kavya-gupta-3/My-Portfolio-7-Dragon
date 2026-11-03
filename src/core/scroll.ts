import Lenis from 'lenis';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp } from './math';

interface SectionMetric {
  el: HTMLElement;
  film: HTMLElement | null;
  body: HTMLElement | null;
  /** The first thing on the page, and where in the film the page takes over. */
  first: HTMLElement | null;
  outro: number;
  /** Where the film starts, and how far it stays pinned. */
  filmTop: number;
  filmSpan: number;
  bodyTop: number;
  bodyHeight: number;
}

/** A cut happens when the next chapter has climbed to this share of the screen. */
const CUT_LINE = 0.42;
/** Page content fades in as it crosses this share of the screen from the top. */
const REVEAL_LINE = 0.88;

/**
 * Smooth scrolling (Lenis) plus the numbers the film is driven by:
 *  - `scene`: the chapter on screen. It changes in whole steps: chapters are
 *    separated by a cut, not blended.
 *  - `p`: progress through that chapter's pinned film (0‥1).
 *  - `hero`: progress out of the opening shot (0‥1).
 *  - `local[i]`: how far the reader is through section i's content (0‥1).
 */
export class Scroll {
  readonly lenis: Lenis | null;
  y = 0;
  velocity = 0;
  vh = window.innerHeight;
  max = 1;
  scene = 0;
  p = 0;
  hero = 0;
  /** True while the pinned film fills the screen. */
  inFilm = false;
  /** How far the page has come in over the end of its film (0‥1). */
  page = 0;
  local: number[] = [];
  private sections: SectionMetric[] = [];
  private heroEl: HTMLElement | null = null;
  private heroHeight = 1;
  private lastY = 0;

  constructor(smooth: boolean) {
    this.lenis = smooth
      ? new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true, syncTouch: false, autoRaf: false })
      : null;
    this.lenis?.on('scroll', ScrollTrigger.update);
    ScrollTrigger.addEventListener('refreshInit', () => this.overlap());
    ScrollTrigger.addEventListener('refresh', () => this.measure());
    window.addEventListener('resize', () => this.measure());
  }

  attach(elements: HTMLElement[], hero: HTMLElement | null, outros: number[]) {
    this.heroEl = hero;
    this.sections = elements.map((el, i) => {
      const body = el.querySelector<HTMLElement>('.stage-body');
      return {
        el,
        film: el.querySelector<HTMLElement>('.film'),
        body,
        // the first words on the page, not the padding above them
        first: body?.querySelector<HTMLElement>('.sec-meta') ?? body?.querySelector<HTMLElement>('[data-reveal]') ?? null,
        outro: outros[i] ?? 1,
        filmTop: 0,
        filmSpan: 1,
        bodyTop: 0,
        bodyHeight: 1,
      };
    });
    this.local = elements.map(() => 0);
    this.overlap();
    this.measure();
    // content that arrives late (live GitHub stats, fonts) moves everything below it
    new ResizeObserver(() => this.measure()).observe(document.body);
  }

  /**
   * Pulls each page up over the end of its film, so its first line of content
   * comes into view at the moment the film's last line has gone: the dragon's
   * final move plays as the page rises, with nothing empty to scroll through in
   * between. Never by more than a screen, so a page's top is still the film's end.
   */
  private overlap() {
    const vh = window.innerHeight;
    for (const s of this.sections) {
      if (!s.film || !s.body || !s.first) continue;
      const span = Math.max(1, s.film.getBoundingClientRect().height - vh);
      const lead = s.first.getBoundingClientRect().top - s.body.getBoundingClientRect().top;
      const pull = Math.min(vh * 0.96, (1 - s.outro) * span + lead + vh * (1 - REVEAL_LINE));
      const value = `${-Math.round(pull)}px`;
      if (s.body.style.marginTop !== value) s.body.style.marginTop = value;
    }
  }

  measure() {
    this.vh = window.innerHeight;
    const sy = window.scrollY;
    this.heroHeight = Math.max(1, this.heroEl?.getBoundingClientRect().height ?? this.vh);
    for (const s of this.sections) {
      const f = s.film?.getBoundingClientRect();
      const b = s.body?.getBoundingClientRect();
      s.filmTop = (f?.top ?? 0) + sy;
      s.filmSpan = Math.max(1, (f?.height ?? this.vh) - this.vh);
      s.bodyTop = (b?.top ?? 0) + sy;
      s.bodyHeight = Math.max(1, b?.height ?? 1);
    }
    this.max = Math.max(1, document.documentElement.scrollHeight - this.vh);
  }

  raf(timeMs: number) {
    this.lenis?.raf(timeMs);
  }

  update(dt: number) {
    const y = this.lenis ? this.lenis.animatedScroll : window.scrollY;
    this.velocity = this.lenis ? this.lenis.velocity : (y - this.lastY) / Math.max(dt * 60, 1e-3);
    this.lastY = y;
    this.y = y;
    this.hero = clamp(y / this.heroHeight);
    let scene = 0;
    for (let k = 1; k < this.sections.length; k++) {
      if (y + this.vh * CUT_LINE >= this.sections[k].filmTop) scene = k;
    }
    this.scene = scene;
    const s = this.sections[scene];
    this.p = s ? clamp((y - s.filmTop) / s.filmSpan) : 0;
    this.inFilm = !!s && y >= s.filmTop - 1 && this.p < s.outro;
    this.page = s ? clamp((this.p - s.outro) / Math.max(1 - s.outro, 1e-3)) : 0;
    for (let i = 0; i < this.sections.length; i++) {
      const b = this.sections[i];
      this.local[i] = clamp((y + this.vh - b.bodyTop) / (b.bodyHeight + this.vh));
    }
  }

  get progress() {
    return clamp(this.y / this.max);
  }

  /** Scroll offset for a point `p` of chapter `i`'s film. */
  filmOffset(i: number, p: number) {
    const s = this.sections[i];
    return s ? s.filmTop + s.filmSpan * p : 0;
  }

  /** Scroll offset of chapter `i`'s page content. */
  bodyOffset(i: number) {
    return this.sections[i]?.bodyTop ?? 0;
  }

  to(target: number | HTMLElement, immediate = false) {
    if (this.lenis) {
      this.lenis.scrollTo(target, { immediate, force: true, duration: immediate ? 0 : 2.2, easing: (t) => 1 - Math.pow(1 - t, 4) });
    } else {
      const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top, behavior: immediate ? 'auto' : 'smooth' });
    }
  }

  stop() {
    this.lenis?.stop();
    document.documentElement.classList.add('scroll-locked');
  }

  start() {
    this.lenis?.start();
    document.documentElement.classList.remove('scroll-locked');
  }
}

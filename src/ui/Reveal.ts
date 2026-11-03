import { gsap } from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { $, $$ } from './dom';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);

export interface RevealHooks {
  /** Continuous hobby chapter (0‥4). */
  onChapter: (chapter: number) => void;
}

/**
 * Every DOM animation that is tied to scrolling: reveals, split-text
 * headlines, the pinned horizontal hobby "levels", counters, the skill-tree
 * wiring and the dream parallax.
 */
export function initReveal(hooks: RevealHooks, reduced: boolean) {
  const mm = gsap.matchMedia();

  // ---------------------------------------------------------------- reveals
  const items = $$('[data-reveal]');
  if (reduced) {
    gsap.set(items, { opacity: 1 });
  } else {
    gsap.set(items, { opacity: 0, y: 46 });
    ScrollTrigger.batch(items, {
      start: 'top 88%',
      once: true,
      onEnter: (batch) =>
        gsap.to(batch, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: 'auto' }),
    });
  }

  // ----------------------------------------------------- split headlines
  for (const el of $$('.sec-title')) {
    const split = SplitText.create(el, { type: 'chars', charsClass: 'split-char' });
    if (reduced) continue;
    gsap.from(split.chars, {
      yPercent: 110,
      rotateX: -80,
      opacity: 0,
      transformOrigin: '50% 100% -40px',
      duration: 1.2,
      ease: 'expo.out',
      stagger: 0.035,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  }
  for (const el of $$('[data-split]:not(.sec-title)')) {
    const split = SplitText.create(el, { type: 'lines,words', linesClass: 'split-line', wordsClass: 'split-word' });
    if (reduced) continue;
    gsap.from(split.words, {
      yPercent: 105,
      opacity: 0,
      duration: 1,
      ease: 'expo.out',
      stagger: 0.025,
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  }

  // ---------------------------------------------------------- the verdict
  const verdict = $('.mf-verdict-main');
  if (verdict && !reduced) {
    gsap.fromTo(
      verdict,
      { clipPath: 'inset(0 100% 0 0)', scale: 1.08 },
      {
        clipPath: 'inset(0 0% 0 0)',
        scale: 1,
        ease: 'none',
        scrollTrigger: { trigger: verdict, start: 'top 92%', end: 'top 50%', scrub: true },
      },
    );
  }

  // ------------------------------------------------- hobbies, as levels
  const pin = $('.hobby-pin');
  const track = $('.hobby-track');
  const hobbies = $$('.hobby');
  const levels = $$('.hobby-levels li');
  const xp = $('#hobby-xp');
  let current = -1;
  const setLevel = (chapter: number) => {
    hooks.onChapter(chapter);
    const lv = Math.max(0, Math.min(4, Math.round(chapter)));
    xp?.style.setProperty('--p', String(Math.min(1, chapter / 4 + 0.001)));
    if (lv === current) return;
    current = lv;
    hobbies.forEach((h, i) => h.classList.toggle('is-on', i === lv));
    levels.forEach((l, i) => l.classList.toggle('is-on', i <= lv));
  };
  setLevel(0);
  if (pin && track) {
    mm.add('(min-width: 861px)', () => {
      const distance = () => track.scrollWidth - window.innerWidth;
      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: 'none',
        scrollTrigger: {
          trigger: pin,
          start: 'top top',
          end: () => `+=${distance() * 1.15}`,
          pin: true,
          scrub: reduced ? true : 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => setLevel(self.progress * 4),
        },
      });
      // parallax inside each level
      for (const h of hobbies) {
        const visual = h.querySelector('.hv');
        if (!visual || reduced) continue;
        gsap.fromTo(visual, { xPercent: 22, rotate: 6 }, {
          xPercent: -22,
          rotate: -6,
          ease: 'none',
          scrollTrigger: { trigger: h, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
        });
      }
      return () => tween.scrollTrigger?.kill();
    });
    mm.add('(max-width: 860px)', () => {
      const triggers = hobbies.map((h, i) =>
        ScrollTrigger.create({ trigger: h, start: 'top 60%', end: 'bottom 40%', onToggle: (s) => s.isActive && setLevel(i) }),
      );
      return () => triggers.forEach((t) => t.kill());
    });
  }

  // ----------------------------------------------------------- counters
  for (const el of $$<HTMLElement>('.ach-value[data-count]')) {
    const value = Number(el.dataset.count);
    const prefix = el.dataset.prefix ?? '';
    const suffix = el.dataset.suffix ?? '';
    const obj = { v: 0 };
    const paint = () => (el.textContent = `${prefix}${Math.round(obj.v)}${suffix}`);
    if (reduced || value === 0) continue;
    paint();
    gsap.to(obj, {
      v: value,
      duration: 2.2,
      ease: 'expo.out',
      onUpdate: paint,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    });
  }

  // ------------------------------------------------------ skill wiring
  const tree = $('#skill-tree');
  const svg = tree?.querySelector('svg');
  const root = tree?.querySelector('.skill-root');
  const branches = tree ? $$('.branch', tree) : [];
  const wire = () => {
    if (!tree || !svg || !root) return;
    const box = tree.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const x0 = r.left + r.width / 2 - box.left;
    const y0 = r.bottom - box.top;
    let paths = '';
    for (const b of branches) {
      const bb = b.getBoundingClientRect();
      const x1 = bb.left + bb.width / 2 - box.left;
      const y1 = bb.top - box.top;
      const my = (y0 + y1) / 2;
      paths += `<path d="M${x0},${y0} C${x0},${my} ${x1},${my} ${x1},${y1}"/><circle cx="${x1}" cy="${y1}" r="4"/>`;
    }
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.innerHTML = paths + `<circle cx="${x0}" cy="${y0}" r="4"/>`;
    if (!reduced) {
      gsap.fromTo(svg.querySelectorAll('path'), { drawSVG: '0%' }, {
        drawSVG: '100%',
        duration: 1.6,
        ease: 'expo.inOut',
        stagger: 0.12,
        scrollTrigger: { trigger: tree, start: 'top 70%', once: true },
      });
    }
  };
  wire();
  ScrollTrigger.addEventListener('refresh', wire);

  // ------------------------------------------------------ dream parallax
  if (!reduced) {
    $$('.dream').forEach((d, i) => {
      gsap.fromTo(d, { y: 80 + i * 40 }, { y: -60 - i * 30, ease: 'none', scrollTrigger: { trigger: d, start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.from(d, { opacity: 0, duration: 1.4, ease: 'power2.out', scrollTrigger: { trigger: d, start: 'top 85%', once: true } });
    });
  }

  // fonts and late layout shifts → recompute every trigger
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

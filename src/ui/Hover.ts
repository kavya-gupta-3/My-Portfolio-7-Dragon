import { gsap } from 'gsap';
import { STAGES } from '../data/content';
import { $ } from './dom';

/** Things that lean toward the pointer. */
const MAGNETIC = '.btn, .hud-btn, .brand, .proj-link, .foot-top, .menu-socials a, .menu-close, .scroll-cue';
/** Surfaces lit from inside by the pointer. */
const GLOW = '.panel, .ars-group, .vault-item, .pro-row, .social, .dream, .hobby-copy, .mf-rule, .hero-stats li';
const TILT = '[data-tilt]';

type Quick = (value: number) => void;
interface Lean {
  x: Quick;
  y: Quick;
}

const leans = new WeakMap<HTMLElement, Lean>();

function lean(el: HTMLElement, a: string, b: string, duration: number): Lean {
  let q = leans.get(el);
  if (!q) {
    q = { x: gsap.quickTo(el, a, { duration, ease: 'power3' }), y: gsap.quickTo(el, b, { duration, ease: 'power3' }) };
    leans.set(el, q);
  }
  return q;
}

/**
 * Every pointer effect on the page, from one handler. The move event only
 * records where the pointer is; the work happens once per frame, touches at
 * most three elements, and writes nothing but transforms and two custom
 * properties, so none of it can cost a layout or a repaint of the page.
 */
export function initHover(reduced: boolean, onPointer: (x: number, y: number) => void) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const html = document.documentElement;
  const light = $('.cursor-light');
  const tip = $('#dragon-tip');
  const tipName = $('#tip-name');
  const tipSub = $('#tip-sub');
  const tipHint = $('#tip-hint');
  if (!fine) return { showDragon: () => undefined };

  let px = 0;
  let py = 0;
  let dirty = false;
  let target: Element | null = null;
  let seen: Element | null = null;
  let glow: HTMLElement | null = null;
  let tilt: HTMLElement | null = null;
  let magnet: HTMLElement | null = null;
  let glowBox: DOMRect | null = null;
  let tiltBox: DOMRect | null = null;
  let magnetBox: DOMRect | null = null;
  let scrolled = window.scrollY;
  let tipOn = false;
  const lightX = light ? gsap.quickTo(light, 'x', { duration: 0.5, ease: 'power3' }) : null;
  const lightY = light ? gsap.quickTo(light, 'y', { duration: 0.5, ease: 'power3' }) : null;
  const tipX = tip ? gsap.quickTo(tip, 'x', { duration: 0.25, ease: 'power3' }) : null;
  const tipY = tip ? gsap.quickTo(tip, 'y', { duration: 0.25, ease: 'power3' }) : null;

  const settle = (el: HTMLElement | null, a: string, b: string, d: number) => {
    if (!el) return;
    const q = lean(el, a, b, d);
    q.x(0);
    q.y(0);
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      px = e.clientX;
      py = e.clientY;
      target = e.target as Element;
      dirty = true;
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => html.classList.add('pointer-out'));
  document.addEventListener('pointerenter', () => html.classList.remove('pointer-out'));

  gsap.ticker.add(() => {
    if (!dirty) return;
    dirty = false;
    if (target !== seen && target instanceof Element) {
      seen = target;
      const g = target.closest<HTMLElement>(GLOW);
      const t = reduced ? null : target.closest<HTMLElement>(TILT);
      const m = reduced ? null : target.closest<HTMLElement>(MAGNETIC);
      if (g !== glow) {
        glow = g;
        glowBox = g?.getBoundingClientRect() ?? null;
      }
      if (t !== tilt) {
        settle(tilt, 'rotateX', 'rotateY', 0.7);
        tilt = t;
        tiltBox = t?.getBoundingClientRect() ?? null;
        if (t) gsap.set(t, { transformPerspective: 1000 });
      }
      if (m !== magnet) {
        settle(magnet, 'x', 'y', 0.6);
        magnet = m;
        magnetBox = m?.getBoundingClientRect() ?? null;
      }
    }
    // boxes are read once per target, and again only if the page has moved
    const sy = window.scrollY;
    if (sy !== scrolled) {
      scrolled = sy;
      glowBox = glow?.getBoundingClientRect() ?? null;
      tiltBox = tilt?.getBoundingClientRect() ?? null;
    }
    if (glow && glowBox) {
      glow.style.setProperty('--mx', `${Math.round(px - glowBox.left)}px`);
      glow.style.setProperty('--my', `${Math.round(py - glowBox.top)}px`);
    }
    if (tilt && tiltBox) {
      const amount = tilt.dataset.tilt === 'soft' ? 3.5 : 7;
      const q = lean(tilt, 'rotateX', 'rotateY', 0.7);
      q.x(-((py - tiltBox.top) / tiltBox.height - 0.5) * amount);
      q.y(((px - tiltBox.left) / tiltBox.width - 0.5) * amount * 1.3);
    }
    if (magnet && magnetBox) {
      const pull = magnet.matches('.brand') ? 0.1 : 0.26;
      const q = lean(magnet, 'x', 'y', 0.6);
      q.x((px - magnetBox.left - magnetBox.width / 2) * pull);
      q.y((py - magnetBox.top - magnetBox.height / 2) * pull);
    }
    lightX?.(px);
    lightY?.(py);
    onPointer(px, py);
    if (tipOn) {
      tipX?.(px);
      tipY?.(py);
    }
  });

  return {
    /** Name the dragon under the pointer, or hide the label with −1. */
    showDragon(i: number, opening: boolean) {
      tipOn = i >= 0;
      if (!tip) return;
      tip.classList.toggle('is-on', tipOn);
      if (!tipOn) return;
      const s = STAGES[i];
      // written straight to the element: gsap would read the page's style back first
      tip.style.setProperty('--c1', s.color);
      tipX?.(px);
      tipY?.(py);
      if (tipName) tipName.textContent = s.dragon;
      if (tipSub) tipSub.textContent = s.epithet;
      if (tipHint) tipHint.textContent = opening ? `Click to meet · ${s.label}` : 'Click to provoke';
    },
  };
}

/**
 * The Kavya Gupta sigil: a hexagonal crest holding a dragon that is also a
 * "K" — the neck and spiked back form the stem, the wing is the upper arm
 * and the spade-tipped tail is the lower arm.
 *
 * Gradient stops read CSS custom properties so the inline copies recolour
 * themselves with each section's dragon. Every call gets unique ids so the
 * sigil can appear several times on one page.
 */

let counter = 0;

export interface SigilOptions {
  /** Extra class names on the <svg>. */
  className?: string;
  /** Draw the outer crest (hexagon). */
  frame?: boolean;
  /** Static colours instead of CSS variables (favicon, OG image). */
  colors?: [string, string, string];
  /** Accessible title; omit for decorative use. */
  title?: string;
  /** Solid background colour (favicon). */
  background?: string;
}

export const SIGIL_PATHS = {
  frameOuter: 'M60 4 L108 32 L108 88 L60 116 L12 88 L12 32 Z',
  frameInner: 'M60 11.5 L101.5 35.75 L101.5 84.25 L60 108.5 L18.5 84.25 L18.5 35.75 Z',
  hornMain: 'M41.5 25.5 L27 9.5 L47 21.8 Z',
  hornBack: 'M38.6 30 L30.5 22 L41 27 Z',
  head: 'M38 31 L47 22 L60.5 24.6 L68 29.4 L58.5 31 L66 33.6 L55 34.6 L49.5 38.5 L48 42.5 L38 42.5 Z',
  stem: 'M38 40 L48 40 L48 94 L43 106 L38 94 Z',
  spikes: 'M38 47 L31.5 50.5 L38 54 Z M38 60 L31 64 L38 68 Z M38 74 L32.5 77.5 L38 81 Z',
  wing: 'M48 57.5 L73 35 L96 16 Q86.5 30.5 98 40.5 Q83.5 42.5 86 56 Q73.5 52.5 66 60 Q58 59 49 66.5 Z',
  tail: 'M48 66.5 C60 72.5 70.5 80.5 79 88.5 L84.5 82.5 L92 98.5 L75.5 94.5 L80 91.5 C69 83.5 59 78.5 48 75.5 Z',
  bones: 'M73 35 L96 16 M73 35 L98 40.5 M73 35 L86 56 M73 35 L66 60',
  eye: 'M51.8 26.3 L57.6 27.2 L52.6 28.8 Z',
} as const;

export function sigil(options: SigilOptions = {}): string {
  const id = `sg${(counter++).toString(36)}`;
  const { className = '', frame = true, colors, title, background } = options;
  const [c0, c1, c2] = colors ?? ['var(--sigil-0, #fff0c4)', 'var(--sigil-1, #ff9a2e)', 'var(--sigil-2, #ff2f1f)'];
  const ink = background ?? 'var(--sigil-ink, #07060a)';
  const a11y = title ? `role="img" aria-labelledby="${id}t"` : 'aria-hidden="true" focusable="false"';
  const p = SIGIL_PATHS;
  return `<svg class="sigil ${className}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" ${a11y}>${
    title ? `<title id="${id}t">${title}</title>` : ''
  }<defs><linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="24" y1="8" x2="98" y2="112"><stop offset="0" stop-color="${c0}"/><stop offset=".42" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>${
    background ? `<rect width="120" height="120" rx="22" fill="${background}"/>` : ''
  }${
    frame
      ? `<path class="sigil-frame" d="${p.frameOuter}" fill="none" stroke="url(#${id}g)" stroke-width="2.2" stroke-linejoin="round"/><path class="sigil-frame-inner" d="${p.frameInner}" fill="none" stroke="url(#${id}g)" stroke-width=".7" opacity=".5"/>`
      : ''
  }<g class="sigil-body" fill="url(#${id}g)"><path d="${p.hornMain}"/><path d="${p.hornBack}" opacity=".85"/><path d="${p.head}"/><path d="${p.stem}"/><path d="${p.spikes}"/><path class="sigil-wing" d="${p.wing}" opacity=".95"/><path d="${p.tail}"/></g><path class="sigil-bones" d="${p.bones}" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/><path class="sigil-eye" d="${p.eye}" fill="${ink}"/></svg>`;
}

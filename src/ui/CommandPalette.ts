import { $, isTyping } from './dom';

export interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
}

/** Subsequence fuzzy match with a score (higher is better). */
function score(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const direct = t.indexOf(q);
  if (direct >= 0) return 100 - direct;
  let qi = 0;
  let s = 0;
  let run = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      run++;
      s += run;
    } else run = 0;
  }
  return qi === q.length ? s : -1;
}

/** ⌘K / Ctrl+K command palette — every action on the site, keyboard first. */
export class CommandPalette {
  private readonly el = $('#cmdk')!;
  private readonly input = $<HTMLInputElement>('#cmdk-input')!;
  private readonly list = $('#cmdk-list')!;
  private items: Command[] = [];
  private index = 0;
  private lastFocus: HTMLElement | null = null;

  constructor(private readonly commands: Command[], private readonly onToggle: (open: boolean) => void) {
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === '/' && !isTyping(e.target) && this.el.hidden) {
        e.preventDefault();
        this.toggle(true);
      } else if (!this.el.hidden) {
        if (e.key === 'Escape') this.toggle(false);
        else if (e.key === 'ArrowDown') this.move(1, e);
        else if (e.key === 'ArrowUp') this.move(-1, e);
        else if (e.key === 'Enter') {
          e.preventDefault();
          this.exec(this.items[this.index]);
        }
      }
    });
    this.input.addEventListener('input', () => this.render());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.toggle(false);
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
      if (li) this.exec(this.items[Number(li.dataset.i)]);
    });
    document.querySelector('[data-action="cmdk"]')?.addEventListener('click', () => this.toggle(true));
  }

  toggle(force?: boolean) {
    const open = force ?? Boolean(this.el.hidden);
    if (open === !this.el.hidden) return;
    this.el.hidden = !open;
    if (open) {
      this.lastFocus = document.activeElement as HTMLElement | null;
      this.input.value = '';
      this.render();
      this.input.focus();
    } else {
      this.lastFocus?.focus?.({ preventScroll: true });
    }
    this.onToggle(open);
  }

  private move(d: number, e: Event) {
    e.preventDefault();
    if (!this.items.length) return;
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.paint();
  }

  private exec(cmd?: Command) {
    if (!cmd) return;
    this.toggle(false);
    cmd.run();
  }

  private render() {
    const q = this.input.value.trim();
    this.items = this.commands
      .map((c) => ({ c, s: Math.max(score(q, c.label), score(q, c.keywords ?? '') - 5) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
    this.index = 0;
    this.list.innerHTML = this.items.length
      ? this.items
          .map((c, i) => `<li role="option" data-i="${i}" id="cmdk-${c.id}"><span>${c.label}</span><small>${c.hint ?? ''}</small></li>`)
          .join('')
      : `<li aria-disabled="true"><span>No dragon answers to that.</span></li>`;
    this.paint();
  }

  private paint() {
    this.list.querySelectorAll('li[data-i]').forEach((li, i) => {
      li.setAttribute('aria-selected', String(i === this.index));
      if (i === this.index) li.scrollIntoView({ block: 'nearest' });
    });
    this.input.setAttribute('aria-activedescendant', this.items[this.index] ? `cmdk-${this.items[this.index].id}` : '');
  }
}

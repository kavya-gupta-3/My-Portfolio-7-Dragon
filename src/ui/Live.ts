import { PROGRAMME, ageOn, educationOn } from '../data/profile';
import { $$ } from './dom';

/**
 * Facts that keep themselves true: age (from the birth date, in IST), the
 * BCA year (switches every 1 June, shows "graduate" from 2029) and the
 * copyright year. Re-checked hourly so an open tab rolls over at midnight.
 */
export function bindProfile() {
  const apply = () => {
    const now = new Date();
    const edu = educationOn(now);
    const values: Record<string, string> = {
      age: String(ageOn(now)),
      edu: edu.status === 'studying' ? `${PROGRAMME.degree} · ${edu.ordinal} year` : `${PROGRAMME.degree} · Graduate`,
      'edu-label': edu.label,
      year: String(now.getFullYear()),
    };
    for (const el of $$('[data-bind]')) {
      const v = values[el.dataset.bind ?? ''];
      if (v !== undefined && el.textContent !== v) el.textContent = v;
    }
  };
  apply();
  window.setInterval(apply, 60 * 60 * 1000);
}

/** Counts the visit at the edge (visitor total, used for rate limits and stats). */
export async function loadPulse() {
  try {
    await fetch('/api/pulse', { method: 'POST' });
  } catch {
    /* static hosting: nothing to count */
  }
}

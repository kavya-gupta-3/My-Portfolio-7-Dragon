import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { GITHUB_USER } from '../data/content';
import { PROGRAMME, ageOn, educationOn } from '../data/profile';
import { $, $$ } from './dom';

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

interface GithubStats {
  repos: number;
  followers: number;
  stars: number;
  languages: { name: string; share: number }[];
  updated?: string;
}

const LANG_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#663399',
  'C#': '#178600',
  PHP: '#4F5D95',
  Python: '#3572A5',
  C: '#555555',
  GLSL: '#5686a5',
  Shell: '#89e051',
};

async function fetchStats(): Promise<GithubStats | null> {
  try {
    const res = await fetch('/api/github', { headers: { accept: 'application/json' } });
    if (res.ok) return (await res.json()) as GithubStats;
  } catch {
    /* fall through */
  }
  try {
    const [u, r] = await Promise.all([
      fetch(`https://api.github.com/users/${GITHUB_USER}`).then((x) => (x.ok ? x.json() : null)),
      fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`).then((x) => (x.ok ? x.json() : null)),
    ]);
    if (!u || !Array.isArray(r)) return null;
    const counts: Record<string, number> = {};
    let stars = 0;
    for (const repo of r as { language: string | null; stargazers_count: number; fork: boolean }[]) {
      if (repo.fork) continue;
      stars += repo.stargazers_count;
      if (repo.language) counts[repo.language] = (counts[repo.language] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return {
      repos: u.public_repos,
      followers: u.followers,
      stars,
      languages: Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, n]) => ({ name, share: n / total })),
    };
  } catch {
    return null;
  }
}

/** Live GitHub numbers in the skills section (hidden if unavailable). */
export async function loadGithub() {
  const panel = $('#gh-live');
  const stats = $('#gh-stats');
  const langs = $('#gh-langs');
  if (!panel || !stats || !langs) return;
  const data = await fetchStats();
  if (!data) return;
  stats.innerHTML = [
    ['Public repos', data.repos],
    ['Followers', data.followers],
    ['Stars earned', data.stars],
    ['Top language', data.languages[0]?.name ?? '—'],
  ]
    .map(([k, v]) => `<div><b>${esc(v)}</b><span>${esc(k)}</span></div>`)
    .join('');
  langs.innerHTML = data.languages
    .map((l) => `<i style="width:${(l.share * 100).toFixed(1)}%;background:${LANG_COLORS[l.name] ?? '#888'}" title="${esc(l.name)}"></i>`)
    .join('');
  const legend = document.createElement('p');
  legend.className = 'gh-legend';
  legend.innerHTML = data.languages.map((l) => `<span style="color:${LANG_COLORS[l.name] ?? '#aaa'}">●</span> ${esc(l.name)} ${(l.share * 100).toFixed(0)}%`).join(' ');
  langs.after(legend);
  panel.hidden = false;
  ScrollTrigger.refresh();
}

/** Counts the visit at the edge (visitor total, used for rate limits and stats). */
export async function loadPulse() {
  try {
    await fetch('/api/pulse', { method: 'POST' });
  } catch {
    /* static hosting: nothing to count */
  }
}

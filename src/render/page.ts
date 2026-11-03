/**
 * Build-time renderer. Turns src/data into the static HTML of the page —
 * loader, HUD, all seven sections and the overlays — which Vite injects into
 * index.html. JavaScript then upgrades this markup; it never has to create it.
 */
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_INTRO,
  CONTACT,
  DREAMS,
  DREAMS_INTRO,
  FILM,
  HERO,
  HOBBIES,
  HOBBIES_INTRO,
  MANIFESTO,
  PERSONAL_PROJECTS,
  PROFESSIONAL_PROJECTS,
  PROJECTS_INTRO,
  SKILLS,
  STAGES,
  VAULT,
  type Project,
  type Stage,
} from '../data/content.ts';
import { IDENTITY, PROGRAMME, ageOn, educationOn } from '../data/profile.ts';
import { foodArt, mindArt } from './art.ts';
import { sigil } from './logo.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

function stageAttrs(s: Stage) {
  return `id="${s.id}" class="stage stage--${s.id}" data-stage="${s.index}" style="--c1:${s.color};--c2:${s.color2}" aria-labelledby="${s.id}-title"`;
}

function secHead(s: Stage, title: string, sub: string, extra = '') {
  return `<header class="sec-head" data-reveal>
    <p class="sec-meta"><span class="sec-num">${pad(s.index + 1)}</span>${esc(s.dragon)}<i>${esc(s.epithet)}</i></p>
    <h2 id="${s.id}-title" class="sec-title" data-split style="--len:${title.length}">${esc(title)}</h2>
    <p class="sec-sub">${esc(sub)}</p>${extra}
  </header>`;
}

/**
 * The film at the head of each section: a tall block whose pinned child holds
 * the title card and the subtitles, while the 3D scene plays behind them. It
 * is plain text, so the story still reads with no JavaScript or no WebGL.
 */
function film(s: Stage) {
  const c = FILM[s.index];
  const lines = c.lines
    .map((l) => {
      const words = l.text.split(' ');
      const spoken = words.map((w, i) => `<span style="--w:${i}">${esc(w)}</span>`).join(' ');
      return `<li class="line" data-at="${l.at}" data-to="${l.to}" data-words="${words.length}"><p>${spoken}</p></li>`;
    })
    .join('');
  return `<div class="film" role="group" data-film="${s.index}" data-card="${c.card.join(',')}" aria-label="${esc(s.dragon)}: ${esc(c.title)}">
    <div class="film-pin">
      <div class="film-card">
        <p class="fc-kicker">Chapter ${s.index + 1} of 7</p>
        <p class="fc-name">${esc(s.dragon)}</p>
        <p class="fc-title">${esc(c.title)}</p>
      </div>
      <div class="film-sub">
        <p class="fs-who">${esc(s.dragon)}</p>
        <ol class="fs-lines">${lines}</ol>
      </div>
      <a class="film-skip" href="#${s.id}" data-skip="${s.index}">Skip to page<i aria-hidden="true">↓</i></a>
    </div>
  </div>`;
}

function chips(items: string[], cls = 'chips') {
  return `<ul class="${cls}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

/* ------------------------------------------------------------------ loader */

function loader() {
  return `<div id="loader" class="loader" role="status" aria-live="polite" aria-label="Loading">
  <div class="ld-core">
    <div class="ld-ring" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle class="ld-track" cx="60" cy="60" r="56"/><circle class="ld-arc" cx="60" cy="60" r="56" pathLength="1"/></svg>
      ${sigil({ className: 'ld-mark' })}
    </div>
    <p class="ld-name">${esc(IDENTITY.first)} ${esc(IDENTITY.last)}</p>
    <p class="ld-status" id="ld-status">Waking the dragons</p>
    <div class="ld-actions" hidden>
      <button type="button" class="btn btn--primary" data-enter="sound"><span>Enter with sound</span></button>
      <button type="button" class="btn btn--ghost" data-enter="silent"><span>Enter silently</span></button>
    </div>
  </div>
</div>`;
}

/* --------------------------------------------------------------------- HUD */

function hud() {
  const nav = STAGES.map(
    (s) => `<li><a href="#${s.id}" data-goto="${s.index}" style="--c1:${s.color}">${esc(s.label)}</a></li>`,
  ).join('');
  const rail = STAGES.map(
    (s) =>
      `<li><a href="#${s.id}" data-goto="${s.index}" style="--c1:${s.color}" aria-label="${esc(s.label)}"><span>${esc(s.dragon)}</span><i></i></a></li>`,
  ).join('');
  return `<header class="hud-top" id="hud-top">
  <a class="brand" href="#origin" data-top aria-label="${esc(IDENTITY.name)} — back to top">
    ${sigil({ className: 'brand-mark' })}
    <span class="brand-word">${esc(IDENTITY.first)} ${esc(IDENTITY.last)}</span>
  </a>
  <nav class="hud-nav" aria-label="Sections"><ol>${nav}</ol></nav>
  <div class="hud-actions">
    <button type="button" class="hud-btn hud-sound" data-action="sound" aria-pressed="false" aria-label="Toggle sound">
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </button>
    <button type="button" class="hud-btn hud-cmd" data-action="cmdk" aria-label="Open command palette"><kbd>⌘K</kbd></button>
    <button type="button" class="hud-btn hud-menu" data-action="menu" aria-expanded="false" aria-controls="menu" aria-label="Open menu">
      <span class="burger" aria-hidden="true"><i></i><i></i></span>
    </button>
  </div>
</header>
<nav class="hud-rail" aria-label="Section progress"><ol>${rail}</ol></nav>
<div class="bars" aria-hidden="true"><i></i><i></i></div>
<aside class="hud-chip" id="specimen" aria-live="polite">
  <span class="chip-dot" aria-hidden="true"></span>
  <span class="chip-name" id="sp-name">${esc(STAGES[0].dragon)}</span>
  <span class="chip-epithet" id="sp-epithet">${esc(STAGES[0].epithet)}</span>
  <span class="chip-hint">Hover or click the dragon</span>
</aside>`;
}

/* ---------------------------------------------------------------- sections */

function origin(now: Date) {
  const s = STAGES[0];
  const edu = educationOn(now);
  const age = ageOn(now);
  const eduValue = edu.status === 'studying' ? `${PROGRAMME.degree} · ${edu.ordinal} year` : `${PROGRAMME.degree} · Graduate`;
  return `<section ${stageAttrs(s)}>
  <div class="origin-hero">
    <div class="hero-copy">
    <h1 id="origin-title" class="hero-title" aria-label="${esc(IDENTITY.name)}"><span class="ht-word">${esc(IDENTITY.first)}</span><span class="ht-word">${esc(IDENTITY.last)}</span></h1>
    <div class="hero-name" aria-hidden="true"><canvas id="hero-name-canvas"></canvas><div class="hn-fx"><i class="hn-sheen"></i><i class="hn-hot"></i><i class="hn-spot"></i></div></div>
    <div class="hero-meta">
      <p class="hero-role"><span data-bind="what">${esc(IDENTITY.role)}</span><i aria-hidden="true"></i><span data-bind="edu-label">${esc(edu.label)}</span></p>
      <ul class="hero-stats">
        <li><span>Age</span><b data-bind="age">${age}</b></li>
        <li><span>Study</span><b data-bind="edu">${esc(eduValue)}</b></li>
        <li><span>College</span><b>${esc(PROGRAMME.college)}</b></li>
        <li><span>Timetable</span><b>None. Ever.</b></li>
      </ul>
    </div>
    <a class="scroll-cue" href="#manifesto" data-next aria-label="Scroll down"><span>${esc(HERO.kicker)}</span><i aria-hidden="true"></i></a>
    </div>
  </div>
  ${film(s)}
  <div class="stage-body">
  <div class="manifesto" id="manifesto">
    <div class="mf-panel panel" data-reveal>
      <p class="panel-tag"><span>${esc(MANIFESTO.tag)}</span></p>
      <h3 class="mf-title">${MANIFESTO.title.map((t) => `<span data-split>${esc(t)}</span>`).join('')}</h3>
      <p class="mf-lead">${esc(MANIFESTO.lead)}</p>
      <ol class="mf-rules">${MANIFESTO.rules
        .map(
          (r, i) =>
            `<li class="mf-rule" data-reveal><span>${i + 1}</span><div><h4>${esc(r.title)}</h4><p>${esc(r.body)}</p></div></li>`,
        )
        .join('')}</ol>
    </div>
    <div class="mf-verdict" data-reveal>
      <p class="mf-verdict-main">${esc(MANIFESTO.verdict)}</p>
      <p class="mf-verdict-sub">${esc(MANIFESTO.verdictSub)}</p>
    </div>
  </div>
  </div>
</section>`;
}

const HOBBY_VISUALS: Record<string, string> = {
  gaming: `<div class="hv hv-gaming" aria-hidden="true">
    <div class="hvg-screen"><span class="hvg-cross"></span><span class="hvg-hp"><i></i></span><span class="hvg-ammo">30/120</span><span class="hvg-kill">#1 Winner</span></div>
    <svg class="hvg-pad" viewBox="0 0 200 120"><path d="M46 24h108c26 0 40 30 44 62 3 24-16 34-30 22l-22-20H54L32 108c-14 12-33 2-30-22 4-32 18-62 44-62z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M52 46v28M38 60h28" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><circle cx="146" cy="48" r="7" fill="currentColor"/><circle cx="164" cy="64" r="7" fill="currentColor" opacity=".6"/><circle cx="128" cy="64" r="7" fill="currentColor" opacity=".6"/><circle cx="146" cy="80" r="7" fill="currentColor" opacity=".35"/></svg>
    <button type="button" class="btn btn--primary hv-play" data-action="game"><span>Play Ember Hunt</span></button>
  </div>`,
  food: foodArt(),
  music: `<div class="hv hv-music" aria-hidden="true">
    <div class="hvm-disc"><i></i></div>
    <div class="hvm-eq" id="hobby-eq">${Array.from({ length: 24 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    <p class="hvm-now"><span>Now playing</span> the songs I love</p>
  </div>`,
  imagination: mindArt(),
  talking: `<div class="hv hv-talking" aria-hidden="true">
    <p class="bubble bubble--them">hey! what are you working on?</p>
    <p class="bubble bubble--me">…oh! just a dragon website :)</p>
    <p class="bubble bubble--them">that’s sick. tell me more</p>
    <p class="bubble bubble--me bubble--typing"><i></i><i></i><i></i></p>
  </div>`,
};

function hobbies() {
  const s = STAGES[1];
  const levels = HOBBIES.map((h) => `<li data-level="${h.rank - 1}"><i></i><span>${esc(h.title.split(' ')[0])}</span></li>`).join('');
  const cards = HOBBIES.map(
    (h) => `<article class="hobby" id="hobby-${h.id}" data-hobby="${h.rank - 1}">
      <div class="hobby-copy" data-tilt="soft">
        <p class="hobby-rank"><span>Level ${h.rank}</span><i>Rank ${h.rank} of 5</i></p>
        <h3 class="hobby-title">${esc(h.title)}</h3>
        <p class="hobby-hook">${esc(h.hook)}</p>
        ${h.body.map((b) => `<p class="hobby-body">${esc(b)}</p>`).join('')}
        ${chips(h.chips)}
        <div class="hobby-stat"><b>${esc(h.stat.value)}</b><span>${esc(h.stat.label)}</span></div>
        ${h.id === 'talking' ? `<a class="btn btn--primary" href="#contact" data-goto="6"><span>Start a conversation</span></a>` : ''}
      </div>
      ${HOBBY_VISUALS[h.id] ?? ''}
    </article>`,
  ).join('');
  return `<section ${stageAttrs(s)}>
  ${film(s)}
  <div class="stage-body">
  ${secHead(s, HOBBIES_INTRO.title, HOBBIES_INTRO.sub, `<p class="sec-note">${esc(HOBBIES_INTRO.note)}</p>`)}
  <div class="hobby-pin">
    <div class="hobby-hud" aria-hidden="true"><ol class="hobby-levels">${levels}</ol><p class="hobby-xp"><b><i id="hobby-xp"></i></b></p></div>
    <div class="hobby-track">${cards}</div>
  </div>
  </div>
</section>`;
}

function skills() {
  const s = STAGES[2];
  const branches = SKILLS.branches
    .map(
      (b, i) => `<article class="branch panel" data-branch="${i}" data-tilt="soft" data-reveal>
      <p class="panel-tag"><span>Branch ${i + 1}</span><i>${b.items.length} skills</i></p>
      <h3>${esc(b.title)}</h3>
      <ul class="nodes">${b.items.map((it, k) => `<li style="--k:${k}"><i aria-hidden="true"></i>${esc(it)}</li>`).join('')}</ul>
    </article>`,
    )
    .join('');
  const arsenal = SKILLS.arsenal
    .map(
      (g) => `<div class="ars-group" data-reveal><p>${esc(g.group)}</p>${chips(g.items, 'ars-items')}</div>`,
    )
    .join('');
  const all = SKILLS.arsenal.flatMap((g) => g.items);
  const marquee = (offset: number) =>
    `<div class="marquee-row"><div class="marquee-track">${[...all.slice(offset), ...all.slice(0, offset), ...all.slice(offset), ...all.slice(0, offset)]
      .map((t) => `<span>${esc(t)}</span>`)
      .join('<i aria-hidden="true">✦</i>')}</div></div>`;
  return `<section ${stageAttrs(s)}>
  ${film(s)}
  <div class="stage-body">
  ${secHead(s, SKILLS.title, SKILLS.sub)}
  <div class="skill-tree" id="skill-tree">
    <svg class="skill-wires" aria-hidden="true"></svg>
    <div class="skill-root panel" data-tilt="soft" data-reveal>
      <p class="panel-tag"><span>${esc(SKILLS.core.label)}</span></p>
      <h3>${esc(SKILLS.core.title)}</h3>
      <p>${esc(SKILLS.core.body)}</p>
    </div>
    <div class="branches">${branches}</div>
  </div>
  <div class="arsenal">
    <h3 class="arsenal-title" data-reveal>Tech arsenal <i>${all.length} tools across my projects</i></h3>
    <div class="ars-grid">${arsenal}</div>
  </div>
  <div class="marquee" aria-hidden="true">${marquee(0)}${marquee(9)}</div>
  <div class="gh-live panel" id="gh-live" data-reveal hidden>
    <p class="panel-tag"><span>Live from github.com/kavya-gupta-3</span><i class="gh-dot">Online</i></p>
    <div class="gh-stats" id="gh-stats"></div>
    <div class="gh-langs" id="gh-langs"></div>
  </div>
  </div>
</section>`;
}

function projectCard(p: Project, i: number, featured: boolean) {
  const link = p.url
    ? `<a class="proj-link" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" data-cursor="OPEN">${esc(new URL(p.url).hostname.replace(/^www\./, ''))}<i aria-hidden="true">↗</i></a>`
    : '';
  if (!featured) {
    return `<li class="pro-row" style="--h:${p.hue}" data-reveal>
      <span class="pro-idx">${pad(i + 1)}</span>
      <span class="pro-name">${esc(p.name)}</span>
      <span class="pro-kind">${esc(p.kind)}</span>
      <span class="pro-sum">${esc(p.summary)}</span>
      ${link}
    </li>`;
  }
  return `<article class="proj panel" style="--h:${p.hue}" data-tilt data-reveal>
    <div class="proj-art" aria-hidden="true" data-glyph="${esc(p.glyph)}"><canvas class="proj-canvas" data-seed="${i + 1}" data-hue="${p.hue}"></canvas><span class="proj-glyph">${esc(p.glyph)}</span></div>
    <div class="proj-body">
      <p class="panel-tag"><span>${esc(p.kind)}</span></p>
      <h3>${esc(p.name)}</h3>
      <p class="proj-sum">${esc(p.summary)}</p>
      ${chips(p.tags, 'tags')}
      ${link}
    </div>
  </article>`;
}

function projects() {
  const s = STAGES[3];
  return `<section ${stageAttrs(s)}>
  ${film(s)}
  <div class="stage-body">
  ${secHead(s, PROJECTS_INTRO.title, PROJECTS_INTRO.sub)}
  <div class="proj-block">
    <h3 class="block-title" data-reveal>Personal projects <i>Built for me</i></h3>
    <div class="proj-grid">${PERSONAL_PROJECTS.map((p, i) => projectCard(p, i, true)).join('')}</div>
  </div>
  <div class="proj-block">
    <h3 class="block-title" data-reveal>Professional projects <i>Built for clients</i></h3>
    <ol class="pro-list">${PROFESSIONAL_PROJECTS.map((p, i) => projectCard(p, i, false)).join('')}</ol>
  </div>
  <div class="proj-block">
    <h3 class="block-title" data-reveal>The vault <i>More work, no public links</i></h3>
    <ul class="vault">${VAULT.map(
      (v, i) =>
        `<li class="vault-item" data-tilt="soft" data-reveal><span>${pad(i + 1)}</span><h4>${esc(v.name)}</h4><p>${esc(v.body)}</p></li>`,
    ).join('')}</ul>
  </div>
  </div>
</section>`;
}

function achievements() {
  const s = STAGES[4];
  return `<section ${stageAttrs(s)}>
  ${film(s)}
  <div class="stage-body">
  ${secHead(s, ACHIEVEMENTS_INTRO.title, ACHIEVEMENTS_INTRO.sub)}
  <div class="ach-grid">${ACHIEVEMENTS.map(
    (a, i) => `<article class="ach panel" data-tilt="soft" data-reveal>
      <p class="panel-tag"><span>Trophy ${i + 1}</span></p>
      <p class="ach-value" data-count="${a.value}" data-prefix="${esc(a.prefix ?? '')}" data-suffix="${esc(a.suffix ?? '')}">${esc(a.display)}</p>
      <h3>${esc(a.title)}</h3>
      <p class="ach-body">${esc(a.body)}</p>
    </article>`,
  ).join('')}</div>
  </div>
</section>`;
}

function dreams() {
  const s = STAGES[5];
  return `<section ${stageAttrs(s)}>
  ${film(s)}
  <div class="stage-body">
  ${secHead(s, DREAMS_INTRO.title, DREAMS_INTRO.sub)}
  <ol class="dreams">${DREAMS.map(
    (d, i) => `<li class="dream dream--${d.id}" style="--i:${i}" data-tilt="soft">
      <span class="dream-star" aria-hidden="true"></span>
      <p class="dream-label">${esc(d.label)}</p>
      <h3 data-split>${esc(d.title)}</h3>
      <p class="dream-body">${esc(d.body)}</p>
    </li>`,
  ).join('')}</ol>
  </div>
</section>`;
}

function contact(now: Date) {
  const s = STAGES[6];
  const [user, domain] = CONTACT.email.split('@');
  const socials = CONTACT.socials
    .map(
      (so) => `<li><a class="social social--${so.id}" href="${esc(so.url)}" target="_blank" rel="noopener noreferrer me" data-cursor="OPEN">
        <b>${esc(so.label)}</b><i>${esc(so.handle)}</i><em aria-hidden="true">↗</em></a></li>`,
    )
    .join('');
  return `<section ${stageAttrs(s)}>
  ${film(s)}
  <div class="stage-body">
  ${secHead(s, CONTACT.title, CONTACT.sub)}
  <div class="contact-grid">
    <div class="contact-main" data-reveal>
      <p class="contact-lead">${esc(CONTACT.lead)}</p>
      <a class="email-big" href="mailto:${esc(user)}&#64;${esc(domain)}" data-email data-cursor="COPY"><span>Primary channel</span><b>${esc(user)}<i>@</i>${esc(domain)}</b></a>
      <ul class="socials">${socials}</ul>
    </div>
    <form class="contact-form panel" id="contact-form" novalidate data-reveal>
      <p class="panel-tag"><span>Dragon post</span><i id="cf-status">Ready</i></p>
      <label class="field"><span>Your name</span><input name="name" autocomplete="name" required maxlength="80" placeholder="Who is summoning?"></label>
      <label class="field"><span>Your email</span><input name="email" type="email" autocomplete="email" required maxlength="120" placeholder="Where should I reply?"></label>
      <label class="field"><span>Message</span><textarea name="message" rows="5" required maxlength="4000" placeholder="Say hi — I mean it."></textarea></label>
      <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
      <button type="submit" class="btn btn--primary btn--wide"><span>Release the dragon</span></button>
      <p class="cf-note" id="cf-note" role="status" aria-live="polite"></p>
    </form>
  </div>
  <footer class="site-foot">
    <div class="foot-brand">${sigil({ className: 'foot-mark' })}<p><b>${esc(IDENTITY.name)}</b><span>${esc(IDENTITY.role)} · ${esc(IDENTITY.location)}</span></p></div>
    <p class="foot-built">Forged with TypeScript · Three.js · GLSL · GSAP · Lenis · Web Audio · Vercel Edge</p>
    <p class="foot-copy">© <span data-bind="year">${now.getFullYear()}</span> ${esc(IDENTITY.name)} — seven dragons, zero timetables.</p>
    <a class="foot-top" href="#origin" data-top>Back to the fire ↑</a>
  </footer>
  </div>
</section>`;
}

/* ---------------------------------------------------------------- overlays */

function overlays() {
  const items = STAGES.map(
    (s) => `<li style="--c1:${s.color};--c2:${s.color2}"><a href="#${s.id}" data-goto="${s.index}">
      <span>${pad(s.index + 1)}</span><b>${esc(s.label)}</b><i>${esc(s.dragon)} · ${esc(s.epithet)}</i></a></li>`,
  ).join('');
  return `<div class="menu" id="menu" hidden data-lenis-prevent>
  <button type="button" class="menu-close" data-action="menu-close" aria-label="Close menu"><span>Close</span><i aria-hidden="true"></i></button>
  <div class="menu-inner">
    <p class="menu-k">Seven chapters</p>
    <ol class="menu-list">${items}</ol>
    <ul class="menu-socials">${CONTACT.socials
      .map((so) => `<li><a href="${esc(so.url)}" target="_blank" rel="noopener noreferrer">${esc(so.label)} ↗</a></li>`)
      .join('')}</ul>
  </div>
</div>
<div class="cmdk" id="cmdk" hidden role="dialog" aria-modal="true" aria-label="Command palette">
  <div class="cmdk-box">
    <div class="cmdk-input"><input id="cmdk-input" type="text" placeholder="Type a command or search…" autocomplete="off" spellcheck="false" aria-controls="cmdk-list"></div>
    <ul id="cmdk-list" class="cmdk-list" role="listbox" data-lenis-prevent></ul>
    <p class="cmdk-foot"><span>↑↓ navigate</span><span>↵ run</span><span>esc close</span></p>
  </div>
</div>
<div class="game" id="game" hidden role="dialog" aria-modal="true" aria-label="Ember Hunt mini-game">
  <canvas id="game-canvas"></canvas>
  <div class="game-ui">
    <p class="game-score">Score <b id="game-score">0</b></p>
    <p class="game-best">Best <b id="game-best">0</b></p>
    <button type="button" class="game-close" data-action="game-close" aria-label="Close game">✕</button>
  </div>
  <div class="game-card" id="game-card">
    <p class="game-k">Mini-game</p>
    <h3>Feed the wyrm.</h3>
    <p>Steer with your mouse or finger. Eat embers, grow longer, dodge the void mines. Your own tail is fine — it’s a dragon.</p>
    <button type="button" class="btn btn--primary" data-action="game-start"><span>Start</span></button>
  </div>
</div>
<div class="entry" id="entry" aria-hidden="true">
  <p class="en-say"></p>
  <div class="en-card"><p class="en-kicker"></p><p class="en-name"></p><p class="en-sub"></p></div>
  <p class="en-skip">Click to skip</p>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="cursor-light" aria-hidden="true"></div>
<div class="scroll-shield" aria-hidden="true"></div>
<div class="dragon-tip" id="dragon-tip" aria-hidden="true"><div class="tip-box"><b id="tip-name"></b><span id="tip-sub"></span><i id="tip-hint"></i></div></div>`;
}

export function renderBody(now: Date = new Date()): string {
  return [
    loader(),
    hud(),
    `<main id="main">`,
    origin(now),
    hobbies(),
    skills(),
    projects(),
    achievements(),
    dreams(),
    contact(now),
    `</main>`,
    overlays(),
  ].join('\n');
}

/** JSON-LD for search engines. */
export function personSchema(siteUrl: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: IDENTITY.name,
    url: siteUrl,
    jobTitle: IDENTITY.role,
    affiliation: { '@type': 'CollegeOrUniversity', name: `${PROGRAMME.college} (${PROGRAMME.university})` },
    sameAs: CONTACT.socials.map((s) => s.url),
    knowsAbout: SKILLS.branches.flatMap((b) => b.items).slice(0, 20),
  });
}

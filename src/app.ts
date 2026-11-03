import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Vector2 } from 'three';
import { Synth } from './audio/Synth';
import { damp } from './core/math';
import { detectQuality, supportsWebGL2, type Tier } from './core/quality';
import { Scroll } from './core/scroll';
import { CONTACT, FILM, STAGES } from './data/content';
import { Engine, INTRO } from './gl/Engine';
import { HobbyArt } from './gl/HobbyArt';
import { NameForge } from './gl/NameForge';
import { Ambient } from './gl/fx/Ambient';
import { Ground } from './gl/fx/Ground';
import { Props } from './gl/fx/Props';
import { Braziers } from './gl/fx/Braziers';
import { Sigil } from './gl/fx/Sigil';
import type { Dragon } from './gl/dragon/Dragon';
import { Astra } from './gl/dragon/species/Astra';
import { Aurum } from './gl/dragon/species/Aurum';
import { Crimson } from './gl/dragon/species/Crimson';
import { Ignis } from './gl/dragon/species/Ignis';
import { Jade } from './gl/dragon/species/Jade';
import { Pixel, HOBBY_PALETTES } from './gl/dragon/species/Pixel';
import { Volt } from './gl/dragon/species/Volt';
import { ClickFx } from './ui/ClickFx';
import { CommandPalette, type Command } from './ui/CommandPalette';
import { initContact } from './ui/Contact';
import { $, $$, isTyping, store, toast } from './ui/dom';
import { initEaster } from './ui/Easter';
import { EmberHunt } from './ui/EmberHunt';
import { EntryTitle } from './ui/EntryTitle';
import { initHover } from './ui/Hover';
import { HeroName } from './ui/HeroName';
import { Hud } from './ui/Hud';
import { bindProfile, loadGithub, loadPulse } from './ui/Live';
import { Loader } from './ui/Loader';
import { Menu } from './ui/Menu';
import { initProjectArt } from './ui/ProjectArt';
import { initReveal } from './ui/Reveal';
import { LiveWindow } from './ui/Sections';
import { Tour } from './ui/Tour';
import { Story } from './ui/Story';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

const params = new URLSearchParams(location.search);
/** `?skip` bypasses the intro screen and the opening sequence. */
const SKIP_INTRO = params.has('skip');

const INTERACTIVE = 'a, button, input, textarea, select, label, .panel, .proj, .pro-row, .vault-item, .social, .email-big, .hv, .hero-stats, .menu, .cmdk, .game, .film-sub, .hud-rail';

export async function boot() {
  const html = document.documentElement;
  const quality = detectQuality();
  html.dataset.tier = quality.tier;
  html.classList.toggle('touch', quality.touch);
  html.classList.toggle('reduced', quality.reducedMotion);
  // every visit and every reload starts at the top, with the opening. The
  // browser and ScrollTrigger would both put a reload back where it was; only
  // a link straight to a chapter (a new visit to #contact, say) goes there
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  ScrollTrigger.clearScrollMemory('manual');
  const visit = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (visit?.type === 'reload' && location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (params.has('og')) html.classList.add('og-mode');

  bindProfile();
  const loader = new Loader();
  loader.progress(0.05);

  const scroll = new Scroll(!quality.reducedMotion);
  scroll.attach($$('main > .stage'), $('.origin-hero'), FILM.map((f) => f.outro));
  scroll.stop();
  window.scrollTo(0, 0);
  scroll.to(0, true);

  const synth = new Synth();
  const hud = new Hud();
  hud.setStage(0);

  /** The name is forged at the exact size it is shown. */
  const forgeName = () => {
    const stack = window.innerWidth / window.innerHeight < 0.95;
    forge?.forge(heroName.element?.parentElement?.clientWidth || window.innerWidth * 0.68, stack);
  };

  /* ---------------------------------------------------------- 3D world */
  const canvas = $<HTMLCanvasElement>('#gl')!;
  let engine: Engine | null = null;
  const heroName = new HeroName();
  let forge: NameForge | null = null;
  let props: Props | null = null;
  let ground: Ground | null = null;
  let art: HobbyArt | null = null;
  const dragons: Dragon[] = [];
  const pixel = new Pixel(quality.detail);
  const volt = new Volt();
  const crimson = new Crimson();
  if (supportsWebGL2() && !params.has('nogl')) {
    try {
      engine = new Engine(canvas, quality);
      dragons.push(new Ignis(), pixel, volt, new Jade(), new Aurum(), new Astra(), crimson);
      for (const d of dragons) engine.addDragon(d);
      for (const [i, d] of dragons.entries()) {
        loader.line(`Summoning ${STAGES[i].dragon[0]}${STAGES[i].dragon.slice(1).toLowerCase()}`);
        d.build(await engine.factory.build(d.species, quality.detail));
        loader.progress(0.08 + ((i + 1) / dragons.length) * 0.62);
      }
      engine.factory.dispose();
      await Promise.race([document.fonts.load('900 100px Cinzel'), new Promise((r) => setTimeout(r, 2500))]);
      const ambient = new Ambient(quality.particles);
      props = new Props(quality.detail);
      ground = new Ground();
      const sigil = new Sigil(INTRO.igniteAt, INTRO.length);
      // fire bowls either side of the opening shot: one line to take them out again
      const braziers = new Braziers(INTRO.length);
      engine.scene.add(ground.mesh, ambient.points, props.crystals, props.coins, sigil.mesh, braziers.group);
      engine.systems.push(ambient, props, ground, sigil, braziers);
      ground.bake(engine.renderer, 0);
      if (heroName.element) {
        forge = new NameForge(engine.renderer, heroName.element);
        html.classList.add('gl-title');
        forgeName();
      }
      loader.progress(0.78);
      loader.line('Lighting the fires');
      await engine.compile();
      const hosts = $$('[data-art]');
      art = new HobbyArt(hosts, quality.reducedMotion);
      art.prepare(hosts);
      // phones: the URL bar sliding in/out changes the height a little —
      // the canvas is sized to 100lvh, so only real resizes rebuild targets
      let lastW = window.innerWidth;
      let lastH = window.innerHeight;
      window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (quality.touch && w === lastW && Math.abs(h - lastH) < 160) return;
        lastW = w;
        lastH = h;
        engine?.resize();
        forgeName();
        heroName.resized();
      });
    } catch (error) {
      console.warn('[kg] WebGL disabled:', error);
      engine = null;
      html.classList.remove('gl-title');
      html.classList.add('no-webgl');
    }
  } else {
    html.classList.add('no-webgl');
  }
  await document.fonts.ready;
  loader.progress(0.95);

  /* --------------------------------------------------------------- UI */
  let chapter = 0;
  let paused = false;
  let hudStage = 0;
  initReveal({ onChapter: (c) => (chapter = c) }, quality.reducedMotion);
  initProjectArt();
  const story = new Story();
  const hover = initHover(quality.reducedMotion, (x, y) => heroName.pointer(x, y));
  const live = new LiveWindow($$('main > .stage'));

  const entryTitle = new EntryTitle();
  /**
   * Summon a dragon: its entrance plays, then the scene hands over to its film
   * at the first line, or to its page. The wipe hides the jump.
   */
  const summon = (i: number, toPage: boolean) => {
    if (!engine || quality.reducedMotion) return false;
    const line = FILM[i].lines[0].at + 0.01;
    if (!engine.summon(i, toPage ? 1 : line)) return false;
    html.classList.add('entering');
    entryTitle.arm(i);
    scroll.stop();
    scroll.to(toPage ? scroll.bodyOffset(i) : scroll.filmOffset(i, line), true);
    return true;
  };

  /** Any way of asking for a chapter: its dragon makes an entrance. */
  const goTo = (i: number, toPage = true) => {
    if (!$$('main > .stage')[i]) return;
    synth.ui('press');
    const here = i === scroll.scene && scroll.hero >= 0.98;
    if (!here && summon(i, toPage && i !== 0)) return;
    if (i === 0) scroll.to(0, scroll.scene !== 0);
    else scroll.to(scroll.bodyOffset(i), i !== scroll.scene);
  };

  const soundBtn = $<HTMLButtonElement>('[data-action="sound"]');
  const setSound = async (on: boolean) => {
    if (on) await synth.enable();
    else synth.disable();
    soundBtn?.setAttribute('aria-pressed', String(synth.enabled));
    store.set('kg-sound', synth.enabled ? '1' : '0');
  };
  soundBtn?.addEventListener('click', () => setSound(!synth.enabled));
  document.addEventListener('visibilitychange', () => synth.hush(document.hidden));

  /** Prod the dragon of this chapter. It only roars when it was the dragon you clicked. */
  const provoke = (loud: boolean) => {
    const d = engine?.provoke(loud) ?? null;
    if (d?.species === 'aurum') props?.shower();
    if (d?.species === 'jade') props?.scatter();
    if (d && loud) synth.voice(d.stage, 'roar');
  };

  const rage = () => {
    if (!engine) return;
    for (const d of dragons) d.rage = 1;
    engine.rage(5);
    props?.shower();
    props?.scatter();
    synth.voice(0, 'roar');
    synth.voice(2, 'impact');
  };

  pixel.onStir = (height) => synth.arcade(height);
  volt.onStrike = (power) => {
    if (engine) engine.flash = Math.max(engine.flash, power);
  };

  /* --------------------------------------------------------- the film */
  if (engine) {
    engine.onVoice = (dragon, kind, amount) => synth.voice(dragon, kind, amount);
    engine.onScatter = (scene) => {
      if (scene === 4) props?.shower();
      else props?.scatter();
    };
    engine.onCut = (_from, to) => {
      synth.setStage(to);
      if (!engine?.entering) synth.cut(to);
    };
    engine.onIgnite = (i) => {
      synth.voice(i, 'roar');
      if (i === 4) heroName.reveal(1.7);
    };
    engine.onIntroEnd = () => {
      html.classList.remove('intro');
      heroName.show();
    };
    engine.onHover = (i) => {
      hover.showDragon(i, scroll.hero < 0.3);
      if (i >= 0) synth.touch(i);
    };
    engine.onEntryTitle = () => entryTitle.slam();
    engine.onSay = (_dragon, text) => {
      entryTitle.say(text);
      if (/^\d$/.test(text)) synth.count(Number(text));
      else if (text === 'GO') synth.count(0);
    };
    engine.onEntryEnd = () => {
      html.classList.remove('entering');
      entryTitle.leave();
      scroll.start();
    };
  }

  /** Anything covering the screen stops the 3D behind it. */
  const cover = (open: boolean) => {
    paused = open;
    if (open) scroll.stop();
    else scroll.start();
  };
  const menu = new Menu(cover);
  const game = new EmberHunt({
    open: () => {
      paused = true;
      scroll.stop();
    },
    close: () => {
      paused = false;
      scroll.start();
    },
    sound: (k) => (k === 'eat' ? synth.blip(1200) : k === 'gold' ? synth.chime() : k === 'die' ? synth.voice(0, 'impact', 0.6) : synth.whoosh()),
  });

  const tour = new Tour(scroll);
  const share = async () => {
    const url = `${location.origin}/`;
    if (navigator.share) {
      // a cancelled share is not an error worth a message
      await navigator.share({ title: document.title, text: 'Seven dragons, one developer.', url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    toast('Link copied');
  };
  const copyChapterLink = () => {
    const s = STAGES[scroll.scene];
    void navigator.clipboard?.writeText(`${location.origin}/#${s.id}`).then(() => toast(`Link to ${s.label} copied`));
  };
  const snapshot = () => {
    if (!engine) return toast('The 3D world is off on this device');
    engine.capture((png) => {
      if (!png) return toast('Couldn’t save that one, try again');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(png);
      a.download = `kavya-gupta-${STAGES[scroll.scene].dragon.toLowerCase()}.png`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Picture saved');
    });
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    const root = document.documentElement;
    if (!root.requestFullscreen) return toast('Full screen isn’t available in this browser');
    root.requestFullscreen().catch(() => toast('Full screen isn’t available here'));
  };
  let meter: HTMLElement | null = null;
  let meterTimer = 0;
  const toggleMeter = () => {
    if (meter) {
      meter.remove();
      meter = null;
      window.clearInterval(meterTimer);
      return;
    }
    const el = document.createElement('div');
    el.className = 'fps-meter';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    meter = el;
    const read = () => (el.textContent = engine ? `${Math.round(engine.fps)} fps · ${Math.round(engine.renderScale * 100)}% sharp` : 'no 3D');
    read();
    meterTimer = window.setInterval(read, 500);
  };
  const surprise = () => {
    const others = STAGES.map((s) => s.index).filter((i) => i !== scroll.scene);
    goTo(others[Math.floor(Math.random() * others.length)]);
  };

  const setQuality = (tier: Tier) => {
    const url = new URL(location.href);
    url.searchParams.set('q', tier);
    location.href = url.toString();
  };
  const commands: Command[] = [
    ...STAGES.map((s) => ({ id: `go-${s.id}`, label: `Go to ${s.label}`, hint: s.dragon, keywords: `${s.id} ${s.dragon} section`, run: () => goTo(s.index) })),
    { id: 'sound', label: 'Toggle sound', hint: 'M', keywords: 'music mute audio', run: () => setSound(!synth.enabled) },
    { id: 'email', label: 'Copy email address', hint: CONTACT.email, keywords: 'mail contact', run: () => navigator.clipboard?.writeText(CONTACT.email).then(() => toast('Email copied')) },
    ...CONTACT.socials.map((s) => ({ id: `open-${s.id}`, label: `Open ${s.label}`, hint: s.handle, keywords: 'social profile link', run: () => window.open(s.url, '_blank', 'noopener') })),
    { id: 'provoke', label: 'Provoke the dragon', hint: 'click it', keywords: 'roar fire attack', run: () => provoke(true) },
    { id: 'game', label: 'Play Ember Hunt', hint: 'mini-game', keywords: 'game play arcade', run: () => game.open() },
    { id: 'rage', label: 'Unleash Dragon Rage', hint: 'secret', keywords: 'konami easter egg', run: rage },
    { id: 'hud', label: 'Toggle HUD', hint: 'clean view', keywords: 'hide interface zen', run: () => html.classList.toggle('hud-hidden') },
    { id: 'q-high', label: 'Quality: high', hint: 'reload', keywords: 'graphics performance', run: () => setQuality('high') },
    { id: 'q-med', label: 'Quality: balanced', hint: 'reload', keywords: 'graphics performance medium', run: () => setQuality('medium') },
    { id: 'q-low', label: 'Quality: low', hint: 'reload', keywords: 'graphics performance battery', run: () => setQuality('low') },
    { id: 'replay', label: 'Replay the opening', hint: 'seven dragons', keywords: 'intro film cinematic', run: () => replay() },
    { id: 'top', label: 'Back to the fire', hint: 'top', keywords: 'home start', run: () => goTo(0) },
    { id: 'tour', label: 'Auto-tour from the start', hint: 'sit back', keywords: 'auto scroll play demo watch tour start beginning', run: () => tour.start(0) },
    { id: 'tour-here', label: 'Auto-scroll from here', hint: 'hands free', keywords: 'auto scroll play continue tour', run: () => tour.start(null) },
    { id: 'next', label: 'Next chapter', hint: 'next dragon', keywords: 'forward skip ahead', run: () => goTo(Math.min(STAGES.length - 1, scroll.scene + 1)) },
    { id: 'prev', label: 'Previous chapter', hint: 'go back', keywords: 'backward back', run: () => goTo(Math.max(0, scroll.scene - 1)) },
    { id: 'random', label: 'Surprise me', hint: 'a random dragon', keywords: 'random shuffle dragon lucky', run: surprise },
    { id: 'share', label: 'Share this site', hint: 'send the link', keywords: 'share send link url copy', run: () => void share() },
    { id: 'chapter-link', label: 'Copy link to this chapter', hint: 'deep link', keywords: 'url anchor copy section', run: copyChapterLink },
    { id: 'snap', label: 'Save a picture of this moment', hint: 'PNG', keywords: 'screenshot photo image download wallpaper capture', run: snapshot },
    { id: 'fullscreen', label: 'Full screen', hint: 'F', keywords: 'fullscreen immersive cinema', run: toggleFullscreen },
    { id: 'fps', label: 'Show frame rate', hint: 'for the curious', keywords: 'fps performance stats speed debug', run: toggleMeter },
  ];
  new CommandPalette(commands, cover);

  initContact({
    onSent: () => {
      crimson.swoop(gsap.ticker.time);
      synth.voice(6, 'roar');
    },
    onSound: (k) => synth.ui(k === 'send' ? 'copy' : 'error'),
  });
  initEaster(rage);

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // an entrance can be hurried along, but nothing else happens underneath it
    if (engine?.entering) {
      e.preventDefault();
      engine.hurryEntry();
      return;
    }
    if (target.closest('[data-top]')) {
      e.preventDefault();
      synth.ui('press');
      scroll.to(0, scroll.scene !== 0);
      return;
    }
    const skip = target.closest<HTMLElement>('[data-skip]');
    if (skip) {
      e.preventDefault();
      synth.ui('press');
      scroll.to(scroll.bodyOffset(Number(skip.dataset.skip)));
      return;
    }
    if (target.closest('[data-next]')) {
      e.preventDefault();
      scroll.to(scroll.filmOffset(0, 0));
      return;
    }
    const goto = target.closest<HTMLElement>('[data-goto]');
    if (goto) {
      e.preventDefault();
      menu.toggle(false);
      goTo(Number(goto.dataset.goto));
      return;
    }
    if (target.closest(INTERACTIVE) || window.getSelection()?.toString()) return;
    // in the opening shot the seven are a menu: click one to go to its chapter
    const picked = engine?.hovered ?? -1;
    if (picked >= 0 && scroll.hero < 0.3) goTo(picked, false);
    else provoke(picked >= 0);
  });
  // every click lands in its own chapter's language. A mouse answers on the
  // press; a finger on the tap, because a press might just be the start of a scroll
  const clickFx = quality.reducedMotion ? null : new ClickFx();
  const answer = (e: MouseEvent) => {
    if (paused || engine?.entering || engine?.introPlaying || isTyping(e.target)) return;
    if ((e.target as HTMLElement).closest?.('.menu, .cmdk, .game, .loader')) return;
    const stage = scroll.scene;
    clickFx?.fire(stage, e.clientX, e.clientY);
    // one sound per click: buttons and links have their own, and a dragon answers for itself
    const onDragon = (engine?.hovered ?? -1) >= 0;
    if (!onDragon && !(e.target as HTMLElement).closest?.(INTERACTIVE)) synth.click(stage);
    engine?.ripple();
  };
  let pressedBy = '';
  window.addEventListener('pointerdown', (e) => {
    pressedBy = e.pointerType;
    if (pressedBy === 'mouse' && e.button === 0) answer(e);
  }, { passive: true });
  window.addEventListener('click', (e) => {
    if (pressedBy !== 'mouse' && e.detail > 0) answer(e);
  }, { passive: true });
  const hurry = () => engine?.hurryEntry();
  window.addEventListener('wheel', hurry, { passive: true });
  window.addEventListener('touchstart', hurry, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (engine?.entering && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) hurry();
    if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.toLowerCase() === 'm') void setSound(!synth.enabled);
    if (e.key.toLowerCase() === 'f') toggleFullscreen();
  });
  document.addEventListener('pointerover', (e) => {
    if ((e.target as HTMLElement).closest('a, button')) synth.ui('tick');
  });
  window.addEventListener('resize', () => hud.slide());
  document.fonts.ready.then(() => hud.slide());

  /* ------------------------------------------------------------ enter */
  const playOpening = !quality.reducedMotion && !SKIP_INTRO && !!engine && !location.hash;
  const replay = () => {
    if (!engine) return;
    scroll.to(0, true);
    html.classList.add('intro');
    heroName.reset();
    engine.playIntro();
  };
  if (playOpening) html.classList.add('intro');
  const choice = SKIP_INTRO ? 'silent' : await loader.ready(store.get('kg-sound') === '1' ? 4000 : 9000);
  if (choice === 'sound') await setSound(true);
  if (SKIP_INTRO) loader.remove();
  else await loader.leave();
  scroll.start();
  ScrollTrigger.refresh();
  // by id, not as a selector: a hash like #1 or #a%20b must not stop the site from starting
  const linked = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  scroll.to(linked ?? 0, true);
  if (playOpening) {
    if (engine) engine.playIntro();
    const quicken = () => engine?.hurryIntro();
    window.addEventListener('wheel', quicken, { once: true, passive: true });
    window.addEventListener('touchmove', quicken, { once: true, passive: true });
  } else heroName.show();
  void loadGithub();
  void loadPulse();

  /* ------------------------------------------------------------- loop */
  const pointer = new Vector2();
  const pointerSmooth = new Vector2();
  // the pointer is nowhere until it first moves
  let overUI = true;
  const track = (e: PointerEvent) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    overUI = !!(e.target as HTMLElement).closest?.(INTERACTIVE);
  };
  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });
  const heroMeta = $('.hero-meta');
  const heroCue = $('.scroll-cue');
  let heroFade = -1;
  const shield = quality.touch ? null : $('.scroll-shield');
  let shielded = false;
  const eqBars = $$('#hobby-eq i');
  const levels = new Uint8Array(32);
  const musicVisual = $('.hv-music');

  gsap.ticker.lagSmoothing(0);
  gsap.ticker.add((time, deltaMs) => {
    const rawDt = Math.max(1e-4, deltaMs / 1000);
    const dt = Math.min(rawDt, 1 / 20);
    scroll.raf(time * 1000);
    scroll.update(dt);
    const active = scroll.scene;
    live.update(active);
    if (active !== hudStage) {
      hudStage = active;
      hud.setStage(active);
      if (!engine) synth.setStage(active);
    }
    html.classList.toggle('past-hero', scroll.hero >= 0.98);
    const moving = Math.abs(scroll.velocity) > 0.8;
    if (moving !== shielded && shield) {
      shielded = moving;
      shield.style.display = moving ? 'block' : '';
    }
    if (heroMeta && scroll.hero !== heroFade) {
      heroFade = scroll.hero;
      heroMeta.style.opacity = String(Math.max(0, 1 - heroFade * 3.2));
      if (heroCue) heroCue.style.opacity = heroMeta.style.opacity;
      heroName.scroll(heroFade);
    }
    const wasSpeaking = story.speaking;
    const entering = !!engine?.entering;
    // the film holds its first line until the entrance has handed over
    story.update(active, scroll.p, scroll.inFilm && !entering, time, dt);
    if (wasSpeaking < 0.5 && story.speaking >= 0.5) synth.speak(active, story.words, 0.27);
    pointerSmooth.x = damp(pointerSmooth.x, pointer.x, 4, dt);
    pointerSmooth.y = damp(pointerSmooth.y, pointer.y, 4, dt);
    if (engine && !paused) {
      // the voxel dragon's palette tints the arcade sky and floor
      const [a, b] = pixel.palette;
      engine.sky.material.uniforms.uHobbyA.value.copy(a);
      engine.sky.material.uniforms.uHobbyB.value.copy(b);
      ground?.colors.a.copy(a);
      ground?.colors.b.copy(b);
      engine.frame({ time, rawDt, scene: active, p: scroll.p, hero: scroll.hero, locals: scroll.local, chapter, velocity: scroll.velocity, pointer: pointerSmooth, aim: pointer, overUI, speaking: story.speaking, page: scroll.page });
      if (active === 1) art?.update(time, dt, pointerSmooth);
    }
    // music hobby: melody + live equaliser
    const onMusic = active === 1 ? Math.max(0, 1 - Math.abs(chapter - 2) * 1.6) : 0;
    synth.music = onMusic;
    synth.tick(scroll.velocity);
    if (onMusic > 0.3 && synth.levels(levels)) {
      musicVisual?.classList.add('music-live');
      for (let i = 0; i < eqBars.length; i++) eqBars[i].style.setProperty('--h', String((levels[(i % 24) + 2] ?? 0) / 255));
    } else musicVisual?.classList.remove('music-live');
  });

  if (import.meta.env.DEV || params.has('debug')) {
    const seek = (i: number, p: number) => scroll.to(scroll.filmOffset(i, p), true);
    (window as unknown as Record<string, unknown>).__kg = { engine, scroll, seek, story, art, synth, ready: true, palettes: HOBBY_PALETTES };
  }
}

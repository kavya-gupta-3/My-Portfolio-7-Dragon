# KAVYA GUPTA — seven dragons, one developer

A full-3D, dragon-themed personal website, told like a film. The page opens on
all seven dragons in one poster shot; as you scroll, each one takes the screen
in turn, in its own pinned scene, and tells you part of the story.

| # | Chapter | Dragon | Built from | Its big moment |
|---|---|---|---|---|
| 01 | The First Flame | **IGNIS** — The Obsidian Sovereign | overlapping obsidian scales, lava seams, antlers | rears and strikes at the lens with a jet of fire |
| 02 | Player One | **PIXEL** — The Prism Wyrm | thousands of instanced voxels, voxel wings | loads in out of a burst of cubes, loops the loop |
| 03 | The Self-Taught Storm | **VOLT** — The Circuit Serpent | armour rings around a naked energy core | unlocks its armour, ring by ring |
| 04 | The Forge | **JADE** — The Crystal Forgewyrm | faceted emerald, crystal clusters | rears up with every crystal blazing |
| 05 | The Hoard | **AURUM** — The Hoard King | polished gold scales, bat wings | wakes, rears, roars the coins out of the sky |
| 06 | The Unreached Sky | **ASTRA** — The Star-Born | stars, constellation lines, wings of light | assembles out of an empty sky, climbs it |
| 07 | The Message | **CRIMSON** — The Ember Herald | crimson wyvern with wings of living flame | crosses the blood moon, dives the lens; carries your message |

Between chapters the frame is destroyed by the outgoing dragon's element: fire,
flipping game tiles, a lightning split, crystal shatter, molten gold, a warp.

## Tech

- **TypeScript** (strict) + **Vite 8**
- **Three.js** with hand-written **GLSL** everywhere — no stock materials
  - GPU **spine deformation**: each dragon is modelled straight and bent along a
    live spine stored in a float texture (rotation-minimising frames, arclength
    re-spacing)
  - **A film system** (`src/gl/cinema`): every dragon plays authored *beats*
    (body poses, jaw, wings, eyeline) covered by authored *shots* (a camera
    spline), both scrubbed by scroll
  - **A real body**: poses blend bone by bone around the hips, so nothing
    shrinks mid-move. The joints then run on springs (head leads, tail drags)
    with bone lengths and a bend limit enforced, and the neck turns to carry a
    skull bolted onto its first frame. Frames carry over between frames, so the
    body rolls but never flips. Legs, spikes and mane ride rigidly on the body
  - Breathing, blinking, a wandering eyeline, wing beats that lift the chest, a
    jaw that follows the subtitles, and feet that only move when the body does
  - While the reader lingers each dragon finds things to do (looks around,
    stretches, flicks its tail, roars) and its world answers with its own light:
    forked lightning, lava fountains, aurora, a shooting star, a flaring moon
  - **Signed-distance sculpting + Naive Surface Nets** meshing for every skull
  - Geometry built in a **Web Worker** so the loader never stutters
  - Custom post pipeline: low-res sky → HDR scene → elemental wipe against a
    frozen frame → 13-tap dual-filter **bloom** from quarter resolution →
    anamorphic lens streak → composite with FXAA, ground mist, shockwave,
    grading, ACES, vignette and grain
  - Floors baked once per world into a mipmapped tile
  - The name is forged once at the screen's own resolution (distance field,
    chiselled bevels, studio-lit gold) and each letter is spaced from its traced
    outline, so it stays sharp, even, and costs no frames
  - Only three chapters are ever alive: the rest stay at their exact height in
    the page while the browser skips their style, layout and paint
  - The opening shot has one lighting rig of its own, lit like a film poster,
    and wing skin bellies out between the bones. Behind the seven a summoning
    circle draws itself on in the dark, every dragon's seat catching as it
    wakes, in front of far mountains and seven pillars of light, between two
    obsidian columns with fire bowls on top (one line in app.ts takes them out)
  - Fire breath is a stream of turbulent flame worked out on the GPU from the
    moment each puff leaves the jaws: white-hot, gold, red, then smoke
  - On a tall screen the camera keeps the dragon's head in frame, and never
    backs through a floor; on a wide one the shots play exactly as framed
  - Each page starts rising as its film says its last line, so the dragon's
    final move plays under it and there is nothing empty to scroll through
  - Budgeted for 60 fps: a packed-float picture (half the memory of half-floats,
    about twice as fast on shared-memory GPUs), a pixel cap, a governor that
    reads real GPU time so only a truly slow chip ever loses sharpness, a sky
    that reads its clouds from a small 3D texture, a discard-free program for
    each whole dragon, a 60 fps cap on 120 Hz displays, every shader warmed up
    at load, no `backdrop-filter` over the canvas and no class changes on
    `<html>` during interaction
- **Entrances** (Jade bursts out of a geode, Pixel is counted in and built cube
  by cube like an arcade boss, Aurum erupts from a tornado of its own coins):
  click a dragon on the home page, or a chapter in the header,
  menu or chapter bar, and it makes a timed, trailer-cut entrance of its own
  before handing over to its film or its page, with no seam. Any click, key or
  scroll hurries it along
- **Hobby art**: food on a turntable and a mind with moons are real 3D objects
  in a small second canvas, lit with baked matcaps and drawn only while on screen
- **GSAP** (ScrollTrigger, SplitText, ScrambleText, DrawSVG) + **Lenis** smooth scroll
- **Web Audio API** — one sound per click, roars never on top of roars; the
  whole soundtrack is synthesised live (drone per dragon,
  wind tied to scroll speed, and a voice for each dragon: its own roar, its own
  language under the subtitles, ambience, click and entrance, plus a melody on the music
  hobby driving a live equaliser). Zero audio files.
- **Canvas 2D** — generative project cover art and the *Ember Hunt* mini-game
- **Vercel Edge Functions** (`/api`) — contact form, live GitHub stats, visitor pulse
- **PWA** — hand-written service worker: installable, opens offline
- Build-time HTML rendering: every word of the page is static HTML (fast, SEO,
  works without JavaScript), then upgraded by the 3D layer

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — the /api functions run inside Vite too
npm run build      # → dist/
npm run preview
npm test           # age / college-year logic, film script timing, skeleton motion
npm run check      # typecheck + tests + build
```

Everything answers the pointer. Hover a dragon and it turns to you while the
others fall back (in the opening shot, click it to go to its chapter); cards tilt
and light up from inside, buttons lean toward the cursor, and the name catches
the light. It all runs from one handler in `src/ui/Hover.ts`, which moves only
transforms and stops while the page is scrolling, so hover can't cost a frame.

Handy URL flags: `?q=low|medium|high` force a quality tier, `?skip` skips the
loader and the opening sequence, `?nogl` shows the no-WebGL fallback,
`?cam=x,y,z,tx,ty,tz` pins the camera. In the console, `__kg.seek(chapter, p)`
jumps to any moment of any film.

## Edit the content

All text lives in **`src/data/content.ts`** (the film script, sections, hobbies,
skills, projects, achievements, dreams, contact). Identity, age and education
logic live in **`src/data/profile.ts`**.

To change what a dragon says, edit `FILM` in `content.ts`: each line has `at` and
`to`, the points of its film (0‥1) it plays between, and `npm test` checks they
fit. To change what a dragon does, edit its `beats` and `shots` in
`src/gl/dragon/species/`.

Things that update themselves:

- **Age** — calculated from the date of birth in Indian Standard Time; only the
  age is ever shown on the page.
- **College year** — BCA at Shayona College (Gujarat University) starting in
  2026–27. It moves to the next year every **1 June** (after exams and results)
  and shows **"BCA graduate · Class of 2029"** from 1 June 2029 onward.
- The copyright year.

`tests/profile.test.ts` pins these rules down (including the midnight-IST
boundaries), and CI runs it on every push.

## Deploy (Vercel)

1. Import the repository at vercel.com → it detects Vite (`vercel.json` is included).
2. Optional environment variables (see `.env.example`):
   - `RESEND_API_KEY` (+ `CONTACT_TO`, `CONTACT_FROM`) — contact form emails you
   - `CONTACT_WEBHOOK_URL` — send messages to an n8n workflow instead / as well
   - `GITHUB_TOKEN` — live GitHub stats without rate limits
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or the Vercel KV
     integration) — visitor counter + durable rate limiting
   - `SITE_URL` — canonical domain for SEO tags if you use a custom domain

Without any of them the site still works: the contact form opens the visitor's
mail app with the message pre-filled.

## Keyboard

`⌘K` / `Ctrl+K` command palette (it can replay the opening) · `/` quick open ·
`M` toggle sound · ↑ ↑ ↓ ↓ ← → ← → B A for Dragon Rage.

## Structure

```
api/                 Vercel Edge Functions (contact, github, pulse)
src/data/            all content + age/education logic
src/render/          build-time HTML (page sections, logo)
src/gl/              3D engine: Engine, Director (camera), PostFX, Sky, NameForge
src/gl/cinema/       the film system: beats, shots, timeline sampling
src/gl/dragon/       spine, SDF + surface nets, anatomy, wings, blueprints, worker
src/gl/dragon/species/  the seven dragons and their performances
src/gl/fx/           ground, particles, flame jet, lightning, props
src/gl/shaders/      GLSL (with a tiny #include system, see vite.config.ts)
src/ui/              loader, story (subtitles), HUD, live window, hero name, menu, reveals, game…
src/audio/           Web Audio synthesiser
```

© Kavya Gupta. All rights reserved.

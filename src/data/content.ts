/**
 * Every word on the site lives here. The HTML for each section is rendered
 * from this file at build time (see src/render), so the page is fully
 * readable without JavaScript and search engines see real text.
 */

export interface Stage {
  id: string;
  index: number;
  label: string;
  dragon: string;
  epithet: string;
  element: string;
  classification: string;
  color: string;
  color2: string;
  /** One-line flavour shown in the HUD specimen card. */
  lore: string;
}

export const STAGES: Stage[] = [
  {
    id: 'origin',
    index: 0,
    label: 'Origin',
    dragon: 'IGNIS',
    epithet: 'The Obsidian Sovereign',
    element: 'Magma',
    classification: 'Celestial serpent',
    color: '#ff6a1a',
    color2: '#ffc56a',
    lore: 'Sleeps in molten stone. Wakes when a name is spoken.',
  },
  {
    id: 'hobbies',
    index: 1,
    label: 'Hobbies',
    dragon: 'PIXEL',
    epithet: 'The Prism Wyrm',
    element: 'Data',
    classification: 'Voxel wyrm',
    color: '#ff2bd6',
    color2: '#2bf0ff',
    lore: 'Built from thousands of cubes. Changes colour with every obsession.',
  },
  {
    id: 'skills',
    index: 2,
    label: 'Skills',
    dragon: 'VOLT',
    epithet: 'The Circuit Serpent',
    element: 'Lightning',
    classification: 'Segmented storm-drake',
    color: '#22e4ff',
    color2: '#8a6bff',
    lore: 'Every plate a processor. Every arc a lesson self-taught.',
  },
  {
    id: 'projects',
    index: 3,
    label: 'Projects',
    dragon: 'JADE',
    epithet: 'The Crystal Forgewyrm',
    element: 'Crystal',
    classification: 'Faceted drake',
    color: '#1bf28e',
    color2: '#c8ff6a',
    lore: 'Grows a new crystal for every thing that ships.',
  },
  {
    id: 'achievements',
    index: 4,
    label: 'Achievements',
    dragon: 'AURUM',
    epithet: 'The Hoard King',
    element: 'Gold',
    classification: 'Winged sovereign',
    color: '#ffc53d',
    color2: '#fff0b8',
    lore: 'Guards a hoard earned, not inherited.',
  },
  {
    id: 'dreams',
    index: 5,
    label: 'Dreams',
    dragon: 'ASTRA',
    epithet: 'The Star-Born',
    element: 'Starlight',
    classification: 'Constellation dragon',
    color: '#a76bff',
    color2: '#ff7ad9',
    lore: 'Made of stars that have not been reached yet.',
  },
  {
    id: 'contact',
    index: 6,
    label: 'Contact',
    dragon: 'CRIMSON',
    epithet: 'The Ember Herald',
    element: 'Fire',
    classification: 'Messenger wyvern',
    color: '#ff2a4d',
    color2: '#ff8a3d',
    lore: 'Carries one message at a time, straight to Kavya.',
  },
];

/** One spoken line of a film: it plays between two points of scene progress. */
export interface Line {
  at: number;
  to: number;
  text: string;
}

/** The film each dragon plays when the reader reaches it. */
export interface Chapter {
  title: string;
  /** When the title card is on screen. */
  card: [number, number];
  lines: Line[];
  /**
   * Where the film has nothing left to say: the page starts rising here, while
   * the dragon makes its last move, so there is never an empty stretch to scroll.
   */
  outro: number;
}

/**
 * The seven dragons tell the story one at a time. Every line here comes from
 * the facts on the rest of the site: edit them alongside the sections below.
 */
export const FILM: Chapter[] = [
  {
    title: 'The First Flame',
    card: [0, 0.1],
    lines: [
      { at: 0.1, to: 0.27, text: 'I am Ignis. I was burning long before the first line of code.' },
      { at: 0.27, to: 0.46, text: 'The one I guard is Kavya Gupta. An AI expert who builds websites, apps, games and automations.' },
      { at: 0.46, to: 0.66, text: 'No timetable. No two days alike. A static life, Kavya says, is a boring life.' },
    ],
    outro: 0.8,
  },
  {
    title: 'Player One',
    card: [0.02, 0.15],
    lines: [
      { at: 0.15, to: 0.31, text: 'Player one: me. Pixel. Built from the thousands of games Kavya has played since childhood.' },
      { at: 0.31, to: 0.5, text: 'Gaming comes first. Then food. Then songs, always songs.' },
      { at: 0.58, to: 0.84, text: 'And when it gets quiet? A private universe, always open.' },
    ],
    outro: 0.85,
  },
  {
    title: 'The Self-Taught Storm',
    card: [0.02, 0.13],
    lines: [
      { at: 0.13, to: 0.32, text: 'I am Volt. Every plate on me is a skill Kavya learned alone.' },
      { at: 0.32, to: 0.54, text: 'No tuition. No classes. One root skill: Kavya can learn anything.' },
      { at: 0.7, to: 0.92, text: 'AI first. Then code and n8n automation, the full stack, in a single year. Watch it spark.' },
    ],
    outro: 0.93,
  },
  {
    title: 'The Forge',
    card: [0.02, 0.17],
    lines: [
      { at: 0.17, to: 0.36, text: 'I am Jade. I grow a new crystal for every thing that ships.' },
      { at: 0.36, to: 0.52, text: 'A hundred-game arcade in the making. A birthday reminder that writes its own messages.' },
      { at: 0.52, to: 0.67, text: 'Real sites, for real clients. And a long shelf of demos behind them.' },
      { at: 0.76, to: 0.92, text: 'Walk the forge. See what the fire made.' },
    ],
    outro: 0.93,
  },
  {
    title: 'The Hoard',
    card: [0.02, 0.2],
    lines: [
      { at: 0.2, to: 0.37, text: 'Behold the hoard. Every coin of it earned, never inherited.' },
      { at: 0.37, to: 0.54, text: 'More than ₹200K, before Kavya turned eighteen.' },
      { at: 0.72, to: 0.92, text: 'BGMI WOW contest, won twice. Computer classes taken: zero.' },
    ],
    outro: 0.93,
  },
  {
    title: 'The Unreached Sky',
    card: [0.02, 0.15],
    lines: [
      { at: 0.16, to: 0.32, text: 'I am Astra, made of stars nobody has reached yet.' },
      { at: 0.34, to: 0.5, text: 'A happy life, always. Not for Kavya. For family.' },
      { at: 0.52, to: 0.72, text: 'The richest man in the world. It sounds illogical. Kavya wants it anyway.' },
      { at: 0.74, to: 0.92, text: 'And every small dream after that, one by one.' },
    ],
    outro: 0.93,
  },
  {
    title: 'The Message',
    card: [0.03, 0.17],
    lines: [
      { at: 0.57, to: 0.71, text: 'I am Crimson, last of the seven. I carry one message at a time, straight to Kavya.' },
      { at: 0.71, to: 0.86, text: 'Here is what the others will not tell you: Kavya is shy, and loves it when someone says hi first.' },
      { at: 0.86, to: 0.97, text: 'So say something. I will fly it there myself.' },
    ],
    outro: 0.975,
  },
];

export const HERO = {
  eyebrow: 'Specimen 01 · Ignis · The Obsidian Sovereign',
  kicker: 'Websites, apps, games & automations, built with AI',
};

export const MANIFESTO = {
  tag: 'Lifestyle // the unscripted protocol',
  title: ['No timetable.', 'No two days alike.'],
  lead:
    'No two of my days are the same — and that is on purpose. I try to make every day different from the one before it, so I don’t follow a timetable. I hate them.',
  rules: [
    {
      code: 'R-01',
      title: 'Routine is not freedom',
      body:
        'People doing the same things at the exact same times, every single day? To me that isn’t freedom. That’s a boring life.',
    },
    {
      code: 'R-02',
      title: 'Believe in being free',
      body:
        'Keep things random. If you want to skip something, skip it. Just enjoy, and chill.',
    },
    {
      code: 'R-03',
      title: 'Skip the skippable — only',
      body:
        'I don’t mean showing up late to school, college or the office. I mean the skippable stuff. If you bathe every morning and one day you just don’t feel like it, that’s fine — skip it, or move it to the night.',
    },
  ],
  verdict: 'A static life is a boring life.',
  verdictSub: 'And yet, that is how most of the world lives.',
};

export interface Hobby {
  rank: number;
  id: string;
  title: string;
  hook: string;
  body: string[];
  chips: string[];
  stat: { value: string; label: string };
}

export const HOBBIES_INTRO = {
  title: 'Hobbies',
  sub: 'Five things I love — ranked by how much.',
  note: 'Scroll to play through all five levels.',
};

export const HOBBIES: Hobby[] = [
  {
    rank: 1,
    id: 'gaming',
    title: 'Gaming',
    hook: 'My favourite. Always has been.',
    body: [
      'Gaming is the thing I love most. I play BGMI, plus a mix of PC and Xbox games.',
      'Since I was a kid I’ve played thousands of different games — and I’m still going.',
    ],
    chips: ['BGMI', 'PC', 'Xbox'],
    stat: { value: '1000s', label: 'different games played since childhood' },
  },
  {
    rank: 2,
    id: 'food',
    title: 'Food',
    hook: 'Yes — eating counts as a hobby.',
    body: [
      'I like a lot of different foods, and eating is genuinely one of my hobbies.',
    ],
    chips: ['Food lover', 'So many favourites', 'Eating = hobby'],
    stat: { value: '∞', label: 'foods on the “yes” list' },
  },
  {
    rank: 3,
    id: 'music',
    title: 'Music',
    hook: 'Headphones on. World off.',
    body: ['I love listening to songs.'],
    chips: ['Songs', 'Headphones on', 'On repeat'],
    stat: { value: '♪', label: 'I just love songs' },
  },
  {
    rank: 4,
    id: 'imagination',
    title: 'Thinking & imagining',
    hook: 'I have a whole other world in my head.',
    body: [
      'When I’m alone or bored, I start thinking and slip into my own imagination world. I love it there — it makes me happy.',
      'Even when I’m with someone and get bored, being alone with my thoughts and my imagination is what I enjoy.',
    ],
    chips: ['Thinking', 'Imagining', 'My own world'],
    stat: { value: '1', label: 'private universe, always open' },
  },
  {
    rank: 5,
    id: 'talking',
    title: 'Talking with people',
    hook: 'Quiet on the outside. Not on the inside.',
    body: [
      'I’m an introvert and very shy. I don’t talk much and I’m not great at conversations, so I have few friends — and sometimes I feel like people aren’t interested in talking to me.',
      'But honestly? I love talking with people. I just can’t say it or explain it to anyone. I love it when someone comes up to me and starts a conversation. I may talk less, but I really like it when people try to talk to me.',
    ],
    chips: ['Introvert', 'Shy', 'Secretly loves a chat'],
    stat: { value: 'Say hi', label: 'it genuinely makes my day' },
  },
];

export interface SkillBranch {
  id: string;
  title: string;
  code: string;
  items: string[];
}

export const SKILLS = {
  title: 'Skills',
  sub: 'The arsenal — self-taught, and powered by AI.',
  core: {
    label: 'Root skill',
    title: 'I can learn any skill by myself.',
    body: 'That one is my biggest skill, and AI is how I put it to work. Every branch below grew out of it.',
  },
  branches: [
    {
      id: 'ai',
      title: 'AI',
      code: 'BR-01',
      items: ['Claude Code', 'AI coding agents', 'Prompt engineering', 'AI automation', 'AI-powered apps', 'AI video creation', 'Image generation'],
    },
    {
      id: 'mind',
      title: 'Mind',
      code: 'BR-02',
      items: ['Coding', 'Programming', 'Logic', 'Gaming', 'Puzzle solving'],
    },
    {
      id: 'n8n',
      title: 'n8n automation',
      code: 'BR-03',
      items: [
        'Custom multi-step workflows',
        'API integrations',
        'Data transformation',
        'Conditional logic',
        'Scheduled & webhook automations',
        'AI-powered workflows',
      ],
    },
    {
      id: 'dev',
      title: 'Development',
      code: 'BR-04',
      items: ['Website development', 'Web applications', 'App development', 'Game development'],
    },
  ] satisfies SkillBranch[],
  arsenal: [
    { group: 'Languages', items: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'PHP', 'C#'] },
    { group: 'Frameworks', items: ['React', 'Next.js', 'Vite', 'Astro', 'Eleventy', 'Express', 'Node.js'] },
    { group: 'UI & motion', items: ['Tailwind CSS', 'shadcn/ui', 'Radix UI', 'GSAP', 'Framer Motion', 'Lenis'] },
    { group: '3D & games', items: ['Three.js', 'React Three Fiber', 'Unity', 'HTML5 Canvas', 'Web Audio'] },
    { group: 'Platform', items: ['Firebase', 'Firestore', 'Push notifications', 'PWAs', 'Service workers', 'IndexedDB'] },
    { group: 'Builds & AI', items: ['Chrome extensions', 'WordPress themes', 'Monaco editor', 'Vapi voice AI', 'LLM APIs'] },
    { group: 'Ship it', items: ['Git', 'GitHub', 'Vercel', 'Firebase Hosting'] },
  ],
};

/** How Kavya works: with AI, and this site is the proof. */
export const AI_WAY = {
  tag: 'How I work',
  note: 'AI first',
  title: 'I’m an AI expert. I build with AI, every day.',
  body: 'I’m extremely good at using AI. I decide what to make, imagine how it should look and feel, and give the commands. AI does the work, and I steer it until it’s exactly right.',
  proofTitle: 'The biggest proof: this website.',
  proof: 'I built all of it with Claude Code. I imagined the seven dragons and the whole theme, and gave the commands. Claude Code wrote the code: the 3D dragons, the shaders, the films, the music, every line.',
  stats: [
    { value: '100%', label: 'built with Claude Code' },
    { value: '~20,000', label: 'lines of code, written by AI' },
    { value: '1', label: 'director: me' },
  ],
};

export interface Project {
  id: string;
  name: string;
  kind: string;
  year?: string;
  summary: string;
  tags: string[];
  url?: string;
  glyph: string;
  hue: number;
  note?: string;
  /** Takes the whole row. */
  wide?: boolean;
}

export const PROJECTS_INTRO = {
  title: 'Projects',
  sub: 'Things I’ve forged — for myself and for clients.',
};

export const PERSONAL_PROJECTS: Project[] = [
  {
    id: 'this-site',
    name: 'This website',
    kind: 'Built with Claude Code · 3D portfolio',
    summary:
      'The site you are on: seven 3D dragons, custom shaders, films and music, all made live in your browser. I imagined it and directed every scene; Claude Code wrote the code.',
    tags: ['Claude Code', 'Three.js', 'GLSL', 'TypeScript', 'GSAP', 'Web Audio'],
    glyph: 'AI',
    hue: 268,
    wide: true,
  },
  {
    id: 'neon-arcade',
    name: 'Neon Arcade',
    kind: 'Game platform · PWA',
    summary:
      'A 100-game arcade that installs like an app, keeps working with the network off, and wraps every screen in one slowly morphing neon. Games land one at a time — 26+ are already playable, from chess to tower defence.',
    tags: ['React', 'TypeScript', 'Vite', 'PWA', 'Firebase'],
    url: 'https://neon-arcade-coral.vercel.app/',
    glyph: 'NA',
    hue: 300,
  },
  {
    id: 'myreminder',
    name: 'MyReminder',
    kind: 'AI web app · PWA',
    summary:
      'An AI-powered birthday reminder. It writes personalised messages that match the relationship, lets you add reminders by chatting, and sends push notifications so a special day never slips by.',
    tags: ['React', 'Firebase', 'Push notifications', 'Node.js', 'AI'],
    url: 'https://myreminder.xyz/',
    glyph: 'MR',
    hue: 18,
  },
];

export const PROFESSIONAL_PROJECTS: Project[] = [
  {
    id: 'guptaumesh',
    name: 'guptaumesh.in',
    kind: 'Client · Portfolio',
    summary: 'A personal portfolio website, designed and built for Umesh Gupta.',
    tags: ['Client work'],
    url: 'https://www.guptaumesh.in/',
    glyph: 'UG',
    hue: 30,
  },
  {
    id: 'growthstrats',
    name: 'GrowthStrats Build',
    kind: 'Client · Agency site',
    summary: 'The website for GrowthStrats Build, an AI-enabled web studio.',
    tags: ['React', 'Vite', 'Client work'],
    url: 'https://ai.growthstrats.com/',
    glyph: 'GS',
    hue: 160,
  },
  {
    id: 'lanecraft',
    name: 'Lanecraft Lab',
    kind: 'Client · Business site',
    summary: 'A business website built for Lanecraft Lab.',
    tags: ['Client work'],
    url: 'https://lanecraftlab.com/',
    glyph: 'LL',
    hue: 210,
  },
  {
    id: 'telesleep',
    name: 'Telesleep Clinic',
    kind: 'Client · Clinic site',
    summary: 'The website for Telesleep Clinic.',
    tags: ['Client work'],
    url: 'https://telesleepclinic.com/',
    glyph: 'TS',
    hue: 250,
  },
  {
    id: 'sws',
    name: 'SWS Global Group',
    kind: 'Client · Corporate site',
    summary: 'A corporate website built for SWS Global Group.',
    tags: ['Client work'],
    url: 'https://www.swsglobalgroup.com/',
    glyph: 'SW',
    hue: 350,
  },
];

export const VAULT = [
  {
    name: 'CODE-X',
    body:
      'A password-protected code library for my college coding group, with the same editor that powers VS Code built in, live sync, an admin console and one-click zip backups.',
  },
  {
    name: 'Message Refiner AI',
    body: 'A Chrome extension that rewrites whatever you are typing into a better message, using AI.',
  },
  {
    name: 'Ultra Hard IQ Test',
    body: 'An IQ test that lives up to its name.',
  },
  {
    name: 'Premium HTML templates',
    body: 'Game templates, coming-soon page templates and an animated 404 page.',
  },
  {
    name: 'WordPress themes',
    body: 'Custom WordPress / PHP themes.',
  },
  {
    name: 'Client demo websites',
    body: 'A long shelf of demo sites built for prospective clients.',
  },
];

export const WORK_SUMMARY = {
  freelance: 'A lot of freelance work for real clients.',
  personal: 'A lot of personal projects — games included.',
};

export interface Achievement {
  id: string;
  value: number;
  prefix?: string;
  suffix?: string;
  display: string;
  title: string;
  body: string;
}

export const ACHIEVEMENTS_INTRO = {
  title: 'Achievements',
  sub: 'The hoard — earned, never inherited.',
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'earned',
    value: 200,
    prefix: '₹',
    suffix: 'K+',
    display: '₹200K+',
    title: 'Earned before turning 18',
    body: 'More than ₹200K, earned before my eighteenth birthday — something fewer than 1% of people can do.',
  },
  {
    id: 'bgmi',
    value: 2,
    suffix: '×',
    display: '2×',
    title: 'BGMI WOW contest winner',
    body: 'Won it twice — and proved to my family that games aren’t that bad, and that you can earn from them too.',
  },
  {
    id: 'classes',
    value: 0,
    display: '0',
    title: 'Computer classes taken',
    body: 'Many freelance projects delivered without a single computer tuition or class. I learned everything myself, and I’m proud of that.',
  },
  {
    id: 'year',
    value: 1,
    suffix: ' yr',
    display: '1 yr',
    title: 'To learn the full stack',
    body: 'n8n, web development, frontend, backend and much more — learned within one year, entirely by myself.',
  },
];

export const DREAMS_INTRO = {
  title: 'Dreams',
  sub: 'Where this is all going.',
};

export const DREAMS = [
  {
    id: 'family',
    label: 'Dream I',
    title: 'A happy life — always.',
    body: 'Not for myself, but for my family.',
  },
  {
    id: 'richest',
    label: 'Dream II · personal',
    title: 'Become the richest man in the world.',
    body: 'It sounds illogical. But yes — I want this.',
  },
  {
    id: 'small',
    label: 'Dream III',
    title: 'Complete every small dream, one by one.',
    body: 'There are a lot of them — and I’m going after every single one.',
  },
];

export const CONTACT = {
  title: 'Contact',
  sub: 'Summon me.',
  lead: 'Have a project, an idea, or just want to talk? I’d genuinely love that — remember, I like it when people start the conversation.',
  email: 'kavya.ugupta@gmail.com',
  socials: [
    { id: 'instagram', label: 'Instagram', handle: '@_kavy_gupta_', url: 'https://www.instagram.com/_kavy_gupta_/' },
    { id: 'github', label: 'GitHub', handle: 'kavya-gupta-3', url: 'https://github.com/kavya-gupta-3' },
    { id: 'linkedin', label: 'LinkedIn', handle: 'Kavya Gupta', url: 'https://www.linkedin.com/in/kavya-gupta-10a355401' },
  ],
};

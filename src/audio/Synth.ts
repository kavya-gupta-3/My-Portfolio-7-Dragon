/**
 * The whole soundtrack is synthesised live with the Web Audio API — zero
 * audio files. A detuned drone retunes to each dragon's chord, wind rises
 * with scroll speed, and every dragon has its own voice: its own roar, its
 * own language under the subtitles, its own ambience and its own answer to a
 * click. On the "music" hobby a generative pentatonic melody plays, with a
 * live analyser driving the equaliser on the page.
 */

import type { Voice } from '../gl/dragon/Dragon';

const CHORDS: number[][] = [
  [55.0, 82.41, 110.0, 164.81],
  [73.42, 110.0, 146.83, 220.0],
  [61.74, 92.5, 123.47, 185.0],
  [65.41, 98.0, 130.81, 196.0],
  [69.3, 103.83, 138.59, 207.65],
  [82.41, 123.47, 164.81, 246.94],
  [58.27, 87.31, 116.54, 174.61],
];
const CUTOFF = [380, 900, 700, 620, 760, 1100, 520];
// D major pentatonic over two octaves — warm, "filmy"
const MELODY = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0];
/** Notes the arcade plays when you stir the pixels: C minor pentatonic. */
const ARCADE = [523.25, 622.25, 698.46, 783.99, 932.33, 1046.5, 1244.5, 1396.9];

type Wave = OscillatorType;
const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);

export class Synth {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private droneGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private oscs: OscillatorNode[] = [];
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private noise!: AudioBuffer;
  private nextNote = 0;
  private nextAir = 0;
  private arcadeAt = 0;
  /** Small sounds wait until a big one has had its moment. */
  private quietUntil = 0;
  private roarUntil = 0;
  private tickNote = 0;
  private stage = 0;
  enabled = false;
  music = 0;

  get available() {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  private get live() {
    return this.enabled && !!this.ctx;
  }

  private build() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.analyser.smoothingTimeConstant = 0.75;
    this.master.connect(comp).connect(this.analyser).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.master);

    // generated cave reverb
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.4, 2.4);
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.55;
    this.verbSend.connect(this.verb).connect(this.master);
    this.sfx.connect(this.verbSend);

    // drone
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = CUTOFF[0];
    this.droneFilter.Q.value = 5;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    this.droneGain.connect(this.verbSend);
    CHORDS[0].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.9 : 0.32;
      o.connect(g).connect(this.droneFilter);
      o.start();
      this.oscs.push(o);
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();

    // wind
    this.noise = this.noiseBuffer(2);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.8;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.015;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }

  private impulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private noiseBuffer(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
      d[i] = b * 3.5;
    }
    return buf;
  }

  async enable() {
    if (!this.available) return;
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    const t = this.ctx!.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0.85, t, 0.6);
    this.enabled = true;
    this.setStage(this.stage, true);
  }

  disable() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.15);
    this.enabled = false;
    window.setTimeout(() => {
      if (!this.enabled) void this.ctx?.suspend();
    }, 800);
  }

  /** The tab is out of sight: a hidden page shouldn't keep playing. */
  hush(hidden: boolean) {
    if (!this.ctx || !this.enabled) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  setStage(i: number, force = false) {
    if (i === this.stage && !force) return;
    this.stage = i;
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    CHORDS[i].forEach((f, k) => this.oscs[k]?.frequency.setTargetAtTime(f, t, 1.2));
    this.droneFilter.frequency.setTargetAtTime(CUTOFF[i], t, 1.5);
  }

  /** Per-frame: wind follows scroll speed, each world keeps making its own noises. */
  tick(scrollVelocity: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, Math.abs(scrollVelocity) / 40);
    this.windGain.gain.setTargetAtTime(0.012 + v * 0.11, t, 0.25);
    this.windFilter.frequency.setTargetAtTime(380 + v * 1800, t, 0.3);
    if (t > this.nextAir) {
      this.nextAir = t < this.quietUntil ? this.quietUntil + 0.4 : t + this.air(this.stage);
    }
    if (this.music > 0.5) {
      if (this.nextNote < t) this.nextNote = t + 0.05;
      while (this.nextNote < t + 0.12) {
        const step = Math.random();
        const note = MELODY[Math.floor(Math.random() * MELODY.length)];
        if (step > 0.18) this.pluck(note, this.nextNote, 0.12 * this.music);
        this.nextNote += step > 0.85 ? 0.5 : 0.25;
      }
    }
  }

  /** 0‥255 levels for a visualiser. */
  levels(out: Uint8Array<ArrayBuffer>) {
    if (!this.ctx || !this.enabled) return false;
    this.analyser.getByteFrequencyData(out);
    return true;
  }

  /* ------------------------------------------------------ building blocks */

  private env(gain: GainNode, t: number, peak: number, attack: number, release: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  /** One oscillator, gliding from f0 to f1, with a simple envelope. */
  private tone(wave: Wave, f0: number, f1: number, at: number, attack: number, release: number, vol: number, out: AudioNode = this.sfx) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), at + attack + release);
    o.connect(g).connect(out);
    this.env(g, at, vol, attack, release);
    o.start(at);
    o.stop(at + attack + release + 0.05);
    return o;
  }

  /** Filtered noise: everything from a footfall to a wind gust. */
  private hiss(filter: BiquadFilterType, f0: number, f1: number, q: number, at: number, attack: number, release: number, vol: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), at + attack + release);
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.sfx);
    this.env(g, at, vol, attack, release);
    src.start(at, Math.random() * 1.5);
    src.stop(at + attack + release + 0.05);
  }

  /** A struck, metallic or glassy note: FM with a ratio that isn't a harmonic. */
  private bell(freq: number, ratio: number, at: number, decay: number, vol: number) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * ratio;
    modGain.gain.setValueAtTime(freq * 2.2, at);
    modGain.gain.exponentialRampToValueAtTime(1, at + decay);
    mod.connect(modGain).connect(car.frequency);
    car.connect(g).connect(this.sfx);
    this.env(g, at, vol, 0.003, decay);
    car.start(at);
    mod.start(at);
    car.stop(at + decay + 0.05);
    mod.stop(at + decay + 0.05);
  }

  private pluck(freq: number, t: number, vol: number) {
    this.bell(freq, 2, t, 0.9, vol);
  }

  /** Crackling: a shower of tiny bright ticks. */
  private crackle(at: number, seconds: number, count: number, vol: number, low = 1400) {
    for (let i = 0; i < count; i++) this.hiss('highpass', low, low, 0.7, at + Math.random() * seconds, 0.001, 0.012 + Math.random() * 0.02, vol * (0.3 + Math.random() * 0.7));
  }

  /** The low end of any impact. */
  private boom(at: number, vol: number, f0 = 120) {
    this.tone('sine', f0, 32, at, 0.008, 0.9, vol);
    this.hiss('lowpass', 420, 60, 0.7, at, 0.01, 0.8, vol * 0.55);
  }

  /* --------------------------------------------------------- the dragons */

  /** A dragon calls for a sound. */
  voice(dragon: number, kind: Voice, amount = 1) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (kind === 'roar') this.roar(dragon, t);
    else if (kind === 'stir') this.stir(dragon, t, amount);
    else if (kind === 'impact') this.impact(dragon, t, amount);
    else if (kind === 'rise') this.rise(dragon, t);
    else this.flap(t);
  }

  private roar(d: number, t: number) {
    // a roar on top of a roar is just noise
    if (t < this.roarUntil) return;
    this.roarUntil = t + 1.1;
    this.quietUntil = t + 1.6;
    const ctx = this.ctx!;
    if (d === 0) {
      // a throat of molten rock
      this.growl(t, 104, 40, 760, 0.62, 2);
      this.tone('sine', 55, 30, t, 0.1, 2, 0.5);
      this.crackle(t + 0.1, 1.5, 34, 0.1);
    } else if (d === 1) {
      // a boss in an old cartridge
      [880, 659, 523, 440, 330, 262, 196, 147].forEach((f, i) => this.tone('square', f, f * 0.94, t + i * 0.055, 0.002, 0.1, 0.13));
      this.tone('sawtooth', 110, 55, t + 0.32, 0.01, 0.75, 0.16);
      for (let i = 0; i < 7; i++) this.hiss('bandpass', 800 + i * 400, 800 + i * 400, 3, t + 0.3 + i * 0.075, 0.002, 0.05, 0.11);
    } else if (d === 2) {
      // current through a throat: a growl, ring-modulated into a buzz
      const o = this.tone('sawtooth', 165, 62, t, 0.04, 1.7, 0.42);
      const ring = ctx.createOscillator();
      ring.frequency.value = 97;
      const depth = ctx.createGain();
      depth.gain.value = 70;
      ring.connect(depth).connect(o.frequency);
      ring.start(t);
      ring.stop(t + 1.8);
      this.hiss('bandpass', 2800, 700, 2, t, 0.02, 1.5, 0.2);
      this.crackle(t, 1.4, 24, 0.16, 2600);
    } else if (d === 3) {
      // a mountain clearing its throat, and every crystal ringing with it
      this.growl(t, 64, 34, 460, 0.6, 2.2);
      [1174, 1568, 2093, 2794].forEach((f, i) => this.bell(f * between(0.98, 1.02), 3.5, t + 0.18 + i * 0.13, 1.6, 0.05));
    } else if (d === 4) {
      // not a roar: a war horn
      [110, 165, 220, 277].forEach((f, i) => {
        const o = this.tone('sawtooth', f * 0.92, f, t + i * 0.02, 0.34, 1.7, 0.15);
        o.detune.value = (i - 1.5) * 7;
      });
      this.hiss('lowpass', 500, 120, 1, t, 0.3, 1.6, 0.16);
      this.bell(1975, 2.76, t + 0.3, 1.8, 0.06);
    } else if (d === 5) {
      // whale song, a long way off
      const o = this.tone('sine', 196, 196, t, 0.3, 2.6, 0.26);
      o.frequency.exponentialRampToValueAtTime(523, t + 0.9);
      o.frequency.exponentialRampToValueAtTime(293, t + 2.7);
      const h = this.tone('sine', 588, 588, t + 0.1, 0.4, 2.2, 0.06);
      h.frequency.exponentialRampToValueAtTime(1046, t + 1.0);
      h.frequency.exponentialRampToValueAtTime(880, t + 2.6);
      for (let i = 0; i < 6; i++) this.bell(between(1800, 3600), 2, t + 0.5 + i * 0.26, 1.2, 0.03);
    } else {
      // a raptor's scream, with the weight of a dragon under it
      const o = this.tone('sawtooth', 1320, 420, t, 0.03, 1.15, 0.2);
      const shake = ctx.createOscillator();
      shake.frequency.value = 37;
      const depth = ctx.createGain();
      depth.gain.value = 130;
      shake.connect(depth).connect(o.frequency);
      shake.start(t);
      shake.stop(t + 1.25);
      this.hiss('bandpass', 2400, 800, 2.5, t, 0.03, 1.1, 0.24);
      this.growl(t + 0.08, 120, 56, 820, 0.34, 1.3);
    }
  }

  /** The animal part of a roar: a falling saw and growling noise. */
  private growl(t: number, f0: number, f1: number, cutoff: number, vol: number, seconds: number) {
    const ctx = this.ctx!;
    const body = ctx.createGain();
    body.gain.value = 0.5;
    const am = ctx.createOscillator();
    am.frequency.value = 32;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    am.connect(amGain).connect(body.gain);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + seconds * 0.9);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 8;
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(150, t + seconds);
    const g = ctx.createGain();
    o.connect(body);
    src.connect(body);
    body.connect(f).connect(g).connect(this.sfx);
    this.env(g, t, vol, 0.08, seconds);
    o.start(t);
    am.start(t);
    src.start(t, Math.random());
    const end = t + seconds + 0.15;
    o.stop(end);
    am.stop(end);
    src.stop(end);
  }

  /** It moves between lines. Small sounds, and each its own. */
  private stir(d: number, t: number, amount: number) {
    if (d === 0) {
      for (let i = 0; i < 3; i++) this.tone('sine', between(70, 110), between(150, 240), t + i * 0.09, 0.01, 0.14, 0.2 * (0.5 + amount));
      this.tone('sine', 44, 30, t, 0.1, 0.9, 0.42 * amount);
      this.crackle(t, 0.7, 12, 0.08);
    } else if (d === 1) {
      const root = 262 * Math.pow(2, Math.round(amount * 12) / 12);
      [1, 1.25, 1.5, 2].forEach((m, i) => this.tone('square', root * m, root * m, t + i * 0.05, 0.002, 0.09, 0.08));
    } else if (d === 2) {
      this.tone('sawtooth', 240, 1900, t, 0.5, 0.2, 0.05 * amount);
      this.crackle(t + 0.1, 0.5, 14, 0.14, 2600);
    } else if (d === 3) {
      this.bell(between(1400, 2400), 3.5, t, 1.2, 0.07);
      this.tone('sine', 62, 40, t, 0.03, 0.7, 0.2);
    } else if (d === 4) {
      this.coins(t, 5, 0.07);
    } else if (d === 5) {
      [0, 4, 7, 12].forEach((n, i) => this.bell(880 * Math.pow(2, (n + Math.round(amount * 7)) / 12), 2, t + i * 0.09, 1, 0.045));
    } else {
      this.hiss('bandpass', 500, 1600, 1, t, 0.14, 0.5, 0.16);
    }
  }

  /** The hit that a scene has been building to. */
  private impact(d: number, t: number, amount: number) {
    this.boom(t, 0.62 * amount, d === 3 ? 92 : 130);
    if (d === 0) {
      this.hiss('lowpass', 2600, 240, 0.8, t, 0.02, 1.7, 0.42);
      this.crackle(t, 1.6, 42, 0.16);
    } else if (d === 1) {
      for (let i = 0; i < 9; i++) this.tone('square', 1800 / (i + 1), 1500 / (i + 1), t + i * 0.024, 0.001, 0.05, 0.1);
      this.hiss('highpass', 3000, 3000, 1, t, 0.002, 0.2, 0.2);
    } else if (d === 2) {
      this.thunder(1);
    } else if (d === 3) {
      for (let i = 0; i < 12; i++) this.bell(between(1700, 5200), 3.5, t + Math.random() * 0.34 * amount, between(0.3, 1), 0.05 * amount);
      this.hiss('highpass', 3800, 2400, 1, t, 0.003, 0.5, 0.2 * amount);
    } else if (d === 4) {
      this.bell(392, 2.76, t, 2.4, 0.2);
      this.bell(196, 1.41, t, 2.8, 0.2);
      this.coins(t + 0.08, 18, 0.09);
    } else if (d === 5) {
      [196, 293.66, 440, 587.33, 880, 1318.5].forEach((f, i) => this.tone('sine', f, f, t + i * 0.03, 0.2, 2.6, 0.075));
      this.hiss('bandpass', 700, 4800, 1.2, t, 0.3, 1.4, 0.13);
    } else {
      this.hiss('bandpass', 1200, 220, 0.8, t, 0.02, 1.5, 0.5);
      this.crackle(t + 0.05, 1.2, 28, 0.13);
    }
  }

  /** The tension before an entrance lands, about two seconds of it. */
  private rise(d: number, t: number) {
    if (d === 0) {
      this.tone('sine', 26, 74, t, 1.7, 0.3, 0.5);
      this.hiss('lowpass', 90, 900, 1, t, 1.6, 0.3, 0.32);
      this.crackle(t + 0.4, 1.3, 26, 0.09);
    } else if (d === 1) {
      for (let i = 0; i < 26; i++) {
        const at = 1.9 * (1 - Math.pow(1 - i / 26, 1.7));
        this.tone('square', 110 * Math.pow(2, i / 7), 110 * Math.pow(2, i / 7), t + at, 0.002, 0.05, 0.05 + i * 0.002);
      }
    } else if (d === 2) {
      this.hiss('bandpass', 180, 2800, 4, t, 2, 0.1, 0.1);
      this.tone('sawtooth', 50, 100, t, 1.9, 0.2, 0.05);
    } else if (d === 3) {
      this.tone('sine', 30, 46, t, 0.8, 1.6, 0.4);
      for (let i = 0; i < 5; i++) this.bell(between(900, 1900), 3.5, t + 0.3 + i * 0.3, 1.2, 0.03 + i * 0.008);
    } else if (d === 4) {
      [220, 277, 330, 440].forEach((f) => this.tone('triangle', f, f * 1.5, t, 1.8, 0.2, 0.05));
      this.coins(t, 12, 0.03, 1.8);
    } else if (d === 5) {
      this.hiss('bandpass', 500, 6400, 2, t, 2.2, 0.2, 0.11);
      for (let i = 0; i < 14; i++) this.bell(between(1400, 5200), 2, t + i * 0.15, 0.8, 0.02 + i * 0.002);
    } else {
      // a heartbeat in the dark, getting faster
      [0.1, 0.42, 1.1, 1.38, 1.9, 2.12].forEach((at, i) => this.tone('sine', 66, 38, t + at, 0.008, 0.2, 0.4 + i * 0.05));
      this.hiss('lowpass', 240, 1200, 0.8, t, 2.2, 0.2, 0.09);
    }
  }

  /** The air hit by a wing. */
  private flap(t: number) {
    this.hiss('lowpass', 460, 90, 0.8, t, 0.05, 0.42, 0.34);
    this.tone('sine', 72, 40, t, 0.03, 0.34, 0.26);
  }

  private coins(t: number, count: number, vol: number, seconds = 0.5) {
    for (let i = 0; i < count; i++) this.bell(between(2600, 5400), 1.41, t + Math.random() * seconds, between(0.1, 0.42), vol);
  }

  /** Lightning close by, or a long way off. */
  thunder(power: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    for (let k = 0; k < 4; k++) this.hiss('highpass', 2200, 2200, 0.7, t + k * 0.045 + Math.random() * 0.03, 0.001, 0.05, 0.3 * power * (0.5 + Math.random() * 0.5));
    this.hiss('lowpass', 240, 60, 0.7, t + 0.12 + (1 - power) * 0.3, 0.04, 2.4, 0.62 * Math.max(power, 0.4));
  }

  /** The dragon speaks: its own language, one syllable to a word. */
  speak(d: number, words: number, pace: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime + 0.05;
    const n = Math.min(words, 18);
    for (let i = 0; i < n; i++) {
      const at = t + i * pace + Math.random() * 0.05;
      if (Math.random() < 0.14) continue;
      this.syllable(d, at, i / n);
    }
  }

  private syllable(d: number, t: number, along: number) {
    const ctx = this.ctx!;
    if (d === 1) {
      // a text box in an old game
      this.tone('square', pick([294, 330, 392, 440, 494]) * (1 - along * 0.1), 300, t, 0.003, 0.07, 0.035);
      return;
    }
    if (d === 3) {
      this.bell(between(190, 300), 3.01, t, 0.32, 0.05);
      return;
    }
    if (d === 5) {
      this.hiss('bandpass', between(1100, 2600), between(800, 2000), 5, t, 0.04, 0.16, 0.07);
      this.tone('sine', 660, 620, t, 0.03, 0.18, 0.016);
      return;
    }
    // the rest have throats: a buzz through a moving formant
    const settings: Record<number, [number, number, number, Wave]> = {
      0: [58, 280, 620, 'sawtooth'],
      2: [130, 900, 1900, 'sawtooth'],
      4: [84, 360, 780, 'sawtooth'],
      6: [104, 700, 1300, 'sawtooth'],
    };
    const [pitch, lo, hi, wave] = settings[d] ?? settings[0];
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(pitch * between(0.96, 1.1), t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.86, t + 0.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = d === 2 ? 8 : 5;
    f.frequency.setValueAtTime(between(lo, hi), t);
    f.frequency.exponentialRampToValueAtTime(between(lo, hi), t + 0.19);
    const g = ctx.createGain();
    o.connect(f).connect(g).connect(this.sfx);
    this.env(g, t, d === 2 ? 0.07 : 0.12, 0.02, 0.2);
    o.start(t);
    o.stop(t + 0.26);
  }

  /** What each world sounds like when nothing is happening. Returns the wait until the next. */
  private air(d: number) {
    const t = this.ctx!.currentTime;
    if (d === 0) {
      this.crackle(t, 1.3, 9, 0.035);
      if (Math.random() < 0.3) this.tone('sine', between(60, 90), between(130, 190), t, 0.01, 0.2, 0.05);
      return between(0.9, 2.2);
    }
    if (d === 1) {
      // a bass line from the attract screen of an arcade machine
      const root = pick([55, 55, 65.4, 73.4]);
      [1, 2, 1.5, 2].forEach((m, i) => this.tone('square', root * m, root * m, t + i * 0.2, 0.004, 0.13, 0.022));
      return 0.8;
    }
    if (d === 2) {
      this.tone('sawtooth', 100, 100, t, 0.5, 1.4, 0.009);
      if (Math.random() < 0.55) this.crackle(t, 0.5, 6, 0.04, 2800);
      return between(1.4, 3.6);
    }
    if (d === 3) {
      this.bell(pick([1046, 1174, 1396, 1568, 1760, 2093]), 3.5, t, 1.8, 0.018);
      return between(0.9, 2.6);
    }
    if (d === 4) {
      if (Math.random() < 0.6) this.coins(t, 2, 0.016, 0.3);
      this.tone('triangle', 277, 277, t, 0.9, 1.5, 0.008);
      return between(1.6, 3.6);
    }
    if (d === 5) {
      this.bell(pick([1318.5, 1760, 1975.5, 2637, 3520]), 2, t, 1.6, 0.016);
      return between(0.6, 1.9);
    }
    // a slow heartbeat under the wind
    this.tone('sine', 62, 38, t, 0.01, 0.2, 0.09);
    this.tone('sine', 62, 38, t + 0.28, 0.01, 0.2, 0.06);
    return between(2, 3);
  }

  /** The hand-over between two chapters. */
  cut(to: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (to === 0) this.hiss('bandpass', 240, 1800, 0.8, t, 0.5, 0.9, 0.3);
    else if (to === 1) {
      for (let i = 0; i < 10; i++) this.tone('square', 1400 - i * 120, 1400 - i * 120, t + i * 0.05, 0.002, 0.04, 0.05);
    } else if (to === 2) this.thunder(0.8);
    else if (to === 3) {
      this.hiss('highpass', 3200, 2000, 1, t, 0.005, 0.4, 0.12);
      for (let i = 0; i < 7; i++) this.bell(between(1800, 4600), 3.5, t + Math.random() * 0.4, 0.6, 0.04);
    } else if (to === 4) {
      this.hiss('lowpass', 300, 1600, 2, t, 0.9, 0.5, 0.2);
      this.coins(t + 0.5, 8, 0.05);
    } else if (to === 5) {
      this.hiss('bandpass', 2600, 240, 2, t, 0.6, 0.9, 0.16);
      this.tone('sine', 880, 110, t, 0.2, 1.2, 0.05);
    } else {
      this.hiss('bandpass', 200, 900, 0.8, t, 0.3, 0.7, 0.26);
      this.tone('sine', 66, 38, t + 0.1, 0.008, 0.22, 0.4);
    }
  }

  /** A click, in the language of the chapter it lands in. */
  click(d: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (t < this.roarUntil - 0.9) return;
    this.quietUntil = Math.max(this.quietUntil, t + 0.7);
    if (d === 0) {
      this.hiss('bandpass', 400, 2200, 0.9, t, 0.03, 0.34, 0.26);
      this.crackle(t, 0.3, 8, 0.1);
    } else if (d === 1) {
      this.tone('square', 1500, 180, t, 0.002, 0.14, 0.08);
      this.tone('square', 760, 90, t + 0.03, 0.002, 0.12, 0.05);
    } else if (d === 2) {
      this.crackle(t, 0.14, 10, 0.26, 2400);
      this.tone('sawtooth', 2200, 110, t, 0.002, 0.12, 0.06);
      this.hiss('lowpass', 200, 60, 0.7, t + 0.05, 0.02, 0.5, 0.22);
    } else if (d === 3) {
      this.bell(between(2100, 3100), 3.5, t, 0.5, 0.09);
      this.bell(between(3300, 4300), 3.5, t + 0.05, 0.36, 0.06);
      this.hiss('highpass', 4200, 3000, 1, t, 0.002, 0.08, 0.1);
    } else if (d === 4) {
      this.coins(t, 6, 0.08, 0.26);
      this.bell(1568, 1.41, t, 0.6, 0.07);
    } else if (d === 5) {
      [1318.5, 1760, 2637, 3520].forEach((f, i) => this.bell(f, 2, t + i * 0.045, 0.8, 0.05));
    } else {
      this.hiss('bandpass', 3000, 500, 1.4, t, 0.012, 0.22, 0.3);
      this.hiss('lowpass', 900, 200, 0.8, t + 0.03, 0.02, 0.4, 0.18);
    }
  }

  /** The pointer has found a dragon. */
  touch(d: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (t < this.quietUntil) return;
    if (d === 0) this.crackle(t, 0.16, 6, 0.08);
    else if (d === 1) this.tone('square', 988, 1319, t, 0.002, 0.08, 0.05);
    else if (d === 2) this.crackle(t, 0.1, 5, 0.1, 2800);
    else if (d === 3) this.bell(2349, 3.5, t, 0.5, 0.05);
    else if (d === 4) this.bell(3136, 1.41, t, 0.4, 0.05);
    else if (d === 5) this.bell(1760, 2, t, 0.8, 0.05);
    else this.hiss('bandpass', 700, 1500, 1, t, 0.04, 0.2, 0.1);
  }

  /** You are stirring the pixels: every touch plays the arcade like an instrument. */
  arcade(height: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (t < this.arcadeAt) return;
    this.arcadeAt = t + 0.075;
    const note = ARCADE[Math.max(0, Math.min(ARCADE.length - 1, Math.round(height * (ARCADE.length - 1))))];
    this.tone('square', note, note, t, 0.002, 0.08, 0.026);
  }

  /** Small interface sounds, tuned to whichever chapter you are in. */
  ui(kind: 'tick' | 'press' | 'open' | 'close' | 'copy' | 'error') {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    const chord = CHORDS[this.stage];
    if (kind === 'tick') {
      this.tickNote = (this.tickNote + 1) % chord.length;
      this.tone('sine', chord[this.tickNote] * 8, chord[this.tickNote] * 8, t, 0.002, 0.05, 0.02);
    } else if (kind === 'press') {
      this.tone('triangle', chord[3] * 4, chord[1] * 4, t, 0.002, 0.09, 0.06);
    } else if (kind === 'open') {
      this.hiss('bandpass', 300, 1500, 1, t, 0.18, 0.22, 0.1);
      chord.forEach((f, i) => this.tone('sine', f * 4, f * 4, t + i * 0.035, 0.005, 0.2, 0.03));
    } else if (kind === 'close') {
      this.hiss('bandpass', 1400, 300, 1, t, 0.04, 0.26, 0.09);
      [...chord].reverse().forEach((f, i) => this.tone('sine', f * 4, f * 4, t + i * 0.03, 0.005, 0.16, 0.025));
    } else if (kind === 'copy') {
      this.bell(chord[3] * 8, 2, t, 0.5, 0.05);
      this.bell(chord[3] * 12, 2, t + 0.08, 0.6, 0.05);
    } else {
      this.tone('square', 196, 150, t, 0.003, 0.16, 0.06);
    }
  }

  /** An arcade countdown: a beep for each number, a bright chord for the go. */
  count(n: number) {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    if (n > 0) {
      this.tone('square', 440, 440, t, 0.003, 0.16, 0.09);
      this.tone('square', 220, 220, t, 0.003, 0.12, 0.05);
      return;
    }
    [880, 1108.7, 1318.5].forEach((f, i) => this.tone('square', f, f, t + i * 0.02, 0.003, 0.4, 0.07));
  }

  blip(freq = 1400, vol = 0.04) {
    if (!this.live) return;
    this.tone('square', freq, freq * 1.5, this.ctx!.currentTime, 0.002, 0.06, vol);
  }

  whoosh() {
    if (!this.live) return;
    this.hiss('bandpass', 200, 2400, 1.2, this.ctx!.currentTime, 0.4, 0.9, 0.3);
  }

  chime() {
    if (!this.live) return;
    const t = this.ctx!.currentTime;
    [1318.5, 1567.98, 2093].forEach((f, i) => this.pluck(f, t + i * 0.07, 0.06));
  }
}

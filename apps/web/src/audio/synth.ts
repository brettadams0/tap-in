/**
 * "Bar-top percussion" (DESIGN.md §7): every sound is synthesised with Web Audio at schedule time,
 * so there are no audio files to download and per-player variants cost nothing.
 * Each recipe starts at audio-clock time `t` and returns the nodes it started, so a cue can stop.
 */
import type { GameId } from '@tap-in/shared';

export type Timbre = 'glass' | 'wood' | 'rubber';

export interface Voice {
  /** Player signature note in Hz (C-major pentatonic, DESIGN.md §7). */
  freq: number;
  timbre: Timbre;
}

export type Recipe = (ctx: AudioContext, out: AudioNode, t: number, v: Voice) => void;

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
const TIMBRES: Timbre[] = ['glass', 'wood', 'rubber'];

/** Seat index → that player's note and timbre. */
export function voiceFor(seat: number): Voice {
  const i = ((seat % 8) + 8) % 8;
  return { freq: PENTATONIC[i] ?? 523.25, timbre: TIMBRES[seat % 3] ?? 'glass' };
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: AudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

function env(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  o: {
    type?: OscillatorType;
    freq: number;
    to?: number;
    glide?: number;
    peak: number;
    attack?: number;
    decay: number;
    detune?: number;
  },
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to !== undefined)
    osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.decay));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const attack = o.attack ?? 0.004;
  osc.connect(env(ctx, out, t, o.peak, attack, o.decay));
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.05);
  return osc;
}

function burst(
  ctx: AudioContext,
  out: AudioNode,
  t: number,
  o: {
    type: BiquadFilterType;
    freq: number;
    to?: number;
    q?: number;
    peak: number;
    attack?: number;
    decay: number;
  },
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to !== undefined)
    f.frequency.exponentialRampToValueAtTime(o.to, t + (o.attack ?? 0.002) + o.decay);
  f.Q.value = o.q ?? 1;
  src.connect(f).connect(env(ctx, out, t, o.peak, o.attack ?? 0.002, o.decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + (o.attack ?? 0.002) + o.decay + 0.05);
}

/** Glass clink: FM-ish bell partials. Used for lock-in, others drinking, Countdown dings. */
export const clink: Recipe = (ctx, out, t, v) => {
  const ratios =
    v.timbre === 'wood' ? [1, 2.01] : v.timbre === 'rubber' ? [1, 1.5] : [1, 2.76, 5.4];
  ratios.forEach((r, i) => {
    tone(ctx, out, t, {
      freq: v.freq * r,
      peak: 0.22 / (i + 1),
      decay: v.timbre === 'wood' ? 0.18 : 0.5 / (i + 1),
    });
  });
};

/** Cap pop: pitch-dropping sine + click. Joins and taps. */
export const pop: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { freq: v.freq * 1.5, to: v.freq * 0.5, peak: 0.35, decay: 0.09 });
  burst(ctx, out, t, { type: 'highpass', freq: 3000, peak: 0.12, decay: 0.02 });
};

/** Wood thump: title slams, stamps, card deals. */
export const thump: Recipe = (ctx, out, t) => {
  tone(ctx, out, t, { freq: 140, to: 55, peak: 0.6, decay: 0.16 });
  burst(ctx, out, t, { type: 'lowpass', freq: 1800, to: 300, peak: 0.35, decay: 0.08 });
};

/** Stamp: a thump with a paper slap on top (lock-in "IN!"). */
export const stamp: Recipe = (ctx, out, t, v) => {
  thump(ctx, out, t, v);
  burst(ctx, out, t, { type: 'bandpass', freq: 2400, q: 0.8, peak: 0.18, decay: 0.05 });
  clink(ctx, out, t + 0.03, v);
};

/** Timer tick. */
export const tick: Recipe = (ctx, out, t) => {
  burst(ctx, out, t, { type: 'bandpass', freq: 4200, q: 6, peak: 0.25, decay: 0.03 });
  tone(ctx, out, t, { freq: 1800, peak: 0.05, decay: 0.03 });
};

/** Reaction flash crack. */
export const crack: Recipe = (ctx, out, t) => {
  burst(ctx, out, t, { type: 'highpass', freq: 1200, peak: 0.6, decay: 0.12 });
  tone(ctx, out, t, { type: 'square', freq: 1400, to: 700, peak: 0.12, decay: 0.08 });
};

/** Fake-out: a dull low "bwop", so the cue differs in sound as well as colour and word. */
export const nope: Recipe = (ctx, out, t) => {
  tone(ctx, out, t, { type: 'triangle', freq: 180, to: 120, peak: 0.3, decay: 0.18 });
};

/** Bottle spin: a whoosh that slows down. */
export const whoosh: Recipe = (ctx, out, t) => {
  for (let i = 0; i < 6; i++) {
    burst(ctx, out, t + i * (0.18 + i * 0.07), {
      type: 'bandpass',
      freq: 900 - i * 90,
      q: 2,
      peak: 0.22,
      attack: 0.05,
      decay: 0.16,
    });
  }
};

/** Bottle lands: a glass clunk. */
export const clunk: Recipe = (ctx, out, t, v) => {
  thump(ctx, out, t, v);
  clink(ctx, out, t + 0.02, { freq: 660, timbre: 'glass' });
};

/** Countdown collision buzzer. */
export const buzzer: Recipe = (ctx, out, t) => {
  tone(ctx, out, t, { type: 'sawtooth', freq: 110, peak: 0.25, decay: 0.45 });
  tone(ctx, out, t, { type: 'square', freq: 116, peak: 0.12, decay: 0.45 });
};

/** Comedy brass: detuned saws with a lip bend down and vibrato ("You drink"). */
export const horn: Recipe = (ctx, out, t, v) => {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, t);
  f.frequency.linearRampToValueAtTime(2400, t + 0.15);
  f.frequency.linearRampToValueAtTime(700, t + 0.9);
  f.connect(out);
  const base = v.freq / 4;
  for (const [i, det] of [-12, 0, 9].entries()) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.12, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.12);
    osc.frequency.setValueAtTime(base, t + 0.5);
    osc.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.95);
    osc.detune.value = det;
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 6 + i;
    depth.gain.value = 9;
    lfo.connect(depth).connect(osc.detune);
    const g = env(ctx, f, t, 0.22, 0.03, 0.95);
    osc.connect(g);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 1.05);
    lfo.stop(t + 1.05);
  }
  pop(ctx, out, t, { ...v, freq: v.freq / 2 });
};

/** Build then hit (reveal). The hit lands 0.55 s after `t`. */
export const reveal: Recipe = (ctx, out, t, v) => {
  burst(ctx, out, t, {
    type: 'bandpass',
    freq: 300,
    to: 2400,
    q: 1.5,
    peak: 0.25,
    attack: 0.5,
    decay: 0.05,
  });
  thump(ctx, out, t + 0.55, v);
  burst(ctx, out, t + 0.55, { type: 'highpass', freq: 5000, peak: 0.2, decay: 0.35 });
};

/** Big group sting: every player's note stacked, then a crash. */
export function everyone(ctx: AudioContext, out: AudioNode, t: number, voices: Voice[]): void {
  voices.forEach((v, i) => {
    tone(ctx, out, t + i * 0.04, {
      type: 'triangle',
      freq: v.freq / 2,
      peak: 0.16,
      attack: 0.02,
      decay: 1.1,
    });
  });
  thump(ctx, out, t, voices[0] ?? voiceFor(0));
  burst(ctx, out, t + 0.05, { type: 'highpass', freq: 3500, peak: 0.35, decay: 0.9 });
}

/** Soft "ahh" chord (nobody drinks). */
export const ahh: Recipe = (ctx, out, t) => {
  for (const f of [261.63, 329.63, 392]) {
    tone(ctx, out, t, { type: 'triangle', freq: f, peak: 0.09, attack: 0.15, decay: 0.9 });
  }
};

/** Short cheer: a bright arpeggio over a noise swell. */
export const cheer: Recipe = (ctx, out, t) => {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(ctx, out, t + i * 0.08, { type: 'square', freq: f, peak: 0.07, decay: 0.3 });
  });
  burst(ctx, out, t, { type: 'bandpass', freq: 1400, q: 0.6, peak: 0.2, attack: 0.15, decay: 0.8 });
};

/** Intro: "TAP" slam, "IN" slam, foam burst. */
export const intro: Recipe = (ctx, out, t, v) => {
  thump(ctx, out, t, v);
  thump(ctx, out, t + 0.35, v);
  burst(ctx, out, t + 0.6, { type: 'highpass', freq: 2500, to: 8000, peak: 0.25, decay: 0.5 });
  cheer(ctx, out, t + 0.6, v);
};

/** Per-game title stings (DESIGN.md §7): one second each, built from the game's family. */
export function sting(game: GameId): Recipe {
  return (ctx, out, t, v) => {
    switch (game) {
      case 'wouldYouRather':
        // two coasters clack together
        thump(ctx, out, t, v);
        thump(ctx, out, t + 0.18, v);
        clink(ctx, out, t + 0.2, { freq: 880, timbre: 'wood' });
        return;
      case 'reactionShotgun':
        crack(ctx, out, t, v);
        tone(ctx, out, t + 0.1, { type: 'square', freq: 220, to: 880, peak: 0.08, decay: 0.3 });
        return;
      case 'liarsPrompt':
        // a sly two-step slide down: "suuure"
        tone(ctx, out, t, {
          type: 'triangle',
          freq: 523,
          to: 392,
          glide: 0.25,
          peak: 0.2,
          decay: 0.3,
        });
        tone(ctx, out, t + 0.32, {
          type: 'triangle',
          freq: 440,
          to: 294,
          glide: 0.4,
          peak: 0.2,
          decay: 0.5,
        });
        return;
      case 'secretWord':
        // "shhh", then a soft bell
        burst(ctx, out, t, { type: 'highpass', freq: 3500, peak: 0.22, attack: 0.08, decay: 0.45 });
        clink(ctx, out, t + 0.5, { freq: 1046.5, timbre: 'glass' });
        return;
      case 'twoTruths':
        // three cards flicked onto the bar, the last one a little off
        [0, 0.13, 0.26].forEach((d, i) => {
          burst(ctx, out, t + d, {
            type: 'bandpass',
            freq: 2000 + i * 400,
            q: 1.2,
            peak: 0.25,
            decay: 0.05,
          });
        });
        tone(ctx, out, t + 0.3, { type: 'square', freq: 330, to: 311, peak: 0.08, decay: 0.25 });
        return;
      case 'fakeAnswer':
        // a con-artist whistle: up, then down
        tone(ctx, out, t, { freq: 988, to: 1568, glide: 0.18, peak: 0.12, decay: 0.2 });
        tone(ctx, out, t + 0.24, { freq: 1568, to: 784, glide: 0.3, peak: 0.12, decay: 0.35 });
        return;
      case 'rankIt':
        // four ascending clinks, one per item
        [0, 0.1, 0.2, 0.3].forEach((d, i) => {
          clink(ctx, out, t + d, { freq: 660 * 1.25 ** i, timbre: 'glass' });
        });
        return;
      case 'tapRace':
        // a drumroll of taps that speeds up
        for (let i = 0; i < 8; i++) {
          burst(ctx, out, t + i * (0.11 - i * 0.008), {
            type: 'bandpass',
            freq: 3000,
            q: 4,
            peak: 0.25,
            decay: 0.03,
          });
        }
        return;
      case 'spinTheBottle':
        whoosh(ctx, out, t, v);
        clunk(ctx, out, t + 0.75, v);
        return;
      case 'fillInTheBlank':
        // a pen click and a scribble
        burst(ctx, out, t, { type: 'highpass', freq: 4000, peak: 0.3, decay: 0.02 });
        burst(ctx, out, t + 0.12, {
          type: 'bandpass',
          freq: 1800,
          to: 2600,
          q: 3,
          peak: 0.18,
          attack: 0.04,
          decay: 0.4,
        });
        return;
      case 'countdown':
        [0, 0.22, 0.44].forEach((d, i) => {
          clink(ctx, out, t + d, { freq: 523.25 * (i + 1), timbre: 'wood' });
        });
        return;
      default:
        thump(ctx, out, t, v);
        clink(ctx, out, t + 0.1, v);
    }
  };
}

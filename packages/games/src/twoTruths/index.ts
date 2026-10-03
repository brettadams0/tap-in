/**
 * Two Truths, One App (SPEC §4, DECISIONS R9, R15).
 *
 * Round 1 opens with `setup`: everyone privately types two true facts and sees the fake the app
 * will add for them, with up to 2 rerolls in case it's actually true. Then each round puts one
 * player in the spotlight (`guess`): their three facts, shuffled, on every phone. Everyone else
 * picks the fake. Wrong guessers drink; if nobody is fooled, the spotlight player drinks.
 *
 * Only players who typed their facts get a spotlight, so a block can end early (plannedRounds).
 * Typed facts live only in this game's state, which the next game replaces.
 */
import type { PlayerId, TruthsStep } from '@tap-in/shared';
import { z } from 'zod';
import { fakeFactBank, pickEntry } from '../content.js';
import { cleanText, sameAnswer } from '../kit/text.js';
import { idle } from '../kit/votes.js';
import type { Drinker, GameCtx, GameModule } from '../types.js';

export const TRUTHS_SETUP_MS = 45_000;
export const TRUTHS_GUESS_MS = 20_000;
export const TRUTHS_MAX_CHARS = 60;
export const TRUTHS_REROLLS = 2;
/** Spotlights on a Short session or with 7+ players (R15). */
const SPOTLIGHT_CAP = 3;

interface Offer {
  id: string;
  text: string;
  rerolls: number;
}

export interface TruthsState {
  round: number;
  step: TruthsStep | 'done';
  endsAt: number | null;
  players: PlayerId[];
  /** The fake the app will add for each player (private to them). */
  offers: Record<PlayerId, Offer>;
  /** Each player's two typed truths. */
  truths: Record<PlayerId, string[]>;
  /** Spotlight order, fixed when setup ends. Null during setup. */
  order: PlayerId[] | null;
  cursor: number;
  spotlight: PlayerId | null;
  cards: string[] | null;
  fakeIndex: number;
  guesses: Record<PlayerId, number>;
}

function rounds(n: number, length: string): number {
  return length === 'short' || n > 6 ? Math.min(n, SPOTLIGHT_CAP) : n;
}

/** Deal the next spotlight still in the game, or end the round empty-handed. */
function nextSpotlight(s: TruthsState, ctx: GameCtx): TruthsState {
  const order = s.order ?? [];
  let cursor = s.cursor;
  while (cursor < order.length && !ctx.players.includes(order[cursor] ?? '')) cursor++;
  const spotlight = order[cursor];
  const truths = spotlight === undefined ? undefined : s.truths[spotlight];
  const offer = spotlight === undefined ? undefined : s.offers[spotlight];
  if (spotlight === undefined || !truths || !offer) {
    return { ...s, cursor, step: 'done', endsAt: null, spotlight: null, cards: null };
  }
  const fakeIndex = ctx.rng.int(3);
  const cards = [...truths];
  cards.splice(fakeIndex, 0, offer.text);
  return {
    ...s,
    cursor: cursor + 1,
    step: 'guess',
    endsAt: ctx.now + ctx.ms(TRUTHS_GUESS_MS),
    spotlight,
    cards,
    fakeIndex,
    guesses: {},
  };
}

export const twoTruths: GameModule<'twoTruths', TruthsState> = {
  id: 'twoTruths',
  inputSchema: z.union([
    z.strictObject({ truths: z.array(z.string().max(200)).length(2) }),
    z.strictObject({ reroll: z.literal(true) }),
    z.strictObject({ guess: z.number().int().min(0).max(2) }),
  ]),
  rounds,
  revealMs: (n) => 3400 + n * 250,
  estimateMs: (n, length) =>
    6000 + TRUTHS_SETUP_MS * 0.8 + rounds(n, length) * (TRUTHS_GUESS_MS * 0.6 + 3400 + 5000),

  init: () => ({
    round: 0,
    step: 'done',
    endsAt: null,
    players: [],
    offers: {},
    truths: {},
    order: null,
    cursor: 0,
    spotlight: null,
    cards: null,
    fakeIndex: 0,
    guesses: {},
  }),

  startRound(s, ctx) {
    if (s.round === 0) {
      const offers: Record<PlayerId, Offer> = {};
      for (const p of ctx.players) {
        const e = pickEntry(fakeFactBank, ctx.spice, ctx.used, ctx.rng);
        offers[p] = { id: e.id, text: e.fact, rerolls: 0 };
      }
      return {
        ...s,
        round: 1,
        step: 'setup',
        endsAt: ctx.now + ctx.ms(TRUTHS_SETUP_MS),
        players: [...ctx.players],
        offers,
      };
    }
    return nextSpotlight({ ...s, round: s.round + 1, players: [...ctx.players] }, ctx);
  },

  onInput(s, playerId, input, ctx) {
    if (!s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.step === 'setup' && 'reroll' in input) {
      const offer = s.offers[playerId];
      if (!offer || s.truths[playerId]) return { reject: 'Already locked in.' };
      if (offer.rerolls >= TRUTHS_REROLLS) return { reject: 'No rerolls left.' };
      const e = pickEntry(fakeFactBank, ctx.spice, ctx.used, ctx.rng);
      const next = { id: e.id, text: e.fact, rerolls: offer.rerolls + 1 };
      return { ...s, offers: { ...s.offers, [playerId]: next } };
    }
    if (s.step === 'setup' && 'truths' in input) {
      if (s.truths[playerId]) return { reject: 'Already locked in.' };
      const cleaned: string[] = [];
      for (const raw of input.truths) {
        const c = cleanText(raw, ctx.spice, TRUTHS_MAX_CHARS);
        if (!c.ok) return { reject: c.reason };
        cleaned.push(c.text);
      }
      if (sameAnswer(cleaned[0] ?? '', cleaned[1] ?? '')) {
        return { reject: 'Two different facts, please.' };
      }
      return { ...s, truths: { ...s.truths, [playerId]: cleaned } };
    }
    if (s.step === 'guess' && 'guess' in input) {
      if (playerId === s.spotlight) return { reject: "It's your round. Enjoy the show." };
      if (s.guesses[playerId] !== undefined) return { reject: 'Already locked in.' };
      return { ...s, guesses: { ...s.guesses, [playerId]: input.guess } };
    }
    return { reject: 'Not now.' };
  },

  onTimer(s, ctx) {
    if (s.step === 'setup') {
      const ready = s.players.filter((p) => s.truths[p]);
      return nextSpotlight({ ...s, order: ctx.rng.shuffle(ready), cursor: 0 }, ctx);
    }
    return { ...s, step: 'done', endsAt: null };
  },

  plannedRounds: (s) => (s.order === null ? null : Math.max(1, s.order.length)),

  step: (s) => s.step,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => {
    if (s.step === 'setup') return s.players.filter((p) => !s.truths[p]);
    if (s.step === 'guess') {
      return s.players.filter((p) => p !== s.spotlight && s.guesses[p] === undefined);
    }
    return [];
  },
  endsEarly: () => true,

  result(s, ctx) {
    const spotlight = s.spotlight;
    const cards = s.cards ?? [];
    const guessers = s.players.filter((p) => p !== spotlight);
    const fooled = guessers.filter(
      (p) => s.guesses[p] !== undefined && s.guesses[p] !== s.fakeIndex,
    );
    const sharp = guessers.filter((p) => s.guesses[p] === s.fakeIndex);
    const noVote = idle(guessers, (p) => s.guesses[p] !== undefined, ctx.connected);
    const reveal = {
      spotlight,
      cards,
      fakeIndex: s.fakeIndex,
      guesses: { ...s.guesses },
      fooled,
    };
    if (spotlight === null) {
      return {
        reveal,
        assigned: [],
        selfInflicted: [],
        everyone: false,
        ranking: [],
        nobody: null,
      };
    }
    const assigned: Drinker[] = fooled.map((id) => ({ id, reason: 'fooled' }));
    if (fooled.length === 0 && sharp.length > 0) {
      assigned.push({ id: spotlight, reason: 'nobodyFooled' });
    }
    assigned.push(...noVote.map((id): Drinker => ({ id, reason: 'noVote' })));
    return {
      reveal,
      assigned,
      selfInflicted: [],
      everyone: false,
      ranking: [...noVote, ...fooled, ...(fooled.length === 0 ? [spotlight] : []), ...sharp],
      nobody: null,
      stats: fooled.length > 0 ? { [spotlight]: { liarPoints: fooled.length } } : {},
    };
  },

  publicView: (s) => ({
    spotlight: s.step === 'setup' ? null : s.spotlight,
    cards: s.step === 'setup' || !s.cards ? null : [...s.cards],
  }),
  privateView: (s, playerId) => {
    const offer = s.offers[playerId];
    return {
      setup:
        s.step === 'setup' && offer
          ? {
              fake: offer.text,
              rerollsLeft: TRUTHS_REROLLS - offer.rerolls,
              truths: s.truths[playerId] ? [...(s.truths[playerId] ?? [])] : null,
            }
          : null,
      guess: s.guesses[playerId] ?? null,
    };
  },
  shift: (s, delta) => ({ ...s, endsAt: s.endsAt === null ? null : s.endsAt + delta }),
};

/**
 * Secret Word (SPEC §5, DECISIONS R4, R11).
 *
 * Steps: `hint` (in turn order, one player at a time types a one-word hint: 15 s each, ends on
 * submit; the outsider is never first) → `vote` (find the outsider) → `guess` (only if caught:
 * the outsider gets one guess at the word). Caught and guessed right, or never caught: everyone
 * except the outsider drinks. Caught and guessed wrong: the outsider drinks.
 *
 * Hints that give the word away are blocked, but only for players who know it: blocking the
 * outsider's hint would tell them the word.
 */
import type { NamedText, PlayerId, SecretStep } from '@tap-in/shared';
import { z } from 'zod';
import { pickEntry, secretBank } from '../content.js';
import { cleanText, givesAway, guessMatches, isOneWord } from '../kit/text.js';
import { idle, isCaught, validSuspect } from '../kit/votes.js';
import type { Drinker, GameCtx, GameModule } from '../types.js';

const ROUNDS = 3;
export const SECRET_HINT_MS = 15_000;
export const SECRET_VOTE_MS = 25_000;
export const SECRET_GUESS_MS = 20_000;
export const SECRET_HINT_MAX = 20;
export const SECRET_GUESS_MAX = 30;

export interface SecretState {
  round: number;
  step: SecretStep | 'done';
  endsAt: number | null;
  players: PlayerId[];
  entry: { id: string; word: string; category: string } | null;
  outsider: PlayerId | null;
  order: PlayerId[];
  turn: number;
  hints: NamedText[];
  votes: Record<PlayerId, PlayerId>;
  caught: boolean;
  guess: string | null;
}

const id = z.string().min(1).max(64);

/** Turn order: shuffled, with the outsider moved off the first slot. */
export function turnOrder(players: readonly PlayerId[], outsider: PlayerId, rand: number[]) {
  const order = [...players];
  if (order[0] === outsider && order.length > 1) {
    const swap = 1 + Math.floor((rand[0] ?? 0) * (order.length - 1));
    order[0] = order[swap] as PlayerId;
    order[swap] = outsider;
  }
  return order;
}

function nextTurn(s: SecretState, ctx: GameCtx): SecretState {
  const turn = s.turn + 1;
  if (turn < s.order.length) return { ...s, turn, endsAt: ctx.now + ctx.ms(SECRET_HINT_MS) };
  return { ...s, turn, step: 'vote', endsAt: ctx.now + ctx.ms(SECRET_VOTE_MS) };
}

export const secretWord: GameModule<'secretWord', SecretState> = {
  id: 'secretWord',
  inputSchema: z.union([
    z.strictObject({ hint: z.string().max(200) }),
    z.strictObject({ vote: id }),
    z.strictObject({ guess: z.string().max(200) }),
  ]),
  rounds: () => ROUNDS,
  revealMs: (n) => 4200 + n * 300,
  estimateMs: (n) =>
    6000 +
    ROUNDS *
      (n * SECRET_HINT_MS * 0.6 +
        SECRET_VOTE_MS * 0.6 +
        SECRET_GUESS_MS * 0.3 +
        4200 +
        n * 300 +
        5000),

  init: () => ({
    round: 0,
    step: 'done',
    endsAt: null,
    players: [],
    entry: null,
    outsider: null,
    order: [],
    turn: 0,
    hints: [],
    votes: {},
    caught: false,
    guess: null,
  }),

  startRound(s, ctx) {
    const entry = pickEntry(secretBank, ctx);
    const outsider = ctx.rng.pick(ctx.players);
    const order = turnOrder(ctx.rng.shuffle(ctx.players), outsider, [ctx.rng.next()]);
    return {
      ...secretWord.init(ctx),
      round: s.round + 1,
      step: 'hint',
      endsAt: ctx.now + ctx.ms(SECRET_HINT_MS),
      players: [...ctx.players],
      entry: { id: entry.id, word: entry.word, category: entry.category },
      outsider,
      order,
    };
  },

  onInput(s, playerId, input, ctx) {
    if (!s.players.includes(playerId)) return { reject: 'Not now.' };
    const word = s.entry?.word ?? '';
    if (s.step === 'hint' && 'hint' in input) {
      if (s.order[s.turn] !== playerId) return { reject: "It's not your turn yet." };
      const cleaned = cleanText(input.hint, ctx.spice, SECRET_HINT_MAX);
      if (!cleaned.ok) return { reject: cleaned.reason };
      if (!isOneWord(cleaned.text)) return { reject: 'One word only.' };
      if (playerId !== s.outsider && givesAway(cleaned.text, word)) {
        return { reject: 'Too close to the word! Try another.' };
      }
      const hints = [...s.hints, { id: playerId, text: cleaned.text }];
      return nextTurn({ ...s, hints }, ctx);
    }
    if (s.step === 'vote' && 'vote' in input) {
      if (s.votes[playerId] !== undefined) return { reject: 'Already voted.' };
      if (!validSuspect(s.players, playerId, input.vote)) return { reject: 'Pick someone else.' };
      return { ...s, votes: { ...s.votes, [playerId]: input.vote } };
    }
    if (s.step === 'guess' && 'guess' in input) {
      if (playerId !== s.outsider) return { reject: 'Only the outsider guesses.' };
      const cleaned = cleanText(input.guess, ctx.spice, SECRET_GUESS_MAX);
      if (!cleaned.ok) return { reject: cleaned.reason };
      return { ...s, guess: cleaned.text, step: 'done', endsAt: null };
    }
    return { reject: 'Not now.' };
  },

  onTimer(s, ctx) {
    switch (s.step) {
      case 'hint': {
        const missed = s.order[s.turn];
        const hints = missed === undefined ? s.hints : [...s.hints, { id: missed, text: null }];
        return nextTurn({ ...s, hints }, ctx);
      }
      case 'vote': {
        const caught = isCaught(s.votes, s.players, s.outsider ?? '');
        return caught
          ? { ...s, caught, step: 'guess', endsAt: ctx.now + ctx.ms(SECRET_GUESS_MS) }
          : { ...s, caught, step: 'done', endsAt: null };
      }
      default:
        return { ...s, step: 'done', endsAt: null };
    }
  },

  step: (s) => s.step,
  prompt: (s) =>
    s.step === 'hint' && s.entry ? { bankId: 'secretWord', promptId: s.entry.id } : null,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => {
    const current = s.order[s.turn];
    if (s.step === 'hint') return current === undefined ? [] : [current];
    if (s.step === 'vote') return s.players.filter((p) => s.votes[p] === undefined);
    if (s.step === 'guess' && s.outsider !== null) return [s.outsider];
    return [];
  },
  endsEarly: () => true,

  result(s, ctx) {
    const outsider = s.outsider ?? '';
    const word = s.entry?.word ?? '';
    const guessedRight = s.caught && s.guess !== null && guessMatches(s.guess, word);
    const reveal = {
      outsider,
      word,
      votes: { ...s.votes },
      caught: s.caught,
      guess: s.guess,
      guessedRight,
    };
    if (!s.caught || guessedRight) {
      return {
        reveal,
        assigned: [],
        selfInflicted: [],
        everyone: true,
        spared: { ids: [outsider], why: s.caught ? 'outsiderGuessed' : 'outsiderEscaped' },
        ranking: [],
        nobody: null,
        stats: { [outsider]: { liarPoints: 1 } },
      };
    }
    const noVote = idle(s.players, (p) => s.votes[p] !== undefined, ctx.connected).filter(
      (p) => p !== outsider,
    );
    const wrong = s.players.filter(
      (p) => p !== outsider && s.votes[p] !== undefined && s.votes[p] !== outsider,
    );
    const right = s.players.filter((p) => p !== outsider && s.votes[p] === outsider);
    return {
      reveal,
      assigned: [
        { id: outsider, reason: s.guess === null ? 'caught' : 'wrongGuess' },
        ...noVote.map((p): Drinker => ({ id: p, reason: 'noVote' })),
      ],
      selfInflicted: [],
      everyone: false,
      ranking: [...noVote, ...wrong, ...right],
      nobody: null,
    };
  },

  publicView: (s) => ({
    category: s.entry?.category ?? '',
    order: [...s.order],
    turn: s.turn,
    hints: s.hints.map((h) => ({ ...h })),
    caught: s.step === 'guess' ? s.outsider : null,
  }),
  privateView: (s, playerId) => {
    const outsider = playerId === s.outsider;
    return {
      word: outsider || !s.entry ? null : s.entry.word,
      outsider,
      vote: s.votes[playerId] ?? null,
      guess: outsider ? s.guess : null,
    };
  },
  shift: (s, delta) => ({ ...s, endsAt: s.endsAt === null ? null : s.endsAt + delta }),
};

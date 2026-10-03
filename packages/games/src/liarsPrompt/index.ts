/**
 * Liar's Prompt (SPEC §3, DECISIONS R11).
 *
 * Steps: `answer` (everyone types an answer to their question; one random imposter got a
 * slightly different one, and nobody is told) → `show` (answers land one by one, in sync) →
 * `vote` (everyone sees the real question and votes for the imposter, never themselves).
 * Caught = more than half of the votes cast: the imposter drinks. Otherwise everyone except
 * the imposter drinks. The imposter and their question live only in state until the reveal.
 */
import type { LiarStep, PlayerId } from '@tap-in/shared';
import { z } from 'zod';
import { liarBank, pickEntry } from '../content.js';
import { cleanText } from '../kit/text.js';
import { idle, isCaught, validSuspect } from '../kit/votes.js';
import type { Drinker, GameModule } from '../types.js';

const ROUNDS = 3;
export const LIAR_ANSWER_MS = 30_000;
export const LIAR_VOTE_MS = 25_000;
/** Gap between answers landing in the show step, and the hold after the last one. */
export const LIAR_SHOW_EACH_MS = 1400;
const SHOW_HOLD_MS = 1800;
export const LIAR_MAX_CHARS = 30;

export interface LiarState {
  round: number;
  step: LiarStep | 'done';
  endsAt: number | null;
  players: PlayerId[];
  prompt: { id: string; main: string; imposter: string } | null;
  imposter: PlayerId | null;
  answers: Record<PlayerId, string>;
  /** Reveal order of the answers (shuffled, so the imposter's slot gives nothing away). */
  order: PlayerId[];
  showAt: number | null;
  showEach: number;
  votes: Record<PlayerId, PlayerId>;
}

const id = z.string().min(1).max(64);

export const liarsPrompt: GameModule<'liarsPrompt', LiarState> = {
  id: 'liarsPrompt',
  inputSchema: z.union([
    z.strictObject({ answer: z.string().max(200) }),
    z.strictObject({ vote: id }),
  ]),
  rounds: () => ROUNDS,
  revealMs: (n) => 3600 + n * 300,
  estimateMs: (n) =>
    6000 +
    ROUNDS *
      (LIAR_ANSWER_MS * 0.7 +
        n * LIAR_SHOW_EACH_MS +
        SHOW_HOLD_MS +
        LIAR_VOTE_MS * 0.6 +
        3600 +
        n * 300 +
        5000),

  init: () => ({
    round: 0,
    step: 'done',
    endsAt: null,
    players: [],
    prompt: null,
    imposter: null,
    answers: {},
    order: [],
    showAt: null,
    showEach: LIAR_SHOW_EACH_MS,
    votes: {},
  }),

  startRound(s, ctx) {
    const entry = pickEntry(liarBank, ctx.spice, ctx.used, ctx.rng);
    return {
      ...liarsPrompt.init(ctx),
      round: s.round + 1,
      step: 'answer',
      endsAt: ctx.now + ctx.ms(LIAR_ANSWER_MS),
      players: [...ctx.players],
      prompt: { id: entry.id, main: entry.main, imposter: entry.imposter },
      imposter: ctx.rng.pick(ctx.players),
    };
  },

  onInput(s, playerId, input, ctx) {
    if (!s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.step === 'answer' && 'answer' in input) {
      if (s.answers[playerId] !== undefined) return { reject: 'Already locked in.' };
      const cleaned = cleanText(input.answer, ctx.spice, LIAR_MAX_CHARS);
      if (!cleaned.ok) return { reject: cleaned.reason };
      return { ...s, answers: { ...s.answers, [playerId]: cleaned.text } };
    }
    if (s.step === 'vote' && 'vote' in input) {
      if (s.votes[playerId] !== undefined) return { reject: 'Already voted.' };
      if (!validSuspect(s.players, playerId, input.vote)) return { reject: 'Pick someone else.' };
      return { ...s, votes: { ...s.votes, [playerId]: input.vote } };
    }
    return { reject: 'Not now.' };
  },

  onTimer(s, ctx) {
    switch (s.step) {
      case 'answer': {
        const showEach = ctx.ms(LIAR_SHOW_EACH_MS);
        const showAt = ctx.now + ctx.lead;
        return {
          ...s,
          step: 'show',
          order: ctx.rng.shuffle(s.players),
          showAt,
          showEach,
          endsAt: showAt + showEach * (s.players.length - 1) + ctx.ms(SHOW_HOLD_MS),
        };
      }
      case 'show':
        return { ...s, step: 'vote', endsAt: ctx.now + ctx.ms(LIAR_VOTE_MS) };
      default:
        return { ...s, step: 'done', endsAt: null };
    }
  },

  step: (s) => s.step,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => {
    if (s.step === 'answer') return s.players.filter((p) => s.answers[p] === undefined);
    if (s.step === 'vote') return s.players.filter((p) => s.votes[p] === undefined);
    return [];
  },
  // The show step is a fixed-length synced moment; every other step ends once everyone acted.
  endsEarly: (s) => s.step !== 'show',

  result(s, ctx) {
    const imposter = s.imposter ?? '';
    const caught = isCaught(s.votes, s.players, imposter);
    const noVote = idle(s.players, (p) => s.votes[p] !== undefined, ctx.connected).filter(
      (p) => p !== imposter,
    );
    const right = s.players.filter((p) => s.votes[p] === imposter);
    const wrong = s.players.filter(
      (p) => p !== imposter && s.votes[p] !== undefined && s.votes[p] !== imposter,
    );
    const reveal = {
      imposter,
      question: s.prompt?.main ?? '',
      imposterQuestion: s.prompt?.imposter ?? '',
      votes: { ...s.votes },
      caught,
    };
    if (!caught) {
      return {
        reveal,
        assigned: [],
        selfInflicted: [],
        everyone: true,
        spared: { ids: [imposter], why: 'imposterEscaped' },
        ranking: [],
        nobody: null,
        stats: { [imposter]: { liarPoints: 1 } },
      };
    }
    const assigned: Drinker[] = [
      { id: imposter, reason: 'caught' },
      ...noVote.map((p): Drinker => ({ id: p, reason: 'noVote' })),
    ];
    return {
      reveal,
      assigned,
      selfInflicted: [],
      everyone: false,
      ranking: [...noVote, ...wrong, ...right.filter((p) => p !== imposter)],
      nobody: null,
    };
  },

  publicView: (s) => {
    const shown = s.showAt !== null;
    return {
      answers: shown ? s.order.map((p) => ({ id: p, text: s.answers[p] ?? null })) : null,
      showAt: shown ? s.showAt : null,
      showEach: s.showEach,
      question: s.step === 'vote' || s.step === 'done' ? (s.prompt?.main ?? null) : null,
    };
  },
  privateView: (s, playerId) => ({
    question: s.prompt ? (playerId === s.imposter ? s.prompt.imposter : s.prompt.main) : null,
    answer: s.answers[playerId] ?? null,
    vote: s.votes[playerId] ?? null,
  }),
  shift: (s, delta) => ({
    ...s,
    endsAt: s.endsAt === null ? null : s.endsAt + delta,
    showAt: s.showAt === null ? null : s.showAt + delta,
  }),
};

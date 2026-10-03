/**
 * Fill in the Blank (SPEC §10).
 *
 * Steps: `write` (everyone fills the blank, 60 characters max) → `vote` (the answers, anonymous
 * and shuffled; pick your favourite, never your own). Authors are revealed with their votes.
 * The fewest votes drinks (ties all drink); the top answer gets the crowd cheer. Identical
 * answers merge and share their votes. Connected players who never write or vote drink (R5).
 */
import type { BlankStep, PlayerId } from '@tap-in/shared';
import { z } from 'zod';
import { blankBank, pickEntry } from '../content.js';
import { mergeFakes } from '../fakeAnswer/index.js';
import { cleanText } from '../kit/text.js';
import { idle } from '../kit/votes.js';
import type { Drinker, GameModule } from '../types.js';

const ROUNDS = 3;
export const BLANK_WRITE_MS = 40_000;
export const BLANK_VOTE_MS = 20_000;
export const BLANK_MAX_CHARS = 60;

export interface BlankState {
  round: number;
  step: BlankStep | 'done';
  endsAt: number | null;
  players: PlayerId[];
  entry: { id: string; prompt: string } | null;
  answers: Record<PlayerId, string>;
  options: string[];
  authors: PlayerId[][];
  votes: Record<PlayerId, number>;
}

export const fillInTheBlank: GameModule<'fillInTheBlank', BlankState> = {
  id: 'fillInTheBlank',
  inputSchema: z.union([
    z.strictObject({ answer: z.string().max(300) }),
    z.strictObject({ vote: z.number().int().min(0).max(16) }),
  ]),
  rounds: () => ROUNDS,
  revealMs: (n) => 3800 + n * 350,
  estimateMs: (n) =>
    6000 + ROUNDS * (BLANK_WRITE_MS * 0.7 + BLANK_VOTE_MS * 0.6 + 3800 + n * 350 + 5000),

  init: () => ({
    round: 0,
    step: 'done',
    endsAt: null,
    players: [],
    entry: null,
    answers: {},
    options: [],
    authors: [],
    votes: {},
  }),

  startRound(s, ctx) {
    const e = pickEntry(blankBank, ctx);
    return {
      ...fillInTheBlank.init(ctx),
      round: s.round + 1,
      step: 'write',
      endsAt: ctx.now + ctx.ms(BLANK_WRITE_MS),
      players: [...ctx.players],
      entry: { id: e.id, prompt: e.prompt },
    };
  },

  onInput(s, playerId, input, ctx) {
    if (!s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.step === 'write' && 'answer' in input) {
      if (s.answers[playerId] !== undefined) return { reject: 'Already locked in.' };
      const cleaned = cleanText(input.answer, ctx.spice, BLANK_MAX_CHARS);
      if (!cleaned.ok) return { reject: cleaned.reason };
      return { ...s, answers: { ...s.answers, [playerId]: cleaned.text } };
    }
    if (s.step === 'vote' && 'vote' in input) {
      if (s.votes[playerId] !== undefined) return { reject: 'Already voted.' };
      if (input.vote >= s.options.length) return { reject: 'Pick one of the answers.' };
      if (s.authors[input.vote]?.includes(playerId)) {
        return { reject: "That's yours! Pick another." };
      }
      return { ...s, votes: { ...s.votes, [playerId]: input.vote } };
    }
    return { reject: 'Not now.' };
  },

  onTimer(s, ctx) {
    if (s.step !== 'write') return { ...s, step: 'done', endsAt: null };
    const groups = ctx.rng.shuffle(mergeFakes(s.players, s.answers));
    // Fewer than two answers: nothing to choose between.
    if (groups.length < 2) {
      return {
        ...s,
        step: 'done',
        endsAt: null,
        options: groups.map((g) => g.text),
        authors: groups.map((g) => g.authors),
      };
    }
    return {
      ...s,
      step: 'vote',
      endsAt: ctx.now + ctx.ms(BLANK_VOTE_MS),
      options: groups.map((g) => g.text),
      authors: groups.map((g) => g.authors),
    };
  },

  step: (s) => s.step,
  prompt: (s) =>
    s.step === 'write' && s.entry ? { bankId: 'fillInTheBlank', promptId: s.entry.id } : null,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => {
    if (s.step === 'write') return s.players.filter((p) => s.answers[p] === undefined);
    if (s.step === 'vote') return s.players.filter((p) => s.votes[p] === undefined);
    return [];
  },
  endsEarly: () => true,

  result(s, ctx) {
    const counts = s.options.map((_, i) => s.players.filter((p) => s.votes[p] === i).length);
    const writers = s.players.filter((p) => s.answers[p] !== undefined);
    const votesFor = (p: PlayerId) => counts[s.authors.findIndex((a) => a.includes(p))] ?? 0;
    const noAnswer = idle(s.players, (p) => s.answers[p] !== undefined, ctx.connected);
    const voted = s.options.length >= 2;
    const noVote = voted ? idle(s.players, (p) => s.votes[p] !== undefined, ctx.connected) : [];
    const most = Math.max(0, ...counts);
    const fewest = Math.min(...writers.map(votesFor));
    const assigned: Drinker[] = noAnswer.map((id) => ({ id, reason: 'noAnswer' }));
    if (voted) {
      for (const p of writers)
        if (votesFor(p) === fewest) assigned.push({ id: p, reason: 'fewestVotes' });
      for (const p of noVote) {
        if (!assigned.some((d) => d.id === p)) assigned.push({ id: p, reason: 'noVote' });
      }
    }
    return {
      reveal: {
        options: [...s.options],
        authors: s.authors.map((a) => [...a]),
        votes: { ...s.votes },
        top: most > 0 ? counts.flatMap((c, i) => (c === most ? [i] : [])) : [],
      },
      assigned,
      selfInflicted: [],
      everyone: false,
      ranking: [...noAnswer, ...[...writers].sort((a, b) => votesFor(a) - votesFor(b))],
      nobody: null,
    };
  },

  publicView: (s) => ({
    prompt: s.entry?.prompt ?? '',
    options:
      s.step === 'vote' || (s.step === 'done' && s.options.length > 0) ? [...s.options] : null,
  }),
  privateView: (s, playerId) => ({
    answer: s.answers[playerId] ?? null,
    vote: s.votes[playerId] ?? null,
    mine: s.authors.flatMap((a, i) => (a.includes(playerId) ? [i] : [])),
  }),
  shift: (s, delta) => ({ ...s, endsAt: s.endsAt === null ? null : s.endsAt + delta }),
};

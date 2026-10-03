/**
 * Fake Answer (SPEC §6, DECISIONS R12).
 *
 * Steps: `write` (everyone writes a believable fake answer to an obscure trivia question; one too
 * close to the real answer is rejected with "Too close, try again.") → `vote` (every fake plus
 * the real answer, shuffled; pick what you think is real, never your own). Anyone who picks a
 * fake drinks. Identical fakes are merged into one card and share the credit. The fake that
 * fooled the most people earns its author(s) Master Liar.
 *
 * The real answer lives only in state: the options never say which one it is until the reveal.
 */
import type { FakeStep, PlayerId } from '@tap-in/shared';
import { z } from 'zod';
import { pickEntry, triviaBank } from '../content.js';
import { cleanText, sameAnswer, tooClose } from '../kit/text.js';
import { idle } from '../kit/votes.js';
import type { Drinker, GameModule } from '../types.js';

const ROUNDS = 3;
export const FAKE_WRITE_MS = 40_000;
export const FAKE_VOTE_MS = 25_000;
export const FAKE_MAX_CHARS = 40;
export const TOO_CLOSE_MSG = 'Too close, try again.';

export interface FakeState {
  round: number;
  step: FakeStep | 'done';
  endsAt: number | null;
  players: PlayerId[];
  entry: { id: string; question: string; answer: string } | null;
  fakes: Record<PlayerId, string>;
  /** Merged fakes plus the real answer, shuffled. Empty until voting. */
  options: string[];
  authors: PlayerId[][];
  realIndex: number;
  votes: Record<PlayerId, number>;
}

/** Merge identical fakes (seat order decides whose spelling shows). */
export function mergeFakes(
  players: readonly PlayerId[],
  fakes: Readonly<Record<PlayerId, string>>,
): { text: string; authors: PlayerId[] }[] {
  const groups: { text: string; authors: PlayerId[] }[] = [];
  for (const p of players) {
    const text = fakes[p];
    if (text === undefined) continue;
    const group = groups.find((g) => sameAnswer(g.text, text));
    if (group) group.authors.push(p);
    else groups.push({ text, authors: [p] });
  }
  return groups;
}

export const fakeAnswer: GameModule<'fakeAnswer', FakeState> = {
  id: 'fakeAnswer',
  inputSchema: z.union([
    z.strictObject({ fake: z.string().max(200) }),
    z.strictObject({ vote: z.number().int().min(0).max(16) }),
  ]),
  rounds: () => ROUNDS,
  revealMs: (n) => 3800 + n * 350,
  estimateMs: (n) =>
    6000 + ROUNDS * (FAKE_WRITE_MS * 0.7 + FAKE_VOTE_MS * 0.6 + 3800 + n * 350 + 5000),

  init: () => ({
    round: 0,
    step: 'done',
    endsAt: null,
    players: [],
    entry: null,
    fakes: {},
    options: [],
    authors: [],
    realIndex: 0,
    votes: {},
  }),

  startRound(s, ctx) {
    const e = pickEntry(triviaBank, ctx);
    return {
      ...fakeAnswer.init(ctx),
      round: s.round + 1,
      step: 'write',
      endsAt: ctx.now + ctx.ms(FAKE_WRITE_MS),
      players: [...ctx.players],
      entry: { id: e.id, question: e.question, answer: e.answer },
    };
  },

  onInput(s, playerId, input, ctx) {
    if (!s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.step === 'write' && 'fake' in input) {
      if (s.fakes[playerId] !== undefined) return { reject: 'Already locked in.' };
      const cleaned = cleanText(input.fake, ctx.spice, FAKE_MAX_CHARS);
      if (!cleaned.ok) return { reject: cleaned.reason };
      if (tooClose(cleaned.text, s.entry?.answer ?? '')) return { reject: TOO_CLOSE_MSG };
      return { ...s, fakes: { ...s.fakes, [playerId]: cleaned.text } };
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
    const groups = mergeFakes(s.players, s.fakes);
    // Nobody wrote a fake: nothing to vote on.
    if (groups.length === 0) return { ...s, step: 'done', endsAt: null };
    const real = { text: s.entry?.answer ?? '', authors: [] as PlayerId[] };
    const cards = ctx.rng.shuffle([...groups, real]);
    return {
      ...s,
      step: 'vote',
      endsAt: ctx.now + ctx.ms(FAKE_VOTE_MS),
      options: cards.map((c) => c.text),
      authors: cards.map((c) => c.authors),
      realIndex: cards.indexOf(real),
    };
  },

  step: (s) => s.step,
  prompt: (s) =>
    s.step === 'write' && s.entry ? { bankId: 'fakeAnswer', promptId: s.entry.id } : null,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => {
    if (s.step === 'write') return s.players.filter((p) => s.fakes[p] === undefined);
    if (s.step === 'vote') return s.players.filter((p) => s.votes[p] === undefined);
    return [];
  },
  endsEarly: () => true,

  result(s, ctx) {
    const answer = s.entry?.answer ?? '';
    if (s.options.length === 0) {
      return {
        reveal: {
          answer,
          realIndex: 0,
          options: [answer],
          authors: [[]],
          votes: {},
          masterLiars: [],
        },
        assigned: [],
        selfInflicted: [],
        everyone: false,
        ranking: [],
        nobody: null,
      };
    }
    const fooled = s.players.filter((p) => s.votes[p] !== undefined && s.votes[p] !== s.realIndex);
    const sharp = s.players.filter((p) => s.votes[p] === s.realIndex);
    const noVote = idle(s.players, (p) => s.votes[p] !== undefined, ctx.connected);
    const counts = s.options.map((_, i) => s.players.filter((p) => s.votes[p] === i).length);
    const stats: Record<PlayerId, { liarPoints: number }> = {};
    s.authors.forEach((authors, i) => {
      for (const a of authors) {
        if ((counts[i] ?? 0) > 0) stats[a] = { liarPoints: counts[i] ?? 0 };
      }
    });
    const best = Math.max(0, ...counts.filter((_, i) => i !== s.realIndex));
    const masterLiars =
      best === 0 ? [] : s.authors.filter((_, i) => counts[i] === best && i !== s.realIndex).flat();
    const assigned: Drinker[] = [
      ...fooled.map((id): Drinker => ({ id, reason: 'fooled' })),
      ...noVote.map((id): Drinker => ({ id, reason: 'noVote' })),
    ];
    return {
      reveal: {
        answer,
        realIndex: s.realIndex,
        options: [...s.options],
        authors: s.authors.map((a) => [...a]),
        votes: { ...s.votes },
        masterLiars,
      },
      assigned,
      selfInflicted: [],
      everyone: false,
      ranking: [...noVote, ...fooled, ...sharp],
      nobody: assigned.length === 0 ? 'sharp' : null,
      stats,
    };
  },

  publicView: (s) => ({
    question: s.entry?.question ?? '',
    options:
      s.step === 'vote' || (s.step === 'done' && s.options.length > 0) ? [...s.options] : null,
  }),
  privateView: (s, playerId) => ({
    fake: s.fakes[playerId] ?? null,
    vote: s.votes[playerId] ?? null,
    mine: s.authors.flatMap((a, i) => (a.includes(playerId) ? [i] : [])),
  }),
  shift: (s, delta) => ({ ...s, endsAt: s.endsAt === null ? null : s.endsAt + delta }),
};

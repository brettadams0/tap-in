/**
 * Rank It (SPEC §2, DECISIONS R8).
 *
 * Everyone ranks the same four items, best first. Each player's distance is the sum of absolute
 * differences between their ranks and the group's average rank. The furthest from the group
 * drinks (ties all drink). A connected player who never ranks drinks too (R5).
 */
import type { PlayerId } from '@tap-in/shared';
import { z } from 'zod';
import { pickEntry, rankBank } from '../content.js';
import { idle } from '../kit/votes.js';
import type { Drinker, GameModule } from '../types.js';

const ROUNDS = 3;
export const RANK_MS = 30_000;

export interface RankState {
  round: number;
  step: 'rank' | 'done';
  endsAt: number | null;
  players: PlayerId[];
  entry: { id: string; prompt: string; items: string[] } | null;
  rankings: Record<PlayerId, number[]>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Average rank (1 = best) of each item over the given rankings. */
export function averages(rankings: readonly number[][], items: number): number[] {
  return Array.from({ length: items }, (_, item) => {
    const total = rankings.reduce((sum, r) => sum + r.indexOf(item) + 1, 0);
    return round2(total / Math.max(1, rankings.length));
  });
}

/** Sum of |your rank − group average| over every item. */
export function distance(ranking: readonly number[], average: readonly number[]): number {
  return round2(
    average.reduce((sum, avg, item) => sum + Math.abs(ranking.indexOf(item) + 1 - avg), 0),
  );
}

export const rankIt: GameModule<'rankIt', RankState> = {
  id: 'rankIt',
  inputSchema: z.strictObject({
    ranking: z
      .array(z.number().int().min(0).max(3))
      .length(4)
      .refine((r) => new Set(r).size === 4, 'each item once'),
  }),
  rounds: () => ROUNDS,
  revealMs: (n) => 3800 + n * 300,
  estimateMs: (n) => 6000 + ROUNDS * (RANK_MS * 0.7 + 3800 + n * 300 + 5000),

  init: () => ({ round: 0, step: 'done', endsAt: null, players: [], entry: null, rankings: {} }),

  startRound(s, ctx) {
    const e = pickEntry(rankBank, ctx);
    return {
      round: s.round + 1,
      step: 'rank',
      endsAt: ctx.now + ctx.ms(RANK_MS),
      players: [...ctx.players],
      entry: { id: e.id, prompt: e.prompt, items: [...e.items] },
      rankings: {},
    };
  },

  onInput(s, playerId, input) {
    if (s.step !== 'rank' || !s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.rankings[playerId]) return { reject: 'Already locked in.' };
    return { ...s, rankings: { ...s.rankings, [playerId]: [...input.ranking] } };
  },

  onTimer: (s) => ({ ...s, step: 'done', endsAt: null }),

  step: (s) => s.step,
  prompt: (s) => (s.step === 'rank' && s.entry ? { bankId: 'rankIt', promptId: s.entry.id } : null),
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => (s.step === 'rank' ? s.players.filter((p) => !s.rankings[p]) : []),
  endsEarly: () => true,

  result(s, ctx) {
    const rankers = s.players.filter((p) => s.rankings[p]);
    const average = averages(
      rankers.map((p) => s.rankings[p] ?? []),
      4,
    );
    const group = [0, 1, 2, 3].sort((a, b) => (average[a] ?? 0) - (average[b] ?? 0) || a - b);
    const scored = rankers
      .map((id) => ({ id, distance: distance(s.rankings[id] ?? [], average) }))
      .sort((a, b) => b.distance - a.distance);
    const noRank = idle(s.players, (p) => !!s.rankings[p], ctx.connected);
    const furthest = scored[0]?.distance ?? 0;
    const assigned: Drinker[] = noRank.map((id) => ({ id, reason: 'noAnswer' }));
    if (rankers.length >= 2 && furthest > 0) {
      for (const x of scored)
        if (x.distance === furthest) assigned.push({ id: x.id, reason: 'furthest' });
    }
    return {
      reveal: {
        group,
        average,
        distances: [
          ...scored.map((x) => ({ ...x, ranking: [...(s.rankings[x.id] ?? [])] })),
          ...noRank.map((id) => ({ id, distance: null, ranking: null })),
        ],
      },
      assigned,
      selfInflicted: [],
      everyone: false,
      ranking: [...noRank, ...scored.map((x) => x.id)],
      nobody: assigned.length === 0 && rankers.length >= 2 ? 'unanimous' : null,
    };
  },

  publicView: (s) => ({ prompt: s.entry?.prompt ?? '', items: [...(s.entry?.items ?? [])] }),
  privateView: (s, playerId) => ({
    ranking: s.rankings[playerId] ? [...(s.rankings[playerId] ?? [])] : null,
  }),
  shift: (s, delta) => ({ ...s, endsAt: s.endsAt === null ? null : s.endsAt + delta }),
};

/**
 * Tap Race (SPEC §8).
 *
 * A synced 3-2-1 lands on `goAt`, then 5 seconds of tapping. Each phone counts its own taps and
 * sends the total once its window closes; the server refuses anything above 20 taps a second.
 * The fewest taps drinks (ties all drink). A connected phone that never sends a count scores 0
 * (R5). The tapping window itself is never time-scaled, so counts mean the same everywhere.
 */
import type { PlayerId } from '@tap-in/shared';
import { z } from 'zod';
import type { Drinker, GameModule } from '../types.js';

const ROUNDS = 3;
export const TAP_MS = 5000;
export const TAP_COUNTDOWN_MS = 3000;
/** Time after the window for the last counts to arrive. */
const GRACE_MS = 2500;
export const MAX_TAPS_PER_SECOND = 20;
export const MAX_TAPS = (TAP_MS / 1000) * MAX_TAPS_PER_SECOND;

export interface TapState {
  round: number;
  step: 'tap' | 'done';
  endsAt: number | null;
  players: PlayerId[];
  goAt: number;
  counts: Record<PlayerId, number>;
}

export const tapRace: GameModule<'tapRace', TapState> = {
  id: 'tapRace',
  inputSchema: z.strictObject({ count: z.number().int().min(0).max(10_000) }),
  rounds: () => ROUNDS,
  revealMs: (n) => 3000 + n * 250,
  estimateMs: (n) =>
    6000 + ROUNDS * (TAP_COUNTDOWN_MS + TAP_MS + GRACE_MS / 2 + 3000 + n * 250 + 5000),

  init: () => ({ round: 0, step: 'done', endsAt: null, players: [], goAt: 0, counts: {} }),

  startRound(s, ctx) {
    const goAt = ctx.now + ctx.lead + ctx.ms(TAP_COUNTDOWN_MS);
    return {
      round: s.round + 1,
      step: 'tap',
      endsAt: goAt + TAP_MS + Math.max(1500, ctx.ms(GRACE_MS)),
      players: [...ctx.players],
      goAt,
      counts: {},
    };
  },

  onInput(s, playerId, input, ctx) {
    if (s.step !== 'tap' || !s.players.includes(playerId)) return { reject: 'Not now.' };
    if (ctx.now < s.goAt) return { reject: 'Not yet!' };
    if (s.counts[playerId] !== undefined) return { reject: 'Already counted.' };
    if (input.count > MAX_TAPS) return { reject: "That's not humanly possible." };
    return { ...s, counts: { ...s.counts, [playerId]: input.count } };
  },

  onTimer: (s) => ({ ...s, step: 'done', endsAt: null }),

  step: (s) => s.step,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => (s.step === 'tap' ? s.players.filter((p) => s.counts[p] === undefined) : []),
  endsEarly: () => true,

  result(s, ctx) {
    // Disconnected phones that never reported sit this one out; connected ones score 0.
    const scored = s.players
      .filter((p) => s.counts[p] !== undefined || ctx.connected.includes(p))
      .map((id) => ({ id, count: s.counts[id] ?? null }));
    const value = (c: number | null) => c ?? 0;
    scored.sort((a, b) => value(b.count) - value(a.count));
    const fewest = Math.min(...scored.map((x) => value(x.count)));
    const assigned: Drinker[] = scored
      .filter((x) => value(x.count) === fewest)
      .map((x) => ({ id: x.id, reason: x.count === null ? 'noAnswer' : 'fewestTaps' }));
    return {
      reveal: { board: scored },
      assigned: scored.length > 0 ? assigned : [],
      selfInflicted: [],
      everyone: false,
      ranking: [...scored].reverse().map((x) => x.id),
      nobody: null,
    };
  },

  publicView: (s) => ({ goAt: s.goAt, tapMs: TAP_MS }),
  privateView: (s, playerId) => ({ count: s.counts[playerId] ?? null }),
  shift: (s, delta) => ({
    ...s,
    goAt: s.goAt + delta,
    endsAt: s.endsAt === null ? null : s.endsAt + delta,
  }),
};

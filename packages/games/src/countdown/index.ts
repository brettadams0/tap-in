/**
 * Countdown (SPEC §11, DECISIONS R3).
 *
 * The group counts from 1 to players + 3 by tapping, one at a time, with no set order. Every tap
 * moves the number on all phones. Two or more players tapping inside the same 600 ms window
 * (server receive time) collide: they drink and the count resets. Nobody can tap twice in a row.
 * Reaching the target (with its last window closing cleanly) means nobody drinks; running out
 * of time means everyone drinks. The collision window is never time-scaled.
 */
import type { PlayerId } from '@tap-in/shared';
import { z } from 'zod';
import type { GameModule } from '../types.js';

const ROUNDS = 3;
export const COUNT_MS = 30_000;
export const COLLISION_MS = 600;

export interface CountState {
  round: number;
  step: 'count' | 'done';
  players: PlayerId[];
  target: number;
  count: number;
  best: number;
  endsAt: number;
  lastBy: PlayerId | null;
  lastAt: number | null;
  /** The open collision window: when it started, who's in it, and whether it collided. */
  windowAt: number | null;
  windowIds: PlayerId[];
  collisions: { ids: PlayerId[]; at: number }[];
  reached: boolean;
}

function windowOpen(s: CountState, now: number): boolean {
  return s.windowAt !== null && now - s.windowAt < COLLISION_MS;
}

export const countdown: GameModule<'countdown', CountState> = {
  id: 'countdown',
  inputSchema: z.strictObject({ tap: z.literal(true) }),
  rounds: () => ROUNDS,
  revealMs: () => 3200,
  estimateMs: () => 6000 + ROUNDS * (COUNT_MS * 0.6 + 3200 + 5000),

  init: () => ({
    round: 0,
    step: 'done',
    players: [],
    target: 0,
    count: 0,
    best: 0,
    endsAt: 0,
    lastBy: null,
    lastAt: null,
    windowAt: null,
    windowIds: [],
    collisions: [],
    reached: false,
  }),

  startRound(s, ctx) {
    return {
      ...countdown.init(ctx),
      round: s.round + 1,
      step: 'count',
      players: [...ctx.players],
      target: ctx.players.length + 3,
      endsAt: ctx.now + ctx.lead + ctx.ms(COUNT_MS),
    };
  },

  onInput(s, playerId, _input, ctx) {
    if (s.step !== 'count' || !s.players.includes(playerId) || s.reached) {
      return { reject: 'Not now.' };
    }
    const now = ctx.now;
    if (windowOpen(s, now)) {
      if (s.windowIds.includes(playerId)) return { reject: 'Wait for someone else.' };
      // A second tap inside the window: everyone in it collides and the count resets.
      const ids = [...s.windowIds, playerId];
      const open = s.collisions.at(-1);
      const collisions =
        open && open.at >= (s.windowAt ?? 0)
          ? [...s.collisions.slice(0, -1), { ids, at: open.at }]
          : [...s.collisions, { ids, at: now }];
      return { ...s, count: 0, lastBy: null, windowIds: ids, collisions };
    }
    if (playerId === s.lastBy) return { reject: 'Wait for someone else.' };
    const count = s.count + 1;
    return {
      ...s,
      count,
      best: Math.max(s.best, count),
      lastBy: playerId,
      lastAt: now,
      windowAt: now,
      windowIds: [playerId],
    };
  },

  onTimer(s, ctx) {
    if (s.count >= s.target && s.windowAt !== null && ctx.now >= s.windowAt + COLLISION_MS) {
      return { ...s, step: 'done', reached: true };
    }
    if (ctx.now >= s.endsAt) return { ...s, step: 'done' };
    return s;
  },

  step: (s) => s.step,
  // Hitting the target waits for its window to close cleanly; otherwise the round clock runs.
  deadline: (s) => {
    if (s.step === 'done') return null;
    if (s.count >= s.target && s.windowAt !== null)
      return Math.min(s.windowAt + COLLISION_MS, s.endsAt);
    return s.endsAt;
  },
  roundOver: (s) => s.step === 'done',
  awaiting: () => [],
  endsEarly: () => false,

  result(s) {
    const colliders = [...new Set(s.collisions.flatMap((c) => c.ids))];
    return {
      reveal: {
        reached: s.reached,
        target: s.target,
        best: s.best,
        collisions: s.collisions.map((c) => ({ ids: [...c.ids], at: c.at })),
      },
      assigned: [],
      selfInflicted: colliders.map((id) => ({ id, reason: 'collision' })),
      everyone: !s.reached,
      ranking: [],
      nobody: s.reached ? 'counted' : null,
    };
  },

  publicView: (s) => ({
    count: s.count,
    target: s.target,
    lastBy: s.lastBy,
    lastAt: s.lastAt,
    collisions: s.collisions.map((c) => ({ ids: [...c.ids], at: c.at })),
    endsAt: s.endsAt,
  }),
  privateView: () => ({}),
  shift: (s, delta) => ({
    ...s,
    endsAt: s.endsAt + delta,
    lastAt: s.lastAt === null ? null : s.lastAt + delta,
    windowAt: s.windowAt === null ? null : s.windowAt + delta,
    collisions: s.collisions.map((c) => ({ ...c, at: c.at + delta })),
  }),
};

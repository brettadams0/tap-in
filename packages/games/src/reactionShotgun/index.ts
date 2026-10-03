/**
 * Reaction Shotgun (SPEC §7, DECISIONS R14).
 *
 * Steps: `ready` (wait for it) → optional `fake` (a fake-out flash is scheduled) → `armed`
 * (the real flash is scheduled) → done. A flash time only enters the public view once it is
 * within the cue lead time, so phones can schedule it in sync but nobody learns it early.
 *
 * Reaction time is measured on the phone (flash frame → tap), so latency doesn't decide.
 * Early = tapped before the real flash, tapped the fake-out, under 90 ms, or received by the
 * server more than 50 ms before the flash. Early tappers drink; otherwise the slowest does.
 */
import type { PlayerId, ShotgunEntry, ShotgunStep } from '@tap-in/shared';
import { z } from 'zod';
import type { Drinker, GameModule, RoundStat } from '../types.js';

const ROUNDS = 4;
export const FAKE_CHANCE = 0.3;
export const MIN_REACTION_MS = 90;
export const TAP_WINDOW_MS = 2500;
const MAX_MS = 10_000;

interface Tap {
  ms: number | null;
  early: boolean;
}

export interface ShotgunState {
  round: number;
  step: ShotgunStep | 'done';
  players: PlayerId[];
  fakeAt: number | null;
  flashAt: number;
  endsAt: number | null;
  taps: Record<PlayerId, Tap>;
}

export const reactionShotgun: GameModule<'reactionShotgun', ShotgunState> = {
  id: 'reactionShotgun',
  inputSchema: z.strictObject({ ms: z.number().min(0).max(60_000).nullable() }),
  rounds: () => ROUNDS,
  revealMs: (n) => 2400 + n * 350,
  estimateMs: (n) => 6000 + ROUNDS * (4500 + TAP_WINDOW_MS / 2 + 2400 + n * 350 + 5000),

  init: () => ({
    round: 0,
    step: 'done',
    players: [],
    fakeAt: null,
    flashAt: 0,
    endsAt: null,
    taps: {},
  }),

  startRound(s, ctx) {
    // Random 2–7 s wait, but never shorter than the cue lead time.
    const delay = Math.max(ctx.lead + 200, ctx.ms(2000 + ctx.rng.int(5001)));
    const flashAt = ctx.now + delay;
    let fakeAt: number | null = null;
    if (ctx.rng.next() < FAKE_CHANCE) {
      const earliest = ctx.now + Math.max(ctx.lead + 100, ctx.ms(1000));
      const span = flashAt - ctx.ms(800) - earliest;
      if (span > 0) fakeAt = earliest + ctx.rng.int(span);
    }
    return {
      round: s.round + 1,
      step: 'ready',
      players: [...ctx.players],
      fakeAt,
      flashAt,
      endsAt: (fakeAt ?? flashAt) - ctx.lead,
      taps: {},
    };
  },

  onInput(s, playerId, input, ctx) {
    if (s.step === 'done' || !s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.taps[playerId]) return { reject: 'One tap only.' };
    const early =
      s.step !== 'armed' ||
      ctx.now < s.flashAt - 50 ||
      input.ms === null ||
      input.ms < MIN_REACTION_MS;
    const tap: Tap = early
      ? { ms: null, early: true }
      : { ms: Math.round(Math.min(input.ms ?? MAX_MS, MAX_MS)), early: false };
    return { ...s, taps: { ...s.taps, [playerId]: tap } };
  },

  onTimer(s, ctx) {
    switch (s.step) {
      case 'ready':
        return s.fakeAt !== null
          ? { ...s, step: 'fake', endsAt: s.flashAt - ctx.lead }
          : { ...s, step: 'armed', endsAt: s.flashAt + ctx.ms(TAP_WINDOW_MS) };
      case 'fake':
        return { ...s, step: 'armed', endsAt: s.flashAt + ctx.ms(TAP_WINDOW_MS) };
      default:
        return { ...s, step: 'done', endsAt: null };
    }
  },

  step: (s) => s.step,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => (s.step === 'done' ? [] : s.players.filter((p) => !s.taps[p])),
  endsEarly: () => true,

  result(s, ctx) {
    const valid: ShotgunEntry[] = [];
    const early: ShotgunEntry[] = [];
    const none: ShotgunEntry[] = [];
    for (const id of s.players) {
      const tap = s.taps[id];
      if (tap?.early) early.push({ id, ms: null, early: true });
      else if (tap) valid.push({ id, ms: tap.ms, early: false });
      else if (ctx.connected.includes(id)) none.push({ id, ms: null, early: false });
    }
    valid.sort((x, y) => (x.ms ?? 0) - (y.ms ?? 0));
    const selfInflicted: Drinker[] = early.map((e) => ({ id: e.id, reason: 'early' }));
    let assigned: Drinker[] = [];
    if (early.length === 0) {
      if (none.length > 0) assigned = none.map((e) => ({ id: e.id, reason: 'noTap' }));
      else if (valid.length > 0) {
        const slowest = valid.at(-1)?.ms;
        assigned = valid
          .filter((e) => e.ms === slowest)
          .map((e) => ({ id: e.id, reason: 'slowest' }));
      }
    }
    const stats: Record<PlayerId, RoundStat> = {};
    for (const e of valid) if (e.ms !== null) stats[e.id] = { reactionMs: e.ms };
    for (const e of early) stats[e.id] = { chaos: 1 };
    return {
      reveal: { board: [...valid, ...early, ...none], hadFake: s.fakeAt !== null },
      assigned,
      selfInflicted,
      everyone: false,
      ranking: [...none.map((e) => e.id), ...[...valid].reverse().map((e) => e.id)],
      nobody: null,
      stats,
    };
  },

  publicView: (s) => ({
    fakeAt: s.step === 'fake' || s.step === 'armed' ? s.fakeAt : null,
    flashAt: s.step === 'armed' ? s.flashAt : null,
  }),
  privateView: (s, playerId) => {
    const tap = s.taps[playerId];
    return { tapped: !!tap, early: tap?.early ?? false, ms: tap?.ms ?? null };
  },
  shift: (s, delta) => ({
    ...s,
    flashAt: s.flashAt + delta,
    fakeAt: s.fakeAt === null ? null : s.fakeAt + delta,
    endsAt: s.endsAt === null ? null : s.endsAt + delta,
  }),
};

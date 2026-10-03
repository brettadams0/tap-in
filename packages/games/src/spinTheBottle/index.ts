/**
 * Spin the Bottle (SPEC §9, DECISIONS R13).
 *
 * Steps: `spin` (the server picks the player before the animation; every phone lands on them;
 * never a player the fairness cap would excuse) → `choice` (Dare or Drink, 20 s; running out of
 * time counts as Drink) → `perform` (20 s to do the dare) → `confirm` (everyone else votes Done
 * or Nope, 10 s). Choosing Drink is self-inflicted; the player drinks if Nope beats Done.
 */
import type { PlayerId, SpinStep } from '@tap-in/shared';
import { z } from 'zod';
import { dareBank, pickEntry } from '../content.js';
import type { GameModule } from '../types.js';

const ROUNDS = 3;
export const SPIN_MS = 4000;
export const CHOICE_MS = 20_000;
export const PERFORM_MS = 20_000;
export const CONFIRM_MS = 10_000;
/** Pause after the bottle lands before the choice opens. */
const SETTLE_MS = 900;

export interface SpinState {
  round: number;
  step: SpinStep | 'done';
  endsAt: number | null;
  players: PlayerId[];
  spinAt: number;
  landAt: number;
  chosen: PlayerId;
  dare: { id: string; text: string } | null;
  choice: 'dare' | 'drink' | null;
  verdicts: Record<PlayerId, 'done' | 'nope'>;
}

export const spinTheBottle: GameModule<'spinTheBottle', SpinState> = {
  id: 'spinTheBottle',
  inputSchema: z.union([
    z.strictObject({ choice: z.enum(['dare', 'drink']) }),
    z.strictObject({ performed: z.literal(true) }),
    z.strictObject({ verdict: z.enum(['done', 'nope']) }),
  ]),
  rounds: () => ROUNDS,
  revealMs: () => 3000,
  estimateMs: () =>
    6000 +
    ROUNDS * (SPIN_MS + SETTLE_MS + CHOICE_MS * 0.3 + PERFORM_MS * 0.6 + CONFIRM_MS * 0.5 + 8000),

  init: () => ({
    round: 0,
    step: 'done',
    endsAt: null,
    players: [],
    spinAt: 0,
    landAt: 0,
    chosen: '',
    dare: null,
    choice: null,
    verdicts: {},
  }),

  startRound(s, ctx) {
    const open = ctx.players.filter((p) => !ctx.capped.includes(p));
    const chosen = ctx.rng.pick(open.length > 0 ? open : ctx.players);
    const e = pickEntry(dareBank, ctx);
    const spinAt = ctx.now + ctx.lead;
    const landAt = spinAt + Math.max(2000, ctx.ms(SPIN_MS));
    return {
      round: s.round + 1,
      step: 'spin',
      endsAt: landAt + ctx.ms(SETTLE_MS),
      players: [...ctx.players],
      spinAt,
      landAt,
      chosen,
      dare: { id: e.id, text: e.dare },
      choice: null,
      verdicts: {},
    };
  },

  onInput(s, playerId, input, ctx) {
    if (!s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.step === 'choice' && 'choice' in input) {
      if (playerId !== s.chosen) return { reject: "It's not your spin." };
      return input.choice === 'dare'
        ? { ...s, choice: 'dare', step: 'perform', endsAt: ctx.now + ctx.ms(PERFORM_MS) }
        : { ...s, choice: 'drink', step: 'done', endsAt: null };
    }
    if (s.step === 'perform' && 'performed' in input) {
      if (playerId !== s.chosen) return { reject: "It's not your dare." };
      return { ...s, step: 'confirm', endsAt: ctx.now + ctx.ms(CONFIRM_MS) };
    }
    if (s.step === 'confirm' && 'verdict' in input) {
      if (playerId === s.chosen) return { reject: "You can't judge your own dare." };
      if (s.verdicts[playerId]) return { reject: 'Already voted.' };
      return { ...s, verdicts: { ...s.verdicts, [playerId]: input.verdict } };
    }
    return { reject: 'Not now.' };
  },

  onTimer(s, ctx) {
    switch (s.step) {
      case 'spin':
        return { ...s, step: 'choice', endsAt: ctx.now + ctx.ms(CHOICE_MS) };
      case 'choice':
        // Out of time counts as Drink; a player who dropped just sits this one out.
        return {
          ...s,
          choice: ctx.connected.includes(s.chosen) ? 'drink' : null,
          step: 'done',
          endsAt: null,
        };
      case 'perform':
        return { ...s, step: 'confirm', endsAt: ctx.now + ctx.ms(CONFIRM_MS) };
      default:
        return { ...s, step: 'done', endsAt: null };
    }
  },

  step: (s) => s.step,
  prompt: (s) =>
    s.step === 'choice' && s.dare ? { bankId: 'spinTheBottle', promptId: s.dare.id } : null,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => {
    if (s.step === 'choice' || s.step === 'perform') return [s.chosen];
    if (s.step === 'confirm') return s.players.filter((p) => p !== s.chosen && !s.verdicts[p]);
    return [];
  },
  // Only the vote ends early. The spin is a synced moment, and a phone that locks while its
  // owner does a dare must not skip their choice or their 20 s to perform.
  endsEarly: (s) => s.step === 'confirm',

  result(s) {
    const verdicts = Object.values(s.verdicts);
    const done = verdicts.filter((v) => v === 'done').length;
    const nope = verdicts.length - done;
    const passed = s.choice === 'dare' && nope <= done;
    const reveal = {
      chosen: s.chosen,
      dare: s.dare?.text ?? '',
      choice: s.choice,
      done,
      nope,
      passed,
    };
    const base = { reveal, assigned: [], selfInflicted: [], everyone: false, ranking: [] };
    if (s.choice === 'drink')
      return { ...base, selfInflicted: [{ id: s.chosen, reason: 'choseDrink' }], nobody: null };
    if (s.choice === 'dare' && !passed) {
      return { ...base, assigned: [{ id: s.chosen, reason: 'dareFailed' }], nobody: null };
    }
    return { ...base, nobody: s.choice === 'dare' ? 'dared' : null };
  },

  publicView: (s) => ({
    spinAt: s.spinAt,
    landAt: s.landAt,
    chosen: s.chosen,
    ring: [...s.players],
    dare: s.step === 'spin' ? null : (s.dare?.text ?? null),
    choice: s.choice,
  }),
  privateView: (s, playerId) => ({ verdict: s.verdicts[playerId] ?? null }),
  shift: (s, delta) => ({
    ...s,
    spinAt: s.spinAt + delta,
    landAt: s.landAt + delta,
    endsAt: s.endsAt === null ? null : s.endsAt + delta,
  }),
};

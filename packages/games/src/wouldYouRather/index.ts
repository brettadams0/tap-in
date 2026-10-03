/**
 * Would You Rather (SPEC §1): everyone votes privately; the smaller side drinks; a tie means
 * nobody does. A connected player who never votes also drinks (DECISIONS R5); a disconnected
 * one just abstains.
 */
import type { PlayerId, WyrSide } from '@tap-in/shared';
import { z } from 'zod';
import { pickEntry, wyrBank } from '../content.js';
import type { Drinker, GameModule } from '../types.js';

export const WYR_INPUT_MS = 15_000;
const ROUNDS = 4;

export interface WyrState {
  round: number;
  step: 'vote' | 'done';
  endsAt: number | null;
  players: PlayerId[];
  prompt: { id: string; a: string; b: string } | null;
  votes: Record<PlayerId, WyrSide>;
}

export const wouldYouRather: GameModule<'wouldYouRather', WyrState> = {
  id: 'wouldYouRather',
  inputSchema: z.strictObject({ side: z.enum(['a', 'b']) }),
  rounds: () => ROUNDS,
  revealMs: (n) => 2600 + n * 200,
  estimateMs: (n) => 6000 + ROUNDS * (WYR_INPUT_MS * 0.7 + 2600 + n * 200 + 5000),

  init: () => ({ round: 0, step: 'done', endsAt: null, players: [], prompt: null, votes: {} }),

  startRound(s, ctx) {
    const entry = pickEntry(wyrBank, ctx);
    return {
      round: s.round + 1,
      step: 'vote',
      endsAt: ctx.now + ctx.ms(WYR_INPUT_MS),
      players: [...ctx.players],
      prompt: { id: entry.id, a: entry.a, b: entry.b },
      votes: {},
    };
  },

  onInput(s, playerId, input) {
    if (s.step !== 'vote' || !s.players.includes(playerId)) return { reject: 'Not now.' };
    if (s.votes[playerId]) return { reject: 'Already locked in.' };
    return { ...s, votes: { ...s.votes, [playerId]: input.side } };
  },

  onTimer: (s) => ({ ...s, step: 'done', endsAt: null }),

  step: (s) => s.step,
  prompt: (s) =>
    s.step === 'vote' && s.prompt ? { bankId: 'wouldYouRather', promptId: s.prompt.id } : null,
  deadline: (s) => s.endsAt,
  roundOver: (s) => s.step === 'done',
  awaiting: (s) => (s.step === 'vote' ? s.players.filter((p) => !s.votes[p]) : []),
  endsEarly: () => true,

  result(s, ctx) {
    const a = s.players.filter((p) => s.votes[p] === 'a');
    const b = s.players.filter((p) => s.votes[p] === 'b');
    const noVote = s.players.filter((p) => !s.votes[p] && ctx.connected.includes(p));
    const assigned: Drinker[] = noVote.map((id) => ({ id, reason: 'noVote' }));
    let nobody: 'balanced' | 'unanimous' | null = null;
    if (a.length === b.length) nobody = 'balanced';
    else if (a.length === 0 || b.length === 0) nobody = 'unanimous';
    else {
      const smaller = a.length < b.length ? a : b;
      assigned.push(...smaller.map((id): Drinker => ({ id, reason: 'smallerSide' })));
    }
    return {
      reveal: { a, b, noVote },
      assigned,
      selfInflicted: [],
      everyone: false,
      ranking: [],
      nobody: assigned.length === 0 ? nobody : null,
    };
  },

  publicView: (s) => ({ a: s.prompt?.a ?? '', b: s.prompt?.b ?? '' }),
  privateView: (s, playerId) => ({ choice: s.votes[playerId] ?? null }),
  shift: (s, delta) => ({ ...s, endsAt: s.endsAt === null ? null : s.endsAt + delta }),
};

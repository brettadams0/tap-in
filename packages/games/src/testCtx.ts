/** Test helper: a GameCtx with a seeded rng and a controllable clock. */
import { createRng, type PlayerId, type Spice } from '@tap-in/shared';
import type { GameCtx } from './types.js';

export function testCtx(
  players: PlayerId[],
  opts: {
    now?: number;
    seed?: string;
    spice?: Spice;
    connected?: PlayerId[];
    capped?: PlayerId[];
  } = {},
): GameCtx {
  return {
    now: opts.now ?? 1_000_000,
    rng: createRng(opts.seed ?? 'test'),
    players,
    connected: opts.connected ?? players,
    spice: opts.spice ?? 'chill',
    used: [],
    ms: (d) => d,
    lead: 600,
    capped: opts.capped ?? [],
  };
}

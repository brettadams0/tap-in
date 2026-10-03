/**
 * Chaos (PLAN §7, phase 7): every game, five phones, seeded random play with random drops and
 * rejoins in every phase, host churn and a mid-game restart from saved state (a deploy).
 *
 * Invariants checked at every step:
 * - every connected phone's patched view equals the server's view for that player (no gaps);
 * - a rejoined phone lands straight back in the room's current phase;
 * - the session never gets stuck: it always reaches the results screen.
 */
import { describe, expect, it } from 'vitest';
import { createRng, GAME_IDS, type GameId } from '@tap-in/shared';
import { randomInput } from './autoplay.js';
import { HOST_TRANSFER_MS } from '../src/engine/state.js';
import { Harness, type FakeClient } from './harness.js';

const COLORS = ['red', 'sky', 'green', 'pink', 'lemon'] as const;
function chaos(
  gameId: GameId,
  seed: string,
): { phases: Set<string>; restarted: boolean; drops: number; rejoins: number } {
  const rng = createRng(`chaos-${seed}`);
  const h = new Harness({ seed: `chaos-${seed}` });
  // Seat i is always the same player; the client in the slot changes as they drop and rejoin.
  const seats: (FakeClient | null)[] = COLORS.map((c, i) => h.join(`P${i + 1}`, c));
  const ids = seats.map((c) => c?.playerId ?? '');
  const lost: (FakeClient | null)[] = seats.map(() => null);
  const live = () => seats.filter((c): c is FakeClient => c !== null);
  const host = live()[0] as FakeClient;
  host.send({
    type: 'hostAction',
    action: { kind: 'settings', settings: { games: [gameId], length: 'short' } },
  });
  host.send({ type: 'hostAction', action: { kind: 'start' } });

  const phases = new Set<string>();
  let restarted = false;
  let drops = 0;
  let rejoins = 0;
  let hostChurned = false;
  const check = () => {
    const state = h.engine.snapshot;
    for (const [i, c] of seats.entries()) {
      if (!c) continue;
      expect(c.closed).toBeNull();
      expect(c.view).toEqual(h.engine.viewFor(ids[i] ?? ''));
      expect(c.view?.phase).toBe(state.phase);
    }
  };
  const rejoin = (i: number) => {
    const old = lost[i];
    if (!old) return;
    seats[i] = h.rejoin(old);
    lost[i] = null;
    rejoins++;
    check();
  };

  for (let step = 0; step < 4000 && h.engine.snapshot.phase !== 'results'; step++) {
    h.advance(100 + rng.int(1400));
    const phase = h.engine.snapshot.phase;
    phases.add(phase);
    for (const c of live()) {
      const view = c.view;
      if (!view) continue;
      if (rng.next() < 0.35) {
        const input = randomInput(view, rng);
        if (input) c.send({ type: 'submit', step: input.step, data: input.data });
      }
      if (view.phase === 'drink' && rng.next() < 0.3) c.send({ type: 'ready' });
      if (rng.next() < 0.02) c.send({ type: 'flag' });
    }
    const roll = rng.next();
    if (roll < 0.05 && live().length > 3) {
      // A phone locks or drops (never the last few, so the room keeps playing).
      const i = rng.pick(seats.flatMap((c, k) => (c ? [k] : [])));
      const c = seats[i];
      if (c) {
        c.disconnect();
        lost[i] = c;
        seats[i] = null;
        drops++;
      }
    } else if (roll < 0.12) {
      const i = lost.findIndex((c) => c !== null);
      if (i >= 0) rejoin(i);
    } else if (roll < 0.14 && !hostChurned && step > 20) {
      // Host churn: the host vanishes for 30 s+, the role moves on, then they come back.
      hostChurned = true;
      const hi = seats.findIndex((c, k) => c !== null && ids[k] === h.engine.snapshot.hostId);
      const c = seats[hi];
      if (c && live().length > 3) {
        c.disconnect();
        lost[hi] = c;
        seats[hi] = null;
        h.advance(HOST_TRANSFER_MS + 1000);
        expect(h.engine.snapshot.hostId).not.toBe(ids[hi]);
        rejoin(hi);
      }
    } else if (!restarted && step > 40 && ['roundInput', 'roundReveal', 'drink'].includes(phase)) {
      // A deploy mid-round: the engine comes back from storage and every phone rejoins.
      restarted = true;
      const before = h.engine.viewFor(ids[0] ?? '');
      h.restart();
      for (const [i, c] of seats.entries()) {
        if (c) lost[i] = c;
        seats[i] = null;
      }
      for (let i = 0; i < seats.length; i++) rejoin(i);
      const after = h.engine.viewFor(ids[0] ?? '');
      expect(after.phase).toBe(before.phase);
      expect(after.session?.round).toBe(before.session?.round);
      expect(after.session?.drinks).toEqual(before.session?.drinks);
    }
    check();
  }
  for (let i = 0; i < seats.length; i++) rejoin(i);
  expect(h.engine.snapshot.phase).toBe('results');
  check();
  return { phases, restarted, drops, rejoins };
}

describe('chaos: random drops, rejoins, host churn and a restart in every game', () => {
  for (const gameId of GAME_IDS) {
    it(`${gameId} always reaches the results`, () => {
      for (const seed of ['a', 'b']) {
        const { phases, restarted, drops, rejoins } = chaos(gameId, `${gameId}-${seed}`);
        expect(restarted).toBe(true);
        expect(drops).toBeGreaterThan(0);
        expect(rejoins).toBeGreaterThan(drops);
        // The run really went through play: inputs, reveals and Drink moments.
        expect(phases).toContain('roundInput');
        expect(phases).toContain('roundReveal');
        expect(phases).toContain('drink');
      }
    });
  }
});

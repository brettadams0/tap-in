/**
 * SPEC "Integration tests": kill and reconnect a phone mid-input, mid-reveal and mid-Drink in every
 * game, and it comes back to exactly the screen it left: the same phase, deadline and private view.
 */
import { describe, expect, it } from 'vitest';
import { GAME_IDS, type RoomPhase } from '@tap-in/shared';
import { Harness, type FakeClient } from './harness.js';

const COLORS = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

describe('reconnect mid-input, mid-reveal and mid-Drink, in every game', () => {
  for (const gameId of GAME_IDS) {
    it(gameId, () => {
      const h = new Harness({ seed: `reconnect-${gameId}` });
      const players = COLORS.map((c, i) => h.join(`P${i + 1}`, c));
      const host = players[0] as FakeClient;
      host.send({
        type: 'hostAction',
        action: { kind: 'settings', settings: { games: [gameId] } },
      });
      host.send({ type: 'hostAction', action: { kind: 'start' } });
      let phone = players[2] as FakeClient;
      const id = phone.playerId ?? '';
      const seen = new Set<RoomPhase>();
      for (const target of ['roundInput', 'roundReveal', 'drink'] as const) {
        h.until(() => h.engine.snapshot.phase === target, 10 * 60_000, 100);
        const before = phone.view;
        expect(before?.phase).toBe(target);
        phone.disconnect();
        // Others see the grey "reconnecting" badge while it's gone.
        expect(host.view?.players.find((p) => p.id === id)?.presence).toBe('reconnecting');
        phone = h.rejoin(phone);
        // Back on the same screen: same phase, deadline, synced moment and private view.
        expect(phone.view).toEqual(before);
        expect(phone.view).toEqual(h.engine.viewFor(id));
        expect(host.view?.players.find((p) => p.id === id)?.presence).toBe('connected');
        seen.add(target);
      }
      expect(seen.size).toBe(3);
    });
  }
});

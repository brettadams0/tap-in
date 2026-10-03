/** Reactions (DESIGN §12) through the engine: privacy of note words, rate limits, timing rules. */
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@tap-in/shared';
import { NOTES } from '@tap-in/shared/reactions';
import { Harness, type FakeClient } from './harness.js';

const COLORS = ['red', 'sky', 'green'] as const;

function lobby() {
  const h = new Harness({ seed: 'reactions' });
  const players = COLORS.map((c, i) => h.join(`P${i + 1}`, c));
  return { h, players: players as [FakeClient, FakeClient, FakeClient] };
}

const reactions = (c: FakeClient) =>
  c.inbox.flatMap((m: ServerMessage) => (m.type === 'reaction' ? [m.reaction] : []));
const chillNote = NOTES.find((n) => n.spice === 'chill' && n.tab === 'glaze');

describe('reactions', () => {
  it('an emoji flies for everyone to see', () => {
    const { players } = lobby();
    const [a, b, c] = players;
    a.send({ type: 'react', to: b.playerId ?? '', emoji: '😂' });
    for (const p of players) {
      expect(reactions(p)).toEqual([
        { from: a.playerId, to: b.playerId, kind: 'emoji', emoji: '😂' },
      ]);
    }
    expect(c.errors()).toEqual([]);
  });

  it("a note's words reach only the recipient; others see the tab", () => {
    const { players } = lobby();
    const [a, b, c] = players;
    a.send({ type: 'react', to: b.playerId ?? '', note: chillNote?.id ?? '' });
    expect(reactions(b)).toEqual([
      { from: a.playerId, to: b.playerId, kind: 'note', tab: 'glaze', line: chillNote?.line },
    ]);
    for (const p of [a, c]) {
      expect(reactions(p)[0]).toMatchObject({ kind: 'note', tab: 'glaze', line: null });
      expect(JSON.stringify(p.inbox)).not.toContain(chillNote?.line ?? '?');
    }
  });

  it('refuses unknown emoji, notes above the room spice, yourself and strangers', () => {
    const { players } = lobby();
    const [a, b] = players;
    a.send({ type: 'react', to: b.playerId ?? '', emoji: '💩' });
    const spicy = NOTES.find((n) => n.spice === 'spicy');
    a.send({ type: 'react', to: b.playerId ?? '', note: spicy?.id ?? '' });
    expect(a.errors()).toEqual(['BAD_MESSAGE', 'BAD_MESSAGE']);
    a.send({ type: 'react', to: a.playerId ?? '', emoji: '😂' });
    a.send({ type: 'react', to: 'p_nobody', emoji: '😂' });
    expect(a.errors().slice(2)).toEqual(['UNKNOWN_PLAYER', 'UNKNOWN_PLAYER']);
    expect(reactions(b)).toEqual([]);
  });

  it('rate limits: one every 3 s, at most 4 a minute to the same person (R25)', () => {
    const { h, players } = lobby();
    const [a, b, c] = players;
    const send = (to: FakeClient) => {
      a.send({ type: 'react', to: to.playerId ?? '', emoji: '🔥' });
    };
    send(b);
    send(c);
    expect(a.errors()).toEqual(['RATE_LIMITED']);
    for (let i = 0; i < 4; i++) {
      h.advance(3100);
      send(b);
    }
    expect(reactions(b).filter((r) => r.to === b.playerId)).toHaveLength(4);
    expect(a.errors()).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    h.advance(3100);
    send(c);
    expect(reactions(c).filter((r) => r.to === c.playerId)).toHaveLength(1);
    h.advance(60_000);
    send(b);
    expect(reactions(b).filter((r) => r.to === b.playerId)).toHaveLength(5);
  });

  it('not while you owe an answer, and not when the host turned them off', () => {
    const { h, players } = lobby();
    const [a, b] = players;
    a.send({
      type: 'hostAction',
      action: { kind: 'settings', settings: { games: ['wouldYouRather'] } },
    });
    a.send({ type: 'hostAction', action: { kind: 'start' } });
    h.until(() => a.view?.phase === 'roundInput');
    a.send({ type: 'react', to: b.playerId ?? '', emoji: '😂' });
    expect(a.errors()).toEqual(['NOT_ALLOWED']);
    // Locked in: now there's time.
    a.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    a.send({ type: 'react', to: b.playerId ?? '', emoji: '😂' });
    expect(reactions(b)).toHaveLength(1);

    const off = lobby();
    const [x, y] = off.players;
    x.send({ type: 'hostAction', action: { kind: 'settings', settings: { reactions: false } } });
    x.send({ type: 'react', to: y.playerId ?? '', emoji: '😂' });
    expect(x.errors()).toEqual(['NOT_ALLOWED']);
  });
});

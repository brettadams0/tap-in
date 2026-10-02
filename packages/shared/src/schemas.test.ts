import { describe, expect, it } from 'vitest';
import { parseClientMessage, MAX_MESSAGE_BYTES } from './schemas.js';

const avatar = { color: 'red', pattern: 'solid', eyes: 'dots', mouth: 'grin', topper: 'none' };

describe('client message schemas', () => {
  it('accepts every valid message type', () => {
    const valid = [
      { type: 'join', name: 'Sam', avatar },
      { type: 'rejoin', playerId: 'p_1', token: 'a'.repeat(32) },
      { type: 'claim', playerId: 'p_1' },
      { type: 'avatar', avatar },
      { type: 'hostAction', action: { kind: 'start' } },
      {
        type: 'hostAction',
        action: { kind: 'settings', settings: { spice: 'spicy', games: ['tapRace'] } },
      },
      { type: 'hostAction', action: { kind: 'remove', playerId: 'p_2' } },
      { type: 'hostAction', action: { kind: 'resolveClaim', claimId: 'c1', approve: true } },
      { type: 'ping', t0: 123.4 },
      { type: 'resync' },
      { type: 'leave' },
    ];
    for (const msg of valid) expect(parseClientMessage(JSON.stringify(msg)).ok).toBe(true);
  });

  it('rejects malformed input', () => {
    const bad: unknown[] = [
      'not json',
      JSON.stringify({ type: 'nope' }),
      JSON.stringify({ type: 'join', name: 'Sam' }),
      JSON.stringify({ type: 'join', name: 'Sam', avatar: { ...avatar, color: 'plaid' } }),
      JSON.stringify({ type: 'join', name: 'Sam', avatar, admin: true }),
      JSON.stringify({ type: 'rejoin', playerId: '../etc', token: 'a'.repeat(32) }),
      JSON.stringify({ type: 'ping', t0: 'now' }),
      JSON.stringify({
        type: 'hostAction',
        action: { kind: 'settings', settings: { spice: 'nuclear' } },
      }),
      'x'.repeat(MAX_MESSAGE_BYTES + 1),
      42,
    ];
    for (const raw of bad) expect(parseClientMessage(raw).ok).toBe(false);
  });
});

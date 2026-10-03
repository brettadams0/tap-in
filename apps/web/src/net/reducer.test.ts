import { describe, expect, it } from 'vitest';
import type { RoomView } from '@tap-in/shared';
import { backoffDelay, initialState, reduce } from './reducer.js';

const view = { code: 'KZRP', phase: 'lobby', players: [] } as unknown as RoomView;

describe('client room reducer', () => {
  it('stores credentials as an effect and the view on state', () => {
    let s = initialState('KZRP');
    const r1 = reduce(s, { type: 'credentials', code: 'KZRP', playerId: 'p1', token: 't' }, 0);
    expect(r1.effects).toEqual([{ kind: 'saveCredentials', playerId: 'p1', token: 't' }]);
    s = reduce(r1.state, { type: 'state', version: 3, view }, 0).state;
    expect(s.view).toBe(view);
    expect(s.version).toBe(3);
  });

  it('applies patches in order and resyncs on a gap', () => {
    let s = reduce(initialState('KZRP'), { type: 'state', version: 3, view }, 0).state;
    s = reduce(
      s,
      { type: 'patch', base: 3, version: 4, ops: [{ op: 'set', path: ['phase'], value: 'intro' }] },
      0,
    ).state;
    expect(s.view?.phase).toBe('intro');
    const gap = reduce(s, { type: 'patch', base: 9, version: 10, ops: [] }, 0);
    expect(gap.effects).toEqual([{ kind: 'resync' }]);
    expect(gap.state).toBe(s);
  });

  it('ends on ROOM_ENDED or sessionEnded and clears credentials', () => {
    const a = reduce(initialState('KZRP'), { type: 'error', code: 'ROOM_ENDED', message: 'x' }, 5);
    expect(a.state.ended).toBe('notFound');
    expect(a.effects).toEqual([{ kind: 'clearCredentials' }]);
    const b = reduce(initialState('KZRP'), { type: 'sessionEnded', reason: 'removed' }, 0);
    expect(b.state.ended).toBe('removed');
  });

  it('forgets a dead seat on BAD_TOKEN and tracks claims', () => {
    const s = reduce(initialState('KZRP'), { type: 'state', version: 1, view }, 0).state;
    const r = reduce(s, { type: 'error', code: 'BAD_TOKEN', message: 'x' }, 0);
    expect(r.state.view).toBeNull();
    expect(r.effects).toEqual([{ kind: 'clearCredentials' }]);
    const c = reduce(s, { type: 'claimPending', playerId: 'p2' }, 0).state;
    expect(c.claim).toEqual({ playerId: 'p2', status: 'pending' });
    expect(reduce(c, { type: 'claimDenied', playerId: 'p2' }, 0).state.claim?.status).toBe(
      'denied',
    );
  });

  it('backs off 0.5 s → 10 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(backoffDelay)).toEqual([
      500, 1000, 2000, 4000, 8000, 10000, 10000,
    ]);
  });

  it('remembers recent reactions in order, outside the room view', () => {
    let state = initialState('ABCD');
    for (let i = 0; i < 25; i++) {
      state = reduce(
        state,
        { type: 'reaction', reaction: { from: 'a', to: 'b', kind: 'emoji', emoji: '😂' } },
        i,
      ).state;
    }
    expect(state.reactions).toHaveLength(20);
    expect(state.reactions.at(-1)?.seq).toBe(25);
    expect(state.view).toBeNull();
  });
});

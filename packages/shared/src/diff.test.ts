import { describe, expect, it } from 'vitest';
import { applyPatch, diff } from './diff.js';

describe('view diff', () => {
  const a = {
    phase: 'lobby',
    players: [{ id: 'p1', name: 'Sam', presence: 'connected' }],
    settings: { spice: 'chill', games: ['a', 'b'] },
    claims: [] as unknown[],
    gone: true,
  };

  it('produces no ops for equal values', () => {
    expect(diff(a, structuredClone(a))).toEqual([]);
  });

  it('round-trips arbitrary changes', () => {
    const b = {
      phase: 'intro',
      players: [{ id: 'p1', name: 'Sam', presence: 'reconnecting' }],
      settings: { spice: 'spicy', games: ['a'] },
      claims: [{ claimId: 'c1' }],
      extra: { nested: [1, 2] },
    };
    const ops = diff(a, b);
    expect(applyPatch(a, ops)).toEqual(b);
    expect(ops.some((o) => o.op === 'del')).toBe(true);
  });

  it('keeps identity of untouched branches', () => {
    const b = { ...a, phase: 'intro' };
    const out = applyPatch(a, diff(a, b));
    expect(out.players).toBe(a.players);
    expect(out.phase).toBe('intro');
    expect(a.phase).toBe('lobby');
  });

  it('handles type changes and array deletes', () => {
    expect(applyPatch({ x: [1] }, diff({ x: [1] }, { x: { y: 1 } }))).toEqual({ x: { y: 1 } });
    expect(applyPatch([1, 2, 3], [{ op: 'del', path: [1] }])).toEqual([1, 3]);
    expect(applyPatch(5, diff(5, 'five'))).toBe('five');
    expect(applyPatch({ a: 1 }, [{ op: 'set', path: ['b', 'c'], value: 2 }])).toEqual({
      a: 1,
      b: { c: 2 },
    });
  });
});

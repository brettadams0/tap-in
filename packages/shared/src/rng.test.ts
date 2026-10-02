import { describe, expect, it } from 'vitest';
import { createRng, seedFromString } from './rng.js';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng('party');
    const b = createRng('party');
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
  });

  it('differs between seeds', () => {
    expect(createRng('a').next()).not.toEqual(createRng('b').next());
  });

  it('resumes exactly from a saved state', () => {
    const a = createRng('resume');
    a.next();
    a.next();
    const b = createRng(a.state());
    expect(b.next()).toEqual(a.next());
  });

  it('produces floats in [0,1) and ints in range', () => {
    const r = createRng(seedFromString('range'));
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(5);
      expect(Number.isInteger(n) && n >= 0 && n < 5).toBe(true);
    }
  });

  it('shuffles without losing items and picks from the list', () => {
    const r = createRng('shuffle');
    const items = [1, 2, 3, 4, 5, 6];
    expect(r.shuffle(items).sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
    expect(items).toContain(r.pick(items));
    expect(() => r.pick([])).toThrow();
  });
});

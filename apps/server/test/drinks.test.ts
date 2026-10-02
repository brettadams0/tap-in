import { describe, expect, it } from 'vitest';
import type { RoundResult } from '@tap-in/games';
import { applyFairnessCap, buildResults, drinkersOf } from '../src/engine/drinks.js';

const base: Omit<RoundResult<unknown>, 'reveal' | 'assigned'> = {
  selfInflicted: [],
  everyone: false,
  ranking: [],
  nobody: null,
};
const all = ['p1', 'p2', 'p3', 'p4'];

describe('fairness cap', () => {
  it('excuses a capped player while the other drinkers still drink', () => {
    const { drink, streak } = applyFairnessCap(
      {
        ...base,
        assigned: [
          { id: 'p1', reason: 'smallerSide' },
          { id: 'p2', reason: 'smallerSide' },
        ],
      },
      all,
      { p1: 2, p2: 1 },
    );
    expect(drink.drinkers).toEqual([{ id: 'p2', reason: 'smallerSide' }]);
    expect(drink.saves).toEqual([{ saved: 'p1', by: null }]);
    expect(streak).toEqual({ p1: 0, p2: 2, p3: 0, p4: 0 });
  });

  it('redirects to the next-worst in the ranking when nobody is left', () => {
    const { drink, streak } = applyFairnessCap(
      {
        ...base,
        assigned: [{ id: 'p1', reason: 'slowest' }],
        selfInflicted: [{ id: 'p2', reason: 'early' }],
        ranking: ['p1', 'p2', 'p3', 'p4'],
      },
      all,
      { p1: 2 },
    );
    expect(drink.drinkers).toEqual([
      { id: 'p3', reason: 'covering' },
      { id: 'p2', reason: 'early' },
    ]);
    expect(drink.saves).toEqual([{ saved: 'p1', by: 'p3' }]);
    expect(streak.p3).toBe(1);
  });

  it('never caps self-inflicted or everyone-drinks moments', () => {
    const self = applyFairnessCap(
      { ...base, assigned: [], selfInflicted: [{ id: 'p1', reason: 'early' }] },
      all,
      { p1: 5 },
    );
    expect(self.drink.drinkers).toEqual([{ id: 'p1', reason: 'early' }]);
    const everyone = applyFairnessCap({ ...base, assigned: [], everyone: true }, all, {});
    expect(everyone.drink.nobody).toBeNull();
    expect(drinkersOf(everyone.drink, all)).toEqual(all);
    const balanced = applyFairnessCap({ ...base, assigned: [], nobody: 'balanced' }, all, {});
    expect(balanced.drink.nobody).toBe('balanced');
  });
});

describe('results', () => {
  it('awards most drinks, fastest thumbs and a clean record', () => {
    const r = buildResults(all, { p1: 3, p2: 1, p3: 3, p4: 0 }, { p2: [200, 300], p4: [180] }, [
      'wouldYouRather',
    ]);
    expect(r.standings.map((s) => s.id)).toEqual(['p1', 'p3', 'p2', 'p4']);
    expect(r.awards).toEqual([
      { id: 'mostDrinks', players: ['p1', 'p3'], detail: '3 drinks' },
      { id: 'fastestThumbs', players: ['p4'], detail: '180 ms average' },
      { id: 'cleanRecord', players: ['p4'], detail: '0 drinks' },
    ]);
  });

  it('skips awards nobody earned', () => {
    expect(buildResults(all, {}, {}, []).awards).toEqual([]);
    const one = buildResults(['p1', 'p2'], { p1: 1, p2: 1 }, {}, []);
    expect(one.awards).toEqual([{ id: 'mostDrinks', players: ['p1', 'p2'], detail: '1 drink' }]);
    expect(buildResults(['p1', 'p2'], { p1: 2, p2: 1 }, {}, []).awards[1]?.detail).toBe('1 drink');
  });
});

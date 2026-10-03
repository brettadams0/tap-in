import { describe, expect, it } from 'vitest';
import type { RoundResult } from '@tap-in/games';
import {
  applyFairnessCap,
  buildResults,
  drinkersOf,
  type SessionStats,
} from '../src/engine/drinks.js';

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
    expect(everyone.drink.spared).toBeNull();
    const balanced = applyFairnessCap({ ...base, assigned: [], nobody: 'balanced' }, all, {});
    expect(balanced.drink.nobody).toBe('balanced');
  });
});

describe('everyone except…', () => {
  it('spares the escapee, never caps the group and leaves streaks alone', () => {
    const { drink, streak } = applyFairnessCap(
      { ...base, assigned: [], everyone: true, spared: { ids: ['p2'], why: 'imposterEscaped' } },
      all,
      { p1: 2, p3: 2 },
    );
    expect(drink.everyone).toBe(true);
    expect(drink.spared).toEqual({ ids: ['p2'], why: 'imposterEscaped' });
    expect(drink.saves).toEqual([]);
    expect(drinkersOf(drink, all)).toEqual(['p1', 'p3', 'p4']);
    expect(streak).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it('ignores a spared list without everyone', () => {
    const { drink } = applyFairnessCap(
      {
        ...base,
        assigned: [{ id: 'p1', reason: 'caught' }],
        spared: { ids: ['p2'], why: 'outsiderEscaped' },
      },
      all,
      {},
    );
    expect(drink.spared).toBeNull();
    expect(drinkersOf(drink, all)).toEqual(['p1']);
  });
});

const stats = (over: Partial<SessionStats> = {}): SessionStats => ({
  reactionMs: {},
  liarPoints: {},
  chaos: {},
  taps: {},
  ...over,
});

describe('results', () => {
  it('awards most drinks, fastest thumbs and a clean record', () => {
    const r = buildResults(
      all,
      { p1: 3, p2: 1, p3: 3, p4: 0 },
      ['wouldYouRather'],
      stats({ reactionMs: { p2: [200, 300], p4: [180] } }),
    );
    expect(r.standings.map((s) => s.id)).toEqual(['p1', 'p3', 'p2', 'p4']);
    expect(r.awards).toEqual([
      { id: 'mostDrinks', players: ['p1', 'p3'], detail: '3 drinks' },
      { id: 'fastestThumbs', players: ['p4'], detail: '180 ms average' },
      { id: 'cleanRecord', players: ['p4'], detail: '0 drinks' },
    ]);
  });

  it('awards best liar for the most people fooled', () => {
    const r = buildResults(
      all,
      { p1: 1, p2: 1, p3: 1, p4: 1 },
      [],
      stats({ liarPoints: { p2: 3, p3: 1 } }),
    );
    expect(r.awards).toEqual([
      { id: 'mostDrinks', players: all, detail: '1 drink' },
      { id: 'bestLiar', players: ['p2'], detail: '3 lies landed' },
    ]);
    expect(buildResults(all, {}, [], stats({ liarPoints: { p1: 1 } })).awards[0]?.detail).toBe(
      '1 lie landed',
    );
  });

  it('awards most chaotic for early taps, collisions, dodged dares and Nope votes', () => {
    const r = buildResults(all, {}, [], stats({ chaos: { p1: 2, p3: 4, p4: 4 } }));
    expect(r.awards).toEqual([
      { id: 'mostChaotic', players: ['p3', 'p4'], detail: '4 chaos points' },
    ]);
    expect(buildResults(all, {}, [], stats({ chaos: { p2: 1 } })).awards[0]?.detail).toBe(
      '1 chaos point',
    );
  });

  it('fastest thumbs counts Tap Race taps per second, alone or with reaction times', () => {
    const tapsOnly = buildResults(
      all,
      {},
      [],
      stats({ taps: { p1: [40, 50], p2: [60], p3: [0] } }),
    );
    expect(tapsOnly.awards).toEqual([
      { id: 'fastestThumbs', players: ['p2'], detail: '12 taps a second' },
    ]);
    // Ranks added up: p1 0 + 1, p2 2 + 0, p3 1 + 2; p4 never played (last in both).
    const both = buildResults(
      all,
      {},
      [],
      stats({
        reactionMs: { p1: [150], p2: [400], p3: [200] },
        taps: { p1: [50], p2: [60], p3: [40] },
      }),
    );
    expect(both.awards).toEqual([
      { id: 'fastestThumbs', players: ['p1'], detail: '150 ms average · 10 taps a second' },
    ]);
  });

  it('skips awards nobody earned', () => {
    expect(buildResults(all, {}, [], stats()).awards).toEqual([]);
    const one = buildResults(['p1', 'p2'], { p1: 1, p2: 1 }, [], stats());
    expect(one.awards).toEqual([{ id: 'mostDrinks', players: ['p1', 'p2'], detail: '1 drink' }]);
    expect(buildResults(['p1', 'p2'], { p1: 2, p2: 1 }, [], stats()).awards[1]?.detail).toBe(
      '1 drink',
    );
  });
});

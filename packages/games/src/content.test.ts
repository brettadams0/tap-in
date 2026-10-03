import { createRng, GAME_IDS } from '@tap-in/shared';
import { describe, expect, it } from 'vitest';
import { allowedAt, pickEntry, wyrBank } from './content.js';
import { GAMES, playableGames } from './registry.js';

describe('content', () => {
  it('higher spice includes lower', () => {
    expect(allowedAt('chill', 'unhinged')).toBe(true);
    expect(allowedAt('unhinged', 'chill')).toBe(false);
    expect(allowedAt('spicy', 'spicy')).toBe(true);
  });

  it('never repeats a prompt until the bank runs dry, then starts over', () => {
    const rng = createRng('bank');
    const used: string[] = [];
    const chill = wyrBank.filter((e) => e.spice === 'chill');
    const seen = new Set<string>();
    for (let i = 0; i < chill.length; i++) {
      const e = pickEntry(wyrBank, { spice: 'chill', used, rng, skipped: [] });
      expect(e.spice).toBe('chill');
      seen.add(e.id);
    }
    expect(seen.size).toBe(chill.length);
    pickEntry(wyrBank, { spice: 'chill', used, rng, skipped: [] });
    expect(used).toHaveLength(1);
    expect(() => pickEntry([], { spice: 'chill', used: [], rng, skipped: [] })).toThrow();
  });

  it('never deals a skipped prompt again, unless nothing else is left', () => {
    const rng = createRng('skip');
    const chill = wyrBank.filter((e) => e.spice === 'chill');
    const skipped = chill.slice(1).map((e) => e.id);
    const used: string[] = [];
    for (let i = 0; i < 5; i++) {
      expect(pickEntry(wyrBank, { spice: 'chill', used, rng, skipped }).id).toBe(chill[0]?.id);
    }
    const all = chill.map((e) => e.id);
    const tiny = [chill[0], chill[1]].filter((e) => e !== undefined);
    expect(all).toContain(pickEntry(tiny, { spice: 'chill', used: [], rng, skipped: all }).id);
  });

  it('registers the playable games', () => {
    expect(Object.keys(GAMES).sort()).toEqual([...GAME_IDS].sort());
    expect(playableGames(['tapRace', 'wouldYouRather'])).toEqual(['tapRace', 'wouldYouRather']);
  });
});

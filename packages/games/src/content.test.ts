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
      const e = pickEntry(wyrBank, 'chill', used, rng);
      expect(e.spice).toBe('chill');
      seen.add(e.id);
    }
    expect(seen.size).toBe(chill.length);
    pickEntry(wyrBank, 'chill', used, rng);
    expect(used).toHaveLength(1);
    expect(() => pickEntry([], 'chill', [], rng)).toThrow();
  });

  it('registers the playable games', () => {
    expect(Object.keys(GAMES).sort()).toEqual([...GAME_IDS].sort());
    expect(playableGames(['tapRace', 'wouldYouRather'])).toEqual(['tapRace', 'wouldYouRather']);
  });
});

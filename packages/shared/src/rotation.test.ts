import { describe, expect, it } from 'vitest';
import { GAME_META } from './games.js';
import { createRng } from './rng.js';
import { cyclePool, pickNextGame } from './rotation.js';
import { GAME_IDS, type GameId } from './settings.js';

function play(enabled: GameId[], blocks: number, seed: string): GameId[] {
  const rng = createRng(seed);
  const history: GameId[] = [];
  for (let i = 0; i < blocks; i++) history.push(pickNextGame(history, enabled, rng));
  return history;
}

describe('rotation', () => {
  it('never repeats a game until every enabled game has played (property)', () => {
    const rng = createRng('subsets');
    for (let trial = 0; trial < 300; trial++) {
      const enabled = rng.shuffle(GAME_IDS).slice(0, 2 + rng.int(GAME_IDS.length - 1));
      const history = play(enabled, enabled.length * 3, `t${String(trial)}`);
      for (let c = 0; c < 3; c++) {
        const cycle = history.slice(c * enabled.length, (c + 1) * enabled.length);
        expect(new Set(cycle).size).toBe(enabled.length);
      }
      for (let i = 1; i < history.length; i++) expect(history[i]).not.toBe(history[i - 1]);
    }
  });

  it('puts a quick game in every 3rd slot and avoids speed pairs when it can', () => {
    const history = play([...GAME_IDS], 9, 'all');
    for (const i of [2, 5, 8]) expect(GAME_META[history[i] as GameId].quick).toBe(true);
    for (let i = 1; i < history.length; i++) {
      const a = GAME_META[history[i - 1] as GameId].energy;
      const b = GAME_META[history[i] as GameId].energy;
      expect(a === 'speed' && b === 'speed').toBe(false);
      expect(a === 'typing' && b === 'typing').toBe(false);
    }
  });

  it('relaxes soft rules instead of failing', () => {
    const enabled: GameId[] = ['reactionShotgun', 'tapRace'];
    const history = play(enabled, 6, 'speedy');
    expect(history).toHaveLength(6);
  });

  it('works out the current cycle', () => {
    expect(cyclePool([], ['tapRace', 'countdown'])).toEqual(['tapRace', 'countdown']);
    expect(cyclePool(['tapRace'], ['tapRace', 'countdown'])).toEqual(['countdown']);
    expect(cyclePool(['tapRace', 'countdown'], ['tapRace', 'countdown'])).toHaveLength(2);
    expect(() => pickNextGame([], [], createRng('x'))).toThrow();
  });
});

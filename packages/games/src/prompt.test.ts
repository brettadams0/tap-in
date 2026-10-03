import { describe, expect, it } from 'vitest';
import { GAMES } from './registry.js';
import { testCtx } from './testCtx.js';

/** Skip-prompt flag (R17): which step of each banked game shows a flaggable prompt. */
const FLAG_STEPS = {
  wouldYouRather: 'vote',
  liarsPrompt: 'answer',
  secretWord: 'hint',
  fakeAnswer: 'write',
  rankIt: 'rank',
  spinTheBottle: 'choice',
  fillInTheBlank: 'write',
} as const;

describe('prompt(): what a player may flag', () => {
  for (const [gameId, flagStep] of Object.entries(FLAG_STEPS)) {
    it(`${gameId}: only during ${flagStep}`, () => {
      const game = GAMES[gameId as keyof typeof FLAG_STEPS];
      if (!game?.prompt) throw new Error(`${gameId} has no prompt()`);
      const ctx = testCtx(['p1', 'p2', 'p3', 'p4', 'p5']);
      let s = game.startRound(game.init(ctx), ctx);
      const seen = new Set<string>();
      for (let i = 0; i < 20 && !game.roundOver(s); i++) {
        const ref = game.prompt(s);
        if (ref) {
          expect(game.step(s)).toBe(flagStep);
          expect(ref.bankId).toBe(gameId);
          expect(ctx.used).toContain(ref.promptId);
          seen.add(ref.promptId);
        } else expect(game.step(s)).not.toBe(flagStep);
        s = game.onTimer(s, ctx);
      }
      expect(seen.size).toBe(1);
      expect(game.prompt(s)).toBeNull();
    });
  }

  it('speed games and Two Truths have nothing to flag', () => {
    for (const id of ['reactionShotgun', 'tapRace', 'countdown', 'twoTruths'] as const) {
      expect(GAMES[id] && 'prompt' in GAMES[id]).toBe(false);
    }
  });
});

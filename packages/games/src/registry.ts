/** Every playable game. Adding a game = a folder, its content file and one line here. */
import type { GameId, PlayableGameId } from '@tap-in/shared';
import { countdown } from './countdown/index.js';
import { fakeAnswer } from './fakeAnswer/index.js';
import { fillInTheBlank } from './fillInTheBlank/index.js';
import { liarsPrompt } from './liarsPrompt/index.js';
import { rankIt } from './rankIt/index.js';
import { reactionShotgun } from './reactionShotgun/index.js';
import { secretWord } from './secretWord/index.js';
import { spinTheBottle } from './spinTheBottle/index.js';
import { tapRace } from './tapRace/index.js';
import { twoTruths } from './twoTruths/index.js';
import type { GameModule } from './types.js';
import { wouldYouRather } from './wouldYouRather/index.js';

/** Erased module type the engine works with: state is opaque JSON. */
export type AnyGame = GameModule<PlayableGameId, unknown>;

export const GAMES: Partial<Record<GameId, AnyGame>> = {
  wouldYouRather: wouldYouRather,
  reactionShotgun: reactionShotgun,
  liarsPrompt: liarsPrompt,
  twoTruths: twoTruths,
  secretWord: secretWord,
  fakeAnswer: fakeAnswer,
  rankIt: rankIt,
  tapRace: tapRace,
  spinTheBottle: spinTheBottle,
  fillInTheBlank: fillInTheBlank,
  countdown: countdown,
};

export function playableGames(enabled: readonly GameId[]): GameId[] {
  return enabled.filter((g) => GAMES[g] !== undefined);
}

/** Every playable game. Adding a game = a folder, its content file and one line here. */
import type { GameId, PlayableGameId } from '@tap-in/shared';
import { reactionShotgun } from './reactionShotgun/index.js';
import type { GameModule } from './types.js';
import { wouldYouRather } from './wouldYouRather/index.js';

/** Erased module type the engine works with: state is opaque JSON. */
export type AnyGame = GameModule<PlayableGameId, unknown>;

export const GAMES: Partial<Record<GameId, AnyGame>> = {
  wouldYouRather: wouldYouRather,
  reactionShotgun: reactionShotgun,
};

export function playableGames(enabled: readonly GameId[]): GameId[] {
  return enabled.filter((g) => GAMES[g] !== undefined);
}

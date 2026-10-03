export const GAME_IDS = [
  'wouldYouRather',
  'rankIt',
  'liarsPrompt',
  'twoTruths',
  'secretWord',
  'fakeAnswer',
  'reactionShotgun',
  'tapRace',
  'spinTheBottle',
  'fillInTheBlank',
  'countdown',
] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_NAMES: Record<GameId, string> = {
  wouldYouRather: 'Would You Rather',
  rankIt: 'Rank It',
  liarsPrompt: "Liar's Prompt",
  twoTruths: 'Two Truths, One App',
  secretWord: 'Secret Word',
  fakeAnswer: 'Fake Answer',
  reactionShotgun: 'Reaction Shotgun',
  tapRace: 'Tap Race',
  spinTheBottle: 'Spin the Bottle',
  fillInTheBlank: 'Fill in the Blank',
  countdown: 'Countdown',
};

/** Games playable in this build. All 11 ship from phase 4 on; the lobby still marks any not listed "Soon". */
export const READY_GAMES: readonly GameId[] = GAME_IDS;

export const SPICE_LEVELS = ['chill', 'spicy', 'unhinged'] as const;
export type Spice = (typeof SPICE_LEVELS)[number];

export const SESSION_LENGTHS = ['short', 'standard', 'long'] as const;
export type SessionLength = (typeof SESSION_LENGTHS)[number];

export const SESSION_MINUTES: Record<SessionLength, number> = { short: 15, standard: 30, long: 45 };

export interface RoomSettings {
  spice: Spice;
  length: SessionLength;
  games: GameId[];
  reactions: boolean;
}

export const MIN_ENABLED_GAMES = 1;

export function defaultSettings(): RoomSettings {
  return { spice: 'chill', length: 'standard', games: [...GAME_IDS], reactions: true };
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

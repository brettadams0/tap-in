/**
 * Per-game metadata and the shapes of each game's views (PLAN.md §4).
 * Types and constants only: game logic lives server-side in @tap-in/games.
 */
import type { GameId } from './settings.js';
import type { PlayerId } from './protocol.js';

export type GameEnergy = 'speed' | 'typing' | 'social' | 'luck' | 'group';

export interface GameMeta {
  /** One-line rule for the title card. */
  rule: string;
  energy: GameEnergy;
  /** Eligible for the "every 3rd block is a quick one" slot. */
  quick: boolean;
  /** DESIGN.md §2 game ink. */
  ink: string;
  icon: string;
}

export const GAME_META: Record<GameId, GameMeta> = {
  wouldYouRather: {
    rule: 'Pick a side. The smaller side drinks.',
    energy: 'social',
    quick: false,
    ink: '#FF5FA8',
    icon: '⚖️',
  },
  rankIt: {
    rule: 'Rank the four. Furthest from the group drinks.',
    energy: 'social',
    quick: false,
    ink: '#FFB81C',
    icon: '🎟️',
  },
  liarsPrompt: {
    rule: 'One of you got a different question. Find the liar.',
    energy: 'typing',
    quick: false,
    ink: '#5FE0B7',
    icon: '🤥',
  },
  twoTruths: {
    rule: 'Two truths and one fake. Spot the fake.',
    energy: 'social',
    quick: false,
    ink: '#6EC3FF',
    icon: '🃏',
  },
  secretWord: {
    rule: "Everyone knows the word except one. Hint, don't tell.",
    energy: 'typing',
    quick: false,
    ink: '#C49BFF',
    icon: '🤫',
  },
  fakeAnswer: {
    rule: 'Write a fake answer. Fool the room.',
    energy: 'typing',
    quick: false,
    ink: '#FF8A3D',
    icon: '🎭',
  },
  reactionShotgun: {
    rule: 'Wait for the flash, then tap. Too early or slowest drinks.',
    energy: 'speed',
    quick: true,
    ink: '#D4FF3A',
    icon: '⚡',
  },
  tapRace: {
    rule: 'Tap as fast as you can. Fewest taps drinks.',
    energy: 'speed',
    quick: true,
    ink: '#FF4D3D',
    icon: '👆',
  },
  spinTheBottle: {
    rule: 'The bottle picks. Dare or Drink.',
    energy: 'luck',
    quick: true,
    ink: '#4BD866',
    icon: '🍾',
  },
  fillInTheBlank: {
    rule: 'Fill the blank. Fewest votes drinks.',
    energy: 'typing',
    quick: false,
    ink: '#FFEE55',
    icon: '✏️',
  },
  countdown: {
    rule: 'Count to the top together. Same time? You collide.',
    energy: 'group',
    quick: true,
    ink: '#8FA2FF',
    icon: '🔢',
  },
};

// ------------------------------------------------------------------ Would You Rather

export type WyrSide = 'a' | 'b';

export interface WyrPublic {
  a: string;
  b: string;
}
export interface WyrPrivate {
  choice: WyrSide | null;
}
export interface WyrReveal {
  a: PlayerId[];
  b: PlayerId[];
  /** Connected players who never voted. */
  noVote: PlayerId[];
}
export type WyrInput = { side: WyrSide };

// ------------------------------------------------------------------ Reaction Shotgun

/** `ready`: wait for it. `fake`: a fake-out flash is scheduled. `armed`: the real flash is scheduled. */
export type ShotgunStep = 'ready' | 'fake' | 'armed';

export interface ShotgunPublic {
  /** Server time of the fake-out flash, once it is within the cue lead time. */
  fakeAt: number | null;
  /** Server time of the real flash, once it is within the cue lead time. */
  flashAt: number | null;
}
export interface ShotgunPrivate {
  tapped: boolean;
  early: boolean;
  ms: number | null;
}
export interface ShotgunEntry {
  id: PlayerId;
  /** Reaction time in ms, or null for early / no tap. */
  ms: number | null;
  early: boolean;
}
export interface ShotgunReveal {
  /** Fastest first; early taps and no-taps at the end. */
  board: ShotgunEntry[];
  hadFake: boolean;
}
/** `ms` is measured on the phone from the flash frame to the tap; null means "tapped before any real flash". */
export type ShotgunInput = { ms: number | null };

// ------------------------------------------------------------------ unions

export interface GameViews {
  wouldYouRather: { pub: WyrPublic; me: WyrPrivate; reveal: WyrReveal; input: WyrInput };
  reactionShotgun: {
    pub: ShotgunPublic;
    me: ShotgunPrivate;
    reveal: ShotgunReveal;
    input: ShotgunInput;
  };
}

export type PlayableGameId = keyof GameViews;

/** The game slice of a player's view, discriminated by `gameId`. */
export type PlayView = {
  [K in PlayableGameId]: {
    gameId: K;
    step: string;
    pub: GameViews[K]['pub'];
    me: GameViews[K]['me'];
    reveal: GameViews[K]['reveal'] | null;
  };
}[PlayableGameId];

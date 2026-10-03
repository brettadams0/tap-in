/**
 * Reactions (DESIGN.md §12): 8 fixed emoji and Kind / Funny / Glaze notes from fixed pools.
 * No free text, so nothing rude can be typed. Client-safe (no Zod): the phone needs the pools to
 * deal lines, and the server needs them to check a note id and resolve its words.
 * Exported as '@tap-in/shared/reactions' so the pools ride in the game chunk, not the first load.
 */
import reactionsJson from '../../../content/reactions.v1.json';
import type { PlayerId, RoomView } from './protocol.js';
import { SPICE_LEVELS, type GameId, type Spice } from './settings.js';

export const REACTION_EMOJI = ['😂', '❤️', '🤣', '👍', '😭', '🙏', '😘', '🔥'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

export const NOTE_TABS = ['kind', 'funny', 'glaze'] as const;
export type NoteTab = (typeof NOTE_TABS)[number];

export interface NoteEntry {
  id: string;
  spice: Spice;
  tab: NoteTab;
  line: string;
}

export const NOTES: readonly NoteEntry[] = (reactionsJson as { entries: NoteEntry[] }).entries;

/** A note at or below the room's spice, by id. */
export function findNote(id: string, roomSpice: Spice): NoteEntry | undefined {
  const note = NOTES.find((n) => n.id === id);
  if (!note) return undefined;
  return SPICE_LEVELS.indexOf(note.spice) <= SPICE_LEVELS.indexOf(roomSpice) ? note : undefined;
}

/** Server rate limits (DECISIONS R25). */
export const REACT_GAP_MS = 3000;
export const REACT_PER_TARGET_PER_MIN = 4;
/** A queued reaction older than this is dropped instead of shown (R23). */
export const REACT_STALE_MS = 20_000;

/** Speed games never take reactions: hands are busy. */
const NO_REACTIONS: ReadonlySet<GameId> = new Set(['reactionShotgun', 'tapRace', 'countdown']);

/**
 * Does this player have time for a reaction right now (to send one, or to see one)? Never while
 * they still owe an answer, during title cards, during speed games or during their own Drink
 * takeover (DESIGN §12, R23). The server and the phone use the same rule.
 */
export function canReact(view: RoomView, playerId: PlayerId): boolean {
  if (!view.settings.reactions) return false;
  const s = view.session;
  switch (view.phase) {
    case 'lobby':
    case 'results':
    case 'gameOutro':
    case 'roundReveal':
      return true;
    case 'drink': {
      const d = s?.drink;
      if (!d) return true;
      const drinking = d.everyone
        ? !(d.spared?.ids.includes(playerId) ?? false)
        : d.drinkers.some((x) => x.id === playerId);
      return !drinking;
    }
    case 'roundInput': {
      if (!s || s.overlay) return true;
      if (s.gameId && NO_REACTIONS.has(s.gameId)) return false;
      const owes = s.participants.includes(playerId) && !s.locked.includes(playerId);
      return !owes;
    }
    default:
      return false;
  }
}

/**
 * Wire protocol shared by client and server (PLAN.md §5).
 * Types only: runtime validation lives in ./schemas.ts and is used by the server.
 */
import type { Avatar, CapColor } from './avatar.js';
import type { RoomSettings } from './settings.js';
import type { PatchOp } from './diff.js';
import type { PlayView } from './games.js';
import type { GameId } from './settings.js';

export const PROTOCOL_VERSION = 1;

export type PlayerId = string;
export type RoomCode = string;

export type RoomPhase =
  | 'lobby'
  | 'intro'
  | 'gameIntro'
  | 'roundInput'
  | 'roundReveal'
  | 'drink'
  | 'gameOutro'
  | 'results';

/** connected · reconnecting (grey badge) · gone (out of rotation after 3 min away). */
export type Presence = 'connected' | 'reconnecting' | 'gone';

export interface PlayerView {
  id: PlayerId;
  name: string;
  avatar: Avatar;
  presence: Presence;
  isHost: boolean;
}

export interface ClaimView {
  claimId: string;
  playerId: PlayerId;
  name: string;
}

/** Everything one player is allowed to see. Built per player by the server. */
export interface RoomView {
  protocol: number;
  code: RoomCode;
  phase: RoomPhase;
  /** Absolute server time the current phase ends, or null. */
  phaseEndsAt: number | null;
  hostId: PlayerId | null;
  players: PlayerView[];
  settings: RoomSettings;
  you: { id: PlayerId };
  /** Pending seat claims. Only ever non-empty for the host. */
  claims: ClaimView[];
  /** Server time the current phase's synced moment lands (title slam, reveal hit, Drink). */
  phaseAt: number;
  /** Null in the lobby. */
  session: SessionView | null;
}

export type DrinkReason =
  | 'smallerSide'
  | 'noVote'
  | 'early'
  | 'slowest'
  | 'noTap'
  /** The imposter or outsider was voted out. */
  | 'caught'
  /** The caught outsider guessed the secret word wrong. */
  | 'wrongGuess'
  /** Picked a fake (Two Truths, Fake Answer). */
  | 'fooled'
  /** Two Truths: nobody fell for the spotlight player's fake. */
  | 'nobodyFooled'
  | 'furthest'
  | 'fewestTaps'
  | 'fewestVotes'
  /** Countdown: tapped at the same time as someone else. */
  | 'collision'
  /** Spin the Bottle: picked Drink over the dare (or ran out of time to pick). */
  | 'choseDrink'
  /** Spin the Bottle: the room voted Nope on the dare. */
  | 'dareFailed'
  /** Connected, but never answered (R5). */
  | 'noAnswer'
  /** Took the drink for a player saved by the 2-in-a-row rule. */
  | 'covering';

export interface DrinkerView {
  id: PlayerId;
  reason: DrinkReason;
}

/** Why everyone but one player drinks. */
export type SpareReason = 'imposterEscaped' | 'outsiderEscaped' | 'outsiderGuessed';

export interface DrinkView {
  drinkers: DrinkerView[];
  everyone: boolean;
  /** "Everyone except…": with `everyone`, these players don't drink. */
  spared: { ids: PlayerId[]; why: SpareReason } | null;
  /** Why nobody drinks, when nobody does. */
  nobody: 'balanced' | 'lucky' | 'unanimous' | 'sharp' | 'counted' | 'dared' | null;
  /** Fairness cap: `saved` was excused this round; `by` drinks instead (or nobody). */
  saves: { saved: PlayerId; by: PlayerId | null }[];
}

export type OverlayKind = 'paused' | 'water' | 'waiting';

export interface OverlayView {
  kind: OverlayKind;
  /** When it lifts on its own, or null (waiting for players). */
  endsAt: number | null;
}

export type AwardId = 'mostDrinks' | 'fastestThumbs' | 'bestLiar' | 'cleanRecord';

export interface AwardView {
  id: AwardId;
  players: PlayerId[];
  /** e.g. "5 drinks", "212 ms average". */
  detail: string;
}

export interface ResultsView {
  /** Most drinks first. */
  standings: { id: PlayerId; drinks: number }[];
  awards: AwardView[];
  games: GameId[];
}

export interface SessionView {
  /** 1-based game block number. */
  block: number;
  gameId: GameId | null;
  round: number;
  rounds: number;
  play: PlayView | null;
  /** Players in this round. */
  participants: PlayerId[];
  /** Participants who have locked in for the current step. */
  locked: PlayerId[];
  drink: DrinkView | null;
  /** Drinkers who tapped Done. */
  done: PlayerId[];
  overlay: OverlayView | null;
  /** Session drink tally. */
  drinks: Record<PlayerId, number>;
  results: ResultsView | null;
}

/** Sent before a socket has an identity, so the client can show Join / Claim / Ended. */
export interface WelcomeInfo {
  code: RoomCode;
  phase: RoomPhase;
  joinable: boolean;
  full: boolean;
  takenColors: CapColor[];
  /** Seats that can be claimed (disconnected players). Only populated after the game started. */
  claimable: { id: PlayerId; name: string; avatar: Avatar }[];
}

export type HostAction =
  | { kind: 'settings'; settings: Partial<RoomSettings> }
  | { kind: 'start' }
  | { kind: 'remove'; playerId: PlayerId }
  | { kind: 'resolveClaim'; claimId: string; approve: boolean }
  | { kind: 'pause' }
  | { kind: 'resume' }
  /** Results → a fresh session with the same players. */
  | { kind: 'rematch' }
  /** Results → back to the lobby to change settings. */
  | { kind: 'lobby' }
  /** Wrap up now: finish to the results screen. */
  | { kind: 'end' };

export type ClientMessage =
  | { type: 'join'; name: string; avatar: Avatar }
  | { type: 'rejoin'; playerId: PlayerId; token: string }
  | { type: 'claim'; playerId: PlayerId }
  | { type: 'avatar'; avatar: Avatar }
  /** A game input for the current step (validated by that game's schema). */
  | { type: 'submit'; step: string; data: unknown }
  /** "Done" after a Drink. */
  | { type: 'ready' }
  | { type: 'hostAction'; action: HostAction }
  | { type: 'ping'; t0: number }
  | { type: 'resync' }
  | { type: 'leave' };

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'RATE_LIMITED'
  | 'NOT_JOINED'
  | 'ALREADY_JOINED'
  | 'LOBBY_LOCKED'
  | 'ROOM_FULL'
  | 'NAME_REJECTED'
  | 'COLOR_TAKEN'
  | 'BAD_TOKEN'
  | 'NOT_HOST'
  | 'NOT_ALLOWED'
  | 'NOT_ENOUGH_PLAYERS'
  | 'UNKNOWN_PLAYER'
  | 'WRONG_STEP'
  | 'REJECTED'
  | 'ROOM_ENDED';

export type EndReason = 'removed' | 'claimed' | 'expired' | 'left';

export type ServerMessage =
  | { type: 'welcome'; info: WelcomeInfo; serverTime: number }
  | { type: 'credentials'; code: RoomCode; playerId: PlayerId; token: string }
  | { type: 'state'; version: number; view: RoomView }
  | { type: 'patch'; base: number; version: number; ops: PatchOp[] }
  | { type: 'pong'; t0: number; serverTime: number }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'claimPending'; playerId: PlayerId }
  | { type: 'claimDenied'; playerId: PlayerId }
  | { type: 'sessionEnded'; reason: EndReason };

/** HTTP: POST /rooms → { code }. GET /rooms/:code → RoomStatus. */
export interface RoomStatus {
  exists: boolean;
  phase: RoomPhase | null;
  joinable: boolean;
}

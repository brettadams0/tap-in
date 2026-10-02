/**
 * Wire protocol shared by client and server (PLAN.md §5).
 * Types only: runtime validation lives in ./schemas.ts and is used by the server.
 */
import type { Avatar, CapColor } from './avatar.js';
import type { RoomSettings } from './settings.js';
import type { PatchOp } from './diff.js';

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
  | { kind: 'resolveClaim'; claimId: string; approve: boolean };

export type ClientMessage =
  | { type: 'join'; name: string; avatar: Avatar }
  | { type: 'rejoin'; playerId: PlayerId; token: string }
  | { type: 'claim'; playerId: PlayerId }
  | { type: 'avatar'; avatar: Avatar }
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

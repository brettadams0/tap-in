import {
  createRng,
  defaultSettings,
  type Avatar,
  type PlayerId,
  type RngState,
  type RoomCode,
  type RoomPhase,
  type RoomSettings,
} from '@tap-in/shared';

/** Timing rules from SPEC.md "Rejoin and resilience". */
export const HOST_TRANSFER_MS = 30_000;
export const GONE_AFTER_MS = 3 * 60_000;
export const ROOM_EXPIRY_MS = 30 * 60_000;
export const CLAIM_TIMEOUT_MS = 60_000;

export type PlayerStatus = 'active' | 'gone' | 'removed';

export interface PlayerRecord {
  id: PlayerId;
  name: string;
  avatar: Avatar;
  /** Reconnect secret. Lives only in Durable Object storage and on the owner's phone. */
  token: string;
  seat: number;
  joinedAt: number;
  connected: boolean;
  connectedSince: number | null;
  disconnectedAt: number | null;
  status: PlayerStatus;
}

export interface PendingClaim {
  claimId: string;
  playerId: PlayerId;
  connId: string;
  at: number;
}

/** The whole room. Persisted after every change, so it must stay JSON-serialisable. */
export interface RoomState {
  schema: 1;
  code: RoomCode;
  createdAt: number;
  version: number;
  phase: RoomPhase;
  phaseEndsAt: number | null;
  hostId: PlayerId | null;
  players: PlayerRecord[];
  nextSeat: number;
  settings: RoomSettings;
  claims: PendingClaim[];
  emptySince: number | null;
  ended: boolean;
  rng: RngState;
}

export function createRoomState(code: RoomCode, now: number, seed: string): RoomState {
  return {
    schema: 1,
    code,
    createdAt: now,
    version: 1,
    phase: 'lobby',
    phaseEndsAt: null,
    hostId: null,
    players: [],
    nextSeat: 0,
    settings: defaultSettings(),
    claims: [],
    emptySince: now,
    ended: false,
    rng: createRng(seed).state(),
  };
}

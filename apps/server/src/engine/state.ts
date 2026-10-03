import {
  createRng,
  defaultSettings,
  type Avatar,
  type DrinkView,
  type GameId,
  type OverlayKind,
  type ResultsView,
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

/** Phase lengths (ms, before time scaling). PLAN.md §3. */
export const LEAD_MS = 600;
export const INTRO_MS = 4200;
export const TITLE_MS = 3600;
export const DRINK_MS = 6500;
export const NOBODY_MS = 3200;
/** After every drinker taps Done, the Drink moment still holds at least this long. */
export const DRINK_MIN_MS = 1800;
export const OUTRO_MS = 3000;
export const PAUSE_MS = 60_000;
export const WATER_MS = 10_000;
export const WATER_EVERY_MS = 10 * 60_000;
/** Flags from different players that skip a prompt (SPEC "Stranger-safety"). */
export const FLAGS_TO_SKIP = 2;

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

export interface OverlayState {
  kind: OverlayKind;
  startedAt: number;
  endsAt: number | null;
  /** Time left on the frozen phase timer, or null when the overlay sits between phases. */
  remaining: number | null;
}

/** One run from Start to the results screen. */
export interface SessionState {
  startedAt: number;
  budgetMs: number;
  /** Game blocks so far, current one last. */
  history: GameId[];
  gameId: GameId | null;
  /** Opaque, JSON-serialisable state owned by the current game module. */
  game: unknown;
  round: number;
  rounds: number;
  participants: PlayerId[];
  used: Partial<Record<GameId, string[]>>;
  reveal: unknown;
  drink: DrinkView | null;
  done: PlayerId[];
  drinks: Record<PlayerId, number>;
  /** Consecutive rounds each player was assigned a drink (fairness cap). */
  streak: Record<PlayerId, number>;
  reactionMs: Record<PlayerId, number[]>;
  /** People fooled or escapes made, per player (Best liar award). Optional: older saved rooms lack it. */
  liarPoints?: Record<PlayerId, number>;
  /** Chaos points per player (Most chaotic). Optional: older saved rooms lack it. */
  chaos?: Record<PlayerId, number>;
  /** Rounds in a row each player stayed dry while someone drank (combo 🔥). Optional in old saves. */
  dry?: Record<PlayerId, number>;
  /** Tap Race counts per player (Fastest thumbs). Optional: older saved rooms lack it. */
  taps?: Record<PlayerId, number[]>;
  lastBreakAt: number;
  /** Skip-prompt flags on the current round's prompt (`bankId:promptId`). Optional in older saves. */
  flags?: { key: string; by: PlayerId[] } | null;
  /** Prompt ids skipped after two flags, per game: never dealt again this session. */
  skipped?: Partial<Record<GameId, string[]>>;
  /** The game state from just before this round started, so a skipped prompt can deal again. */
  roundBase?: unknown;
  /** When a prompt was last skipped (the phones show "Skipped"). */
  skippedAt?: number | null;
  overlay: OverlayState | null;
  results: ResultsView | null;
}

/** The whole room. Persisted after every change, so it must stay JSON-serialisable. */
export interface RoomState {
  schema: 1;
  code: RoomCode;
  createdAt: number;
  version: number;
  phase: RoomPhase;
  phaseEndsAt: number | null;
  /** When the current phase's synced moment lands. */
  phaseAt: number;
  hostId: PlayerId | null;
  players: PlayerRecord[];
  nextSeat: number;
  settings: RoomSettings;
  claims: PendingClaim[];
  emptySince: number | null;
  ended: boolean;
  rng: RngState;
  session: SessionState | null;
}

export function createRoomState(code: RoomCode, now: number, seed: string): RoomState {
  return {
    schema: 1,
    code,
    createdAt: now,
    version: 1,
    phase: 'lobby',
    phaseEndsAt: null,
    phaseAt: now,
    hostId: null,
    players: [],
    nextSeat: 0,
    settings: defaultSettings(),
    claims: [],
    emptySince: now,
    ended: false,
    rng: createRng(seed).state(),
    session: null,
  };
}

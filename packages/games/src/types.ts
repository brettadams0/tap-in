/**
 * The contract every mini-game implements (PLAN.md §4).
 * Games are pure: no I/O, no Date, no Math.random. Time and randomness come in through GameCtx,
 * and state must stay JSON-serialisable so a Durable Object can persist and restore it.
 */
import type {
  DrinkReason,
  GameViews,
  PlayableGameId,
  PlayerId,
  Rng,
  SessionLength,
  SpareReason,
  Spice,
} from '@tap-in/shared';
import type { ZodType } from 'zod';

export interface GameCtx {
  now: number;
  rng: Rng;
  /** Active players at the start of this round, in seat order. */
  players: readonly PlayerId[];
  /** Players with an open socket right now. */
  connected: readonly PlayerId[];
  spice: Spice;
  /** Prompt ids already used this session for this game's bank. The game appends to it. */
  used: string[];
  /** Prompt ids skipped this session after two flags: never dealt again (R17). */
  skipped: readonly string[];
  /** Scale a duration (tests and e2e run the clock faster). */
  ms(duration: number): number;
  /** Lead time a synced cue needs, in ms (never scaled). */
  lead: number;
  /** Players the fairness cap would excuse this round (Spin the Bottle never lands on them). */
  capped: readonly PlayerId[];
}

export interface Drinker {
  id: PlayerId;
  reason: DrinkReason;
}

export interface RoundResult<R> {
  /** Public reveal payload: everyone sees the same. */
  reveal: R;
  /** Drinks the game assigned (subject to the fairness cap). */
  assigned: Drinker[];
  /** Drinks players brought on themselves (early taps…). Never capped or redirected. */
  selfInflicted: Drinker[];
  everyone: boolean;
  /** With `everyone`: these players are let off ("everyone except the imposter"). Never capped. */
  spared?: { ids: PlayerId[]; why: SpareReason };
  /** Worst → best, for redirecting a capped drink. Empty when the game has no ranking. */
  ranking: PlayerId[];
  /** Why nobody drinks, when that's a designed outcome. */
  nobody: 'balanced' | 'unanimous' | 'sharp' | 'counted' | 'dared' | null;
  /** Per-player stats for the results screen (reaction ms, people fooled). */
  stats?: Record<PlayerId, { reactionMs?: number; liarPoints?: number }>;
}

/** The bank entry a round is showing, for the skip-prompt flag (R17). */
export interface PromptRef {
  bankId: string;
  promptId: string;
}

export interface Reject {
  reject: string;
}

export interface GameModule<K extends PlayableGameId, S> {
  id: K;
  inputSchema: ZodType<GameViews[K]['input']>;
  rounds(playerCount: number, length: SessionLength): number;
  /** Rough length of a whole block, for the session-length budget. */
  estimateMs(playerCount: number, length: SessionLength): number;
  /**
   * Once a block is under way, it may turn out shorter than `rounds` promised (Two Truths: only
   * players who typed their facts get a spotlight). Null = as planned.
   */
  plannedRounds?(s: S): number | null;
  /** How long the reveal phase holds before the Drink moment. */
  revealMs(playerCount: number): number;

  init(ctx: GameCtx): S;
  /** Set up the next round; the state carries its own step and deadline. */
  startRound(s: S, ctx: GameCtx): S;
  onInput(s: S, playerId: PlayerId, input: GameViews[K]['input'], ctx: GameCtx): S | Reject;
  /** Called once `deadline(s)` has passed (or early, once nobody connected is awaited). */
  onTimer(s: S, ctx: GameCtx): S;

  step(s: S): string;
  deadline(s: S): number | null;
  roundOver(s: S): boolean;
  /** Participants still expected to act in this step. */
  awaiting(s: S): PlayerId[];
  /** When everyone connected has acted, may the engine fire the timer early? */
  endsEarly(s: S): boolean;
  result(s: S, ctx: GameCtx): RoundResult<GameViews[K]['reveal']>;
  publicView(s: S): GameViews[K]['pub'];
  privateView(s: S, playerId: PlayerId): GameViews[K]['me'];
  /**
   * The prompt players are looking at, while it may still be flagged and skipped (the first input
   * step). Absent or null: nothing to flag (speed games, Two Truths' facts).
   */
  prompt?(s: S): PromptRef | null;
  /** Shift any absolute times in the state (after a pause). */
  shift(s: S, deltaMs: number): S;
}

export function isReject(v: unknown): v is Reject {
  return typeof v === 'object' && v !== null && 'reject' in v;
}

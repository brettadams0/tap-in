/** Pure client-side room state: applies server messages. Kept free of DOM/WebSocket for unit tests. */
import {
  applyPatch,
  type EndReason,
  type ReactionEvent,
  type RoomView,
  type ServerMessage,
  type WelcomeInfo,
} from '@tap-in/shared';

export type LinkStatus = 'connecting' | 'open' | 'reconnecting';

export interface ClientRoomState {
  code: string;
  link: LinkStatus;
  welcome: WelcomeInfo | null;
  view: RoomView | null;
  version: number;
  /** Set when the room is gone or this device's session ended. */
  ended: EndReason | 'notFound' | null;
  claim: { playerId: string; status: 'pending' | 'denied' } | null;
  error: { code: string; message: string; at: number } | null;
  /** Recent reactions, newest last (never part of the room view). */
  reactions: ReceivedReaction[];
}

export interface ReceivedReaction {
  seq: number;
  at: number;
  reaction: ReactionEvent;
}

/** How many recent reactions the phone remembers. */
const REACTION_MEMORY = 20;

export type Effect =
  | { kind: 'saveCredentials'; playerId: string; token: string }
  | { kind: 'clearCredentials' }
  | { kind: 'resync' };

export function initialState(code: string): ClientRoomState {
  return {
    code,
    link: 'connecting',
    welcome: null,
    view: null,
    version: 0,
    ended: null,
    claim: null,
    error: null,
    reactions: [],
  };
}

export function reduce(
  state: ClientRoomState,
  msg: ServerMessage,
  now: number,
): { state: ClientRoomState; effects: Effect[] } {
  switch (msg.type) {
    case 'welcome':
      return { state: { ...state, welcome: msg.info }, effects: [] };
    case 'credentials':
      return {
        state: { ...state, claim: null },
        effects: [{ kind: 'saveCredentials', playerId: msg.playerId, token: msg.token }],
      };
    case 'state':
      return {
        state: { ...state, view: msg.view, version: msg.version, claim: null },
        effects: [],
      };
    case 'patch':
      if (!state.view || msg.base !== state.version)
        return { state, effects: [{ kind: 'resync' }] };
      return {
        state: { ...state, view: applyPatch(state.view, msg.ops), version: msg.version },
        effects: [],
      };
    case 'claimPending':
      return {
        state: { ...state, claim: { playerId: msg.playerId, status: 'pending' } },
        effects: [],
      };
    case 'claimDenied':
      return {
        state: { ...state, claim: { playerId: msg.playerId, status: 'denied' } },
        effects: [],
      };
    case 'sessionEnded':
      return {
        state: { ...state, view: null, ended: msg.reason },
        effects: [{ kind: 'clearCredentials' }],
      };
    case 'error': {
      const error = { code: msg.code, message: msg.message, at: now };
      if (msg.code === 'ROOM_ENDED') {
        return {
          state: { ...state, ended: 'notFound', error },
          effects: [{ kind: 'clearCredentials' }],
        };
      }
      if (msg.code === 'BAD_TOKEN') {
        // Our saved seat is gone: forget it and fall back to the welcome screen.
        return { state: { ...state, view: null, error }, effects: [{ kind: 'clearCredentials' }] };
      }
      return { state: { ...state, error }, effects: [] };
    }
    case 'pong':
      return { state, effects: [] };
    case 'reaction': {
      const seq = (state.reactions.at(-1)?.seq ?? 0) + 1;
      const reactions = [...state.reactions, { seq, at: now, reaction: msg.reaction }];
      return { state: { ...state, reactions: reactions.slice(-REACTION_MEMORY) }, effects: [] };
    }
  }
}

/** Reconnect backoff: 0.5 s, 1 s, 2 s, 4 s, 8 s, then 10 s (SPEC "Reconnect flow"). */
export function backoffDelay(attempt: number): number {
  return Math.min(10_000, 500 * 2 ** attempt);
}

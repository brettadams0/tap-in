/**
 * One live link to a room. Owns the socket, reconnect backoff, saved credentials
 * and clock sync. React reads it through useSyncExternalStore (see useRoom).
 */
import {
  ClockSync,
  sampleFromPong,
  type Avatar,
  type ClientMessage,
  type HostAction,
  type ServerMessage,
} from '@tap-in/shared';
import { socketUrl } from './config.js';
import { backoffDelay, initialState, reduce, type ClientRoomState } from './reducer.js';
import { loadSession, saveSession } from './storage.js';

const PING_BURST = 5;
const PING_GAP_MS = 120;
const RESYNC_EVERY_MS = 30_000;

export class RoomConnection {
  readonly clock = new ClockSync();
  private state: ClientRoomState;
  private ws: WebSocket | null = null;
  private listeners = new Set<() => void>();
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(readonly code: string) {
    this.state = initialState(code);
  }

  // --- store contract for useSyncExternalStore
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): ClientRoomState => this.state;

  start(): void {
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.open();
  }

  stop(): void {
    this.stopped = true;
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }

  // --- actions
  join(name: string, avatar: Avatar): void {
    this.send({ type: 'join', name, avatar });
  }
  claim(playerId: string): void {
    this.send({ type: 'claim', playerId });
  }
  setAvatar(avatar: Avatar): void {
    this.send({ type: 'avatar', avatar });
  }
  host(action: HostAction): void {
    this.send({ type: 'hostAction', action });
  }
  leave(): void {
    this.send({ type: 'leave' });
  }
  clearError(): void {
    this.set({ ...this.state, error: null });
  }

  /**
   * Server "now" (epoch ms), estimated from the monotonic local clock.
   * Samples are stored on the performance.now() timeline, so add timeOrigin back.
   */
  serverNow(): number {
    return this.clock.toServer(performance.now()) + performance.timeOrigin;
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private set(next: ClientRoomState): void {
    this.state = next;
    for (const fn of this.listeners) fn();
  }

  private open(): void {
    if (this.stopped || this.state.ended) return;
    const ws = new WebSocket(socketUrl(this.code));
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.set({ ...this.state, link: 'open' });
      const session = loadSession();
      if (session?.roomCode === this.code) {
        this.send({ type: 'rejoin', playerId: session.playerId, token: session.reconnectToken });
      }
      this.syncClock();
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        this.syncClock();
      }, RESYNC_EVERY_MS);
    };
    ws.onmessage = (e: MessageEvent<string>) => {
      this.onMessage(JSON.parse(e.data) as ServerMessage);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.stopped || this.state.ended) return;
      this.set({ ...this.state, link: 'reconnecting' });
      this.retryTimer = setTimeout(() => {
        this.open();
      }, backoffDelay(this.attempt++));
    };
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.type === 'pong') {
      // performance.now() for both ends of the round trip; serverTime is epoch ms.
      this.clock.add(
        sampleFromPong(msg.t0, performance.now(), msg.serverTime - performance.timeOrigin),
      );
      return;
    }
    const { state, effects } = reduce(this.state, msg, Date.now());
    for (const fx of effects) {
      if (fx.kind === 'saveCredentials') {
        saveSession({ roomCode: this.code, playerId: fx.playerId, reconnectToken: fx.token });
      } else if (fx.kind === 'clearCredentials') {
        if (loadSession()?.roomCode === this.code) saveSession(null);
      } else {
        this.send({ type: 'resync' });
      }
    }
    if (state.ended) this.stop();
    this.set(state);
  }

  private syncClock(): void {
    for (let i = 0; i < PING_BURST; i++) {
      setTimeout(() => {
        this.send({ type: 'ping', t0: performance.now() });
      }, i * PING_GAP_MS);
    }
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState !== 'visible') return;
    // Phones drift and drop sockets while locked: re-sync and reconnect immediately.
    if (!this.ws && !this.stopped) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.attempt = 0;
      this.open();
    } else {
      this.syncClock();
    }
  };
}

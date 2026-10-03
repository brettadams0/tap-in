/** In-memory harness: drives RoomEngine with a fake clock and fake clients that apply patches like the real app. */
import {
  applyPatch,
  type Avatar,
  type ClientMessage,
  type RoomView,
  type ServerMessage,
} from '@tap-in/shared';
import { RoomEngine } from '../src/engine/engine.js';
import { createRoomState, type RoomState } from '../src/engine/state.js';

export const avatar = (color: Avatar['color'] = 'red'): Avatar => ({
  color,
  pattern: 'solid',
  eyes: 'dots',
  mouth: 'grin',
  topper: 'none',
});

export class FakeClient {
  inbox: ServerMessage[] = [];
  view: RoomView | null = null;
  version = 0;
  playerId: string | null = null;
  token: string | null = null;
  closed: { code: number; reason: string } | null = null;

  constructor(
    readonly connId: string,
    private readonly room: Harness,
  ) {}

  send(msg: ClientMessage | string): void {
    this.room.engine.message(this.connId, typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  receive(msg: ServerMessage): void {
    this.inbox.push(msg);
    if (msg.type === 'credentials') {
      this.playerId = msg.playerId;
      this.token = msg.token;
    } else if (msg.type === 'state') {
      this.view = msg.view;
      this.version = msg.version;
    } else if (msg.type === 'patch') {
      if (msg.base !== this.version || !this.view)
        throw new Error(`${this.connId}: version gap ${msg.base} vs ${this.version}`);
      this.view = applyPatch(this.view, msg.ops);
      this.version = msg.version;
    }
  }

  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.type === type) as
      | Extract<ServerMessage, { type: T }>
      | undefined;
  }

  errors(): string[] {
    return this.inbox.flatMap((m) => (m.type === 'error' ? [m.code] : []));
  }

  disconnect(): void {
    this.room.engine.disconnect(this.connId);
  }
}

export class Harness {
  time = 1_000_000;
  alarmAt: number | null = null;
  saved: RoomState | null = null;
  destroyed = false;
  /** Content-review log lines (skipped prompts). */
  readonly logs: Record<string, string>[] = [];
  readonly engine: RoomEngine;
  private readonly clients = new Map<string, FakeClient>();
  private seq = 0;
  private idSeq = 0;

  constructor(opts: { seed?: string; timeScale?: number } = {}) {
    const state = createRoomState('KZRP', this.time, opts.seed ?? 'seed');
    this.engine = new RoomEngine(state, {
      timeScale: opts.timeScale ?? 1,
      now: () => this.time,
      randomId: (bytes) => `id${++this.idSeq}`.padEnd(Math.max(bytes, 16), 'x'),
      send: (connId, msg) => this.clients.get(connId)?.receive(structuredClone(msg)),
      close: (connId, code, reason) => {
        const c = this.clients.get(connId);
        if (c) c.closed = { code, reason };
      },
      setAlarm: (at) => {
        this.alarmAt = at;
      },
      save: (s) => {
        this.saved = structuredClone(s);
      },
      destroy: () => {
        this.destroyed = true;
      },
      log: (entry) => this.logs.push(entry),
    });
  }

  connect(): FakeClient {
    const c = new FakeClient(`c${++this.seq}`, this);
    this.clients.set(c.connId, c);
    this.engine.connect(c.connId);
    return c;
  }

  join(name: string, color: Avatar['color'] = 'red'): FakeClient {
    const c = this.connect();
    c.send({ type: 'join', name, avatar: avatar(color) });
    return c;
  }

  /** Advance the fake clock, firing the alarm whenever it comes due. */
  advance(ms: number): void {
    const target = this.time + ms;
    while (this.alarmAt !== null && this.alarmAt <= target) {
      this.time = Math.max(this.time, this.alarmAt);
      this.alarmAt = null;
      this.engine.alarm();
    }
    this.time = target;
  }

  /** Step the clock in small slices until `done()` holds (fails after `maxMs`). */
  until(done: () => boolean, maxMs = 120_000, step = 50): void {
    let spent = 0;
    while (!done()) {
      if (spent > maxMs) throw new Error('until(): condition never held');
      this.advance(step);
      spent += step;
    }
  }
}

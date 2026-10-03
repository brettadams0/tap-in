/**
 * Node adapter: same engine and routes as the Worker, backed by `ws` and setTimeout.
 * Used for fast integration tests, Playwright e2e and local dev. Production runs the Worker.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { generateRoomCode, type RoomStatus } from '@tap-in/shared';
import { RoomEngine } from '../engine/engine.js';
import { createRoomState, type RoomState } from '../engine/state.js';
import { corsHeaders, isOriginAllowed, route } from '../http.js';

export interface NodeServerOptions {
  port?: number;
  allowedOrigins?: string;
  /** Injectable clock for tests. */
  now?: () => number;
  /** When false, alarms only fire via runDueAlarms() (fake-time tests). */
  realTimers?: boolean;
  /** Speeds up every game timer (e2e). Default 1. */
  timeScale?: number;
  /**
   * Test hooks (never in production, which runs the Worker): `POST /rooms?roundsPerGame=1`
   * creates a room that plays one round of each game, so one e2e can visit all eleven, and
   * `?timeScale=1` gives one room its own timer speed (visual baselines need real-length moments).
   */
  testHooks?: boolean;
}

interface NodeRoom {
  engine: RoomEngine;
  sockets: Map<string, WebSocket>;
  alarmAt: number | null;
  timer: NodeJS.Timeout | null;
  state: RoomState | null;
}

const randomId = (bytes: number): string => randomBytes(bytes).toString('base64url');

export class NodeRoomServer {
  readonly rooms = new Map<string, NodeRoom>();
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly now: () => number;
  private readonly realTimers: boolean;
  private readonly allowed: string;
  private connSeq = 0;

  constructor(private readonly opts: NodeServerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.realTimers = opts.realTimers ?? true;
    this.allowed = opts.allowedOrigins ?? '*';
    this.http = createServer((req, res) => {
      this.onRequest(req, res);
    });
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
    this.http.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const r = route('GET', url.pathname);
      const origin = req.headers.origin ?? null;
      if (r.kind !== 'socket' || !isOriginAllowed(origin, this.allowed)) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.attach(r.code, ws);
      });
    });
  }

  listen(port = this.opts.port ?? 8787): Promise<number> {
    return new Promise((resolve) => {
      this.http.listen(port, () => {
        const addr = this.http.address();
        resolve(typeof addr === 'object' && addr ? addr.port : port);
      });
    });
  }

  async close(): Promise<void> {
    for (const room of this.rooms.values()) {
      if (room.timer) clearTimeout(room.timer);
      for (const ws of room.sockets.values()) ws.terminate();
    }
    this.wss.close();
    await new Promise<void>((resolve) =>
      this.http.close(() => {
        resolve();
      }),
    );
  }

  createRoom(opts: { roundsPerGame?: number; timeScale?: number } = {}): string {
    let code = generateRoomCode(Math.random);
    while (this.rooms.has(code)) code = generateRoomCode(Math.random);
    const state = createRoomState(code, this.now(), randomId(16));
    this.rooms.set(code, this.makeRoom(code, state, opts));
    return code;
  }

  /** Fire every alarm that is due at the injected clock's current time. */
  runDueAlarms(): void {
    for (const room of [...this.rooms.values()]) {
      if (room.alarmAt !== null && room.alarmAt <= this.now()) {
        room.alarmAt = null;
        room.engine.alarm();
      }
    }
  }

  private makeRoom(
    code: string,
    state: RoomState,
    hooks: { roundsPerGame?: number; timeScale?: number } = {},
  ): NodeRoom {
    const room: NodeRoom = {
      engine: undefined as unknown as RoomEngine,
      sockets: new Map(),
      alarmAt: null,
      timer: null,
      state,
    };
    room.engine = new RoomEngine(state, {
      now: this.now,
      timeScale: hooks.timeScale ?? this.opts.timeScale ?? 1,
      roundsPerGame: hooks.roundsPerGame,
      randomId,
      send: (connId, msg) => {
        const ws = room.sockets.get(connId);
        if (ws?.readyState === ws?.OPEN) ws?.send(JSON.stringify(msg));
      },
      close: (connId, closeCode, reason) => {
        room.sockets.get(connId)?.close(closeCode, reason);
        room.sockets.delete(connId);
      },
      setAlarm: (at) => {
        room.alarmAt = at;
        if (!this.realTimers) return;
        if (room.timer) clearTimeout(room.timer);
        room.timer =
          at === null
            ? null
            : setTimeout(
                () => {
                  room.alarmAt = null;
                  room.engine.alarm();
                },
                Math.max(0, at - this.now()),
              );
      },
      save: (s) => {
        room.state = s;
      },
      destroy: () => {
        room.state = null;
        if (room.timer) clearTimeout(room.timer);
        this.rooms.delete(code);
      },
    });
    return room;
  }

  private attach(code: string, ws: WebSocket): void {
    const room = this.rooms.get(code);
    const connId = `n${++this.connSeq}`;
    if (!room) {
      ws.send(
        JSON.stringify({ type: 'error', code: 'ROOM_ENDED', message: 'This room has ended.' }),
      );
      ws.close(4000, 'ended');
      return;
    }
    room.sockets.set(connId, ws);
    ws.on('message', (data, isBinary) => {
      room.engine.message(
        connId,
        isBinary || !Buffer.isBuffer(data) ? null : data.toString('utf8'),
      );
    });
    ws.on('close', () => {
      if (room.sockets.get(connId) === ws) room.sockets.delete(connId);
      room.engine.disconnect(connId);
    });
    room.engine.connect(connId);
  }

  private onRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://x');
    const headers = corsHeaders(req.headers.origin ?? null, this.allowed);
    const json = (status: number, body: unknown): void => {
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const r = route(req.method ?? 'GET', url.pathname);
    switch (r.kind) {
      case 'preflight':
        res.writeHead(204, headers);
        res.end();
        return;
      case 'health':
        json(200, { ok: true });
        return;
      case 'create': {
        const cap = Number(url.searchParams.get('roundsPerGame'));
        const scale = Number(url.searchParams.get('timeScale'));
        const hooks = this.opts.testHooks
          ? {
              roundsPerGame: cap >= 1 ? Math.floor(cap) : undefined,
              timeScale: scale > 0 && scale <= 1 ? scale : undefined,
            }
          : {};
        json(201, { code: this.createRoom(hooks) });
        return;
      }
      case 'status': {
        const room = this.rooms.get(r.code);
        const info = room?.engine.welcomeInfo();
        const status: RoomStatus = {
          exists: !!room,
          phase: info?.phase ?? null,
          joinable: info?.joinable ?? false,
        };
        json(200, status);
        return;
      }
      default:
        json(404, { error: 'not found' });
    }
  }
}

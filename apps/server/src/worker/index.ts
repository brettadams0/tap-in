/**
 * Cloudflare Worker entry + the Room Durable Object (DECISIONS D4/D5).
 * One Durable Object per room code; the RoomEngine inside is the single authority.
 */
import { DurableObject } from 'cloudflare:workers';
import { generateRoomCode, type RoomStatus } from '@tap-in/shared';
import { RoomEngine } from '../engine/engine.js';
import { createRoomState, type RoomState } from '../engine/state.js';
import { corsHeaders, isOriginAllowed, route } from '../http.js';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS: string;
}

interface Attachment {
  connId: string;
  playerId: string | null;
}

const LOCATION_HINT: DurableObjectLocationHint = 'enam';

function randomId(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class Room extends DurableObject<Env> {
  private engine: RoomEngine | null = null;
  private readonly sockets = new Map<string, WebSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const state = await ctx.storage.get<RoomState>('state');
      if (state) this.load(state);
    });
  }

  private load(state: RoomState): void {
    const storage = this.ctx.storage;
    this.engine = new RoomEngine(state, {
      now: () => Date.now(),
      randomId,
      send: (connId, msg) => {
        try {
          this.sockets.get(connId)?.send(JSON.stringify(msg));
        } catch {
          // Socket already gone; the close handler cleans up.
        }
      },
      close: (connId, code, reason) => {
        const ws = this.sockets.get(connId);
        this.sockets.delete(connId);
        try {
          ws?.close(code, reason);
        } catch {
          // already closed
        }
      },
      setAlarm: (at) => {
        if (at === null) void storage.deleteAlarm();
        else void storage.setAlarm(at);
      },
      save: (s) => {
        void storage.put('state', s);
      },
      destroy: () => {
        void storage.deleteAll();
      },
    });
    // Re-attach sockets that survived hibernation.
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att) continue;
      this.sockets.set(att.connId, ws);
      this.engine.restore(att.connId, att.playerId);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init') {
      if (this.engine && !this.engine.snapshot.ended) return new Response('taken', { status: 409 });
      const code = url.searchParams.get('code') ?? '';
      const state = createRoomState(code, Date.now(), randomId(16));
      await this.ctx.storage.put('state', state);
      this.load(state);
      // Arm the empty-room expiry straight away.
      await this.ctx.storage.setAlarm(state.createdAt + 30 * 60_000);
      return new Response('ok', { status: 201 });
    }
    if (url.pathname === '/status') {
      const info = this.engine && !this.engine.snapshot.ended ? this.engine.welcomeInfo() : null;
      const status: RoomStatus = {
        exists: !!info,
        phase: info?.phase ?? null,
        joinable: info?.joinable ?? false,
      };
      return Response.json(status);
    }
    if (url.pathname === '/ws') {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      const connId = crypto.randomUUID();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ connId, playerId: null } satisfies Attachment);
      this.sockets.set(connId, server);
      if (this.engine) {
        this.engine.connect(connId);
      } else {
        server.send(
          JSON.stringify({ type: 'error', code: 'ROOM_ENDED', message: 'This room has ended.' }),
        );
        server.close(4000, 'ended');
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att || !this.engine) return;
    this.engine.message(att.connId, typeof message === 'string' ? message : null);
    const playerId = this.engine.playerOf(att.connId);
    if (playerId !== att.playerId && this.sockets.has(att.connId)) {
      ws.serializeAttachment({ connId: att.connId, playerId } satisfies Attachment);
    }
  }

  override webSocketClose(ws: WebSocket, code: number, reason: string): void {
    this.dropSocket(ws);
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  override webSocketError(ws: WebSocket): void {
    this.dropSocket(ws);
  }

  override alarm(): void {
    this.engine?.alarm();
  }

  private dropSocket(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att) return;
    this.sockets.delete(att.connId);
    this.engine?.disconnect(att.connId);
  }
}

function roomStub(env: Env, code: string): DurableObjectStub<Room> {
  return env.ROOMS.get(env.ROOMS.idFromName(code), { locationHint: LOCATION_HINT });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    const withCors = (res: Response): Response => {
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
      return out;
    };
    const r = route(request.method, url.pathname);
    switch (r.kind) {
      case 'preflight':
        return new Response(null, { status: 204, headers: cors });
      case 'health':
        return withCors(Response.json({ ok: true }));
      case 'create': {
        for (let attempt = 0; attempt < 8; attempt++) {
          const code = generateRoomCode(
            () => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) / 2 ** 32,
          );
          const res = await roomStub(env, code).fetch(`https://room/init?code=${code}`, {
            method: 'POST',
          });
          if (res.status === 201) return withCors(Response.json({ code }, { status: 201 }));
        }
        return withCors(Response.json({ error: 'busy, try again' }, { status: 503 }));
      }
      case 'status':
        return withCors(await roomStub(env, r.code).fetch('https://room/status'));
      case 'socket': {
        if (request.headers.get('Upgrade') !== 'websocket')
          return new Response('expected websocket', { status: 426 });
        if (!isOriginAllowed(origin, env.ALLOWED_ORIGINS))
          return new Response('forbidden', { status: 403 });
        return roomStub(env, r.code).fetch('https://room/ws', { headers: request.headers });
      }
      default:
        return withCors(Response.json({ error: 'not found' }, { status: 404 }));
    }
  },
} satisfies ExportedHandler<Env>;

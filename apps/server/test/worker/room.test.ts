/** Runs inside workerd: the real Worker + Room Durable Object, real WebSockets, real storage and alarms. */
import { env, runDurableObjectAlarm, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RoomState } from '../../src/engine/state.js';
import type { Env } from '../../src/worker/index.js';

interface Msg {
  type: string;
  [k: string]: unknown;
}

async function createRoom(): Promise<string> {
  const res = await SELF.fetch('https://api/rooms', { method: 'POST' });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

async function openSocket(code: string): Promise<{ ws: WebSocket; inbox: Msg[]; next: (type: string) => Promise<Msg> }> {
  const res = await SELF.fetch(`https://api/rooms/${code}/ws`, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket;
  if (!ws) throw new Error('no websocket');
  ws.accept();
  const inbox: Msg[] = [];
  const waiters: { type: string; resolve: (m: Msg) => void }[] = [];
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data as string) as Msg;
    inbox.push(msg);
    for (const w of waiters.filter((x) => x.type === msg.type)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(msg);
    }
  });
  const next = (type: string): Promise<Msg> =>
    new Promise((resolve) => {
      waiters.push({ type, resolve });
    });
  return { ws, inbox, next };
}

const avatar = { color: 'red', pattern: 'solid', eyes: 'dots', mouth: 'grin', topper: 'none' };

describe('Room Durable Object', () => {
  it('creates a room, joins over WebSocket and persists state', async () => {
    const code = await createRoom();
    const status = await (await SELF.fetch(`https://api/rooms/${code}`)).json();
    expect(status).toEqual({ exists: true, phase: 'lobby', joinable: true });

    const a = await openSocket(code);
    const creds = a.next('credentials');
    const state = a.next('state');
    a.ws.send(JSON.stringify({ type: 'join', name: 'Brett', avatar }));
    expect((await creds).code).toBe(code);
    expect(((await state).view as { players: unknown[] }).players).toHaveLength(1);

    const stub = (env as unknown as Env).ROOMS.get((env as unknown as Env).ROOMS.idFromName(code));
    const stored = await runInDurableObject(stub, async (_obj, ctx) => ctx.storage.get<RoomState>('state'));
    expect(stored?.players[0]?.name).toBe('Brett');
    a.ws.close();
  });

  it('rejoins with a token on a new socket', async () => {
    const code = await createRoom();
    const a = await openSocket(code);
    const creds = a.next('credentials');
    a.ws.send(JSON.stringify({ type: 'join', name: 'Sam', avatar }));
    const { playerId, token } = (await creds) as unknown as { playerId: string; token: string };
    a.ws.close();

    const b = await openSocket(code);
    const state = b.next('state');
    b.ws.send(JSON.stringify({ type: 'rejoin', playerId, token }));
    expect(((await state).view as { you: { id: string } }).you.id).toBe(playerId);
    b.ws.close();
  });

  it('answers ping with server time and reports unknown rooms as ended', async () => {
    const code = await createRoom();
    const a = await openSocket(code);
    const pong = a.next('pong');
    a.ws.send(JSON.stringify({ type: 'ping', t0: 1 }));
    expect(typeof (await pong).serverTime).toBe('number');

    const ghost = await openSocket('QQQQ');
    const err = await ghost.next('error');
    expect(err.code).toBe('ROOM_ENDED');
  });

  it('expires an empty room via its alarm and wipes storage', async () => {
    const code = await createRoom();
    const stub = (env as unknown as Env).ROOMS.get((env as unknown as Env).ROOMS.idFromName(code));
    // Pretend the room has been empty for over 30 minutes.
    await runInDurableObject(stub, async (_obj, ctx) => {
      const s = await ctx.storage.get<RoomState>('state');
      if (!s) throw new Error('no state');
      s.emptySince = Date.now() - 31 * 60_000;
      await ctx.storage.put('state', s);
    });
    // Reload the object from storage, then fire its alarm.
    const { evictDurableObject } = await import('cloudflare:test');
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const left = await runInDurableObject(stub, async (_obj, ctx) => ctx.storage.get('state'));
    expect(left).toBeUndefined();
    expect(await (await SELF.fetch(`https://api/rooms/${code}`)).json()).toMatchObject({ exists: false });
  });

  it('rejects non-websocket requests to the socket route and unknown paths', async () => {
    expect((await SELF.fetch('https://api/rooms/ABCD/ws')).status).toBe(426);
    expect((await SELF.fetch('https://api/healthz')).status).toBe(200);
    expect((await SELF.fetch('https://api/nope')).status).toBe(404);
  });
});

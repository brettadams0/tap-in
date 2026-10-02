/**
 * Real sockets: boots the Node adapter in-process and connects 5 WebSocket clients,
 * the way 5 phones would (SPEC "Integration tests").
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { applyPatch, type ClientMessage, type RoomView, type ServerMessage } from '@tap-in/shared';
import { NodeRoomServer } from '../src/node/server.js';
import { HOST_TRANSFER_MS } from '../src/engine/state.js';
import { avatar } from './harness.js';

class Phone {
  ws!: WebSocket;
  inbox: ServerMessage[] = [];
  view: RoomView | null = null;
  version = 0;
  playerId: string | null = null;
  token: string | null = null;
  private waiters: (() => void)[] = [];

  static async open(url: string): Promise<Phone> {
    const p = new Phone();
    p.ws = new WebSocket(url);
    p.ws.on('message', (data) => {
      const msg = JSON.parse((data as Buffer).toString('utf8')) as ServerMessage;
      p.inbox.push(msg);
      if (msg.type === 'credentials') {
        p.playerId = msg.playerId;
        p.token = msg.token;
      } else if (msg.type === 'state') {
        p.view = msg.view;
        p.version = msg.version;
      } else if (msg.type === 'patch') {
        if (msg.base !== p.version || !p.view) throw new Error('version gap');
        p.view = applyPatch(p.view, msg.ops);
        p.version = msg.version;
      }
      for (const w of p.waiters.splice(0)) w();
    });
    await new Promise<void>((resolve, reject) => {
      p.ws.once('open', () => {
        resolve();
      });
      p.ws.once('error', reject);
    });
    return p;
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  async until(check: (p: Phone) => boolean, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!check(this)) {
      if (Date.now() > deadline) throw new Error('timed out waiting for condition');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('close', () => {
        resolve();
      });
      this.ws.close();
    });
  }
}

describe('room server over real WebSockets', () => {
  let server: NodeRoomServer;
  let base: string;
  let time = 1_000_000;

  beforeEach(async () => {
    time = 1_000_000;
    server = new NodeRoomServer({ now: () => time, realTimers: false });
    const port = await server.listen(0);
    base = `http://localhost:${port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  async function createRoom(): Promise<string> {
    const res = await fetch(`${base}/rooms`, { method: 'POST' });
    expect(res.status).toBe(201);
    return ((await res.json()) as { code: string }).code;
  }

  const wsUrl = (code: string): string => `${base.replace('http', 'ws')}/rooms/${code}/ws`;
  const colors = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

  async function fiveJoin(code: string): Promise<Phone[]> {
    const phones: Phone[] = [];
    for (const [i, color] of colors.entries()) {
      const p = await Phone.open(wsUrl(code));
      p.send({ type: 'join', name: `Player${i + 1}`, avatar: avatar(color) });
      await p.until((x) => x.view !== null);
      phones.push(p);
    }
    await Promise.all(phones.map((p) => p.until((x) => x.view?.players.length === 5)));
    return phones;
  }

  it('serves health, room status and 404s', async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    const code = await createRoom();
    expect(await (await fetch(`${base}/rooms/${code}`)).json()).toEqual({
      exists: true,
      phase: 'lobby',
      joinable: true,
    });
    expect(await (await fetch(`${base}/rooms/ZZZZ`)).json()).toMatchObject({ exists: false });
    expect((await fetch(`${base}/nope`)).status).toBe(404);
    expect((await fetch(`${base}/rooms`, { method: 'OPTIONS' })).status).toBe(204);
  });

  it('5 phones join, see each other, and the host starts', async () => {
    const code = await createRoom();
    const phones = await fiveJoin(code);
    const host = phones[0] as Phone;
    expect(new Set(phones.map((p) => p.view?.hostId))).toEqual(new Set([host.playerId]));
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    await Promise.all(phones.map((p) => p.until((x) => x.view?.phase === 'intro')));
    await Promise.all(phones.map((p) => p.close()));
  });

  it('a phone that drops reconnects into the same seat with its own view', async () => {
    const code = await createRoom();
    const phones = await fiveJoin(code);
    const lost = phones[2] as Phone;
    await lost.close();
    await (phones[0] as Phone).until((p) => p.view?.players[2]?.presence === 'reconnecting');
    const again = await Phone.open(wsUrl(code));
    again.send({ type: 'rejoin', playerId: lost.playerId ?? '', token: lost.token ?? '' });
    await again.until((p) => p.view !== null);
    expect(again.view?.you.id).toBe(lost.playerId);
    expect(again.view?.players.map((p) => p.name)).toEqual(lost.view?.players.map((p) => p.name));
    await (phones[0] as Phone).until((p) => p.view?.players[2]?.presence === 'connected');
  });

  it('host disconnect for 30 s hands host to the right player', async () => {
    const code = await createRoom();
    const phones = await fiveJoin(code);
    const [host, second] = phones as [Phone, Phone];
    await host.close();
    await second.until((p) => p.view?.players[0]?.presence === 'reconnecting');
    time += HOST_TRANSFER_MS;
    server.runDueAlarms();
    await Promise.all(
      phones.slice(1).map((p) => p.until((x) => x.view?.hostId === second.playerId)),
    );
  });

  it('measures clock offset via ping/pong', async () => {
    const code = await createRoom();
    const p = await Phone.open(wsUrl(code));
    p.send({ type: 'ping', t0: 5 });
    await p.until((x) => x.inbox.some((m) => m.type === 'pong'));
    expect(p.inbox.find((m) => m.type === 'pong')).toEqual({
      type: 'pong',
      t0: 5,
      serverTime: time,
    });
  });

  it('tells a phone when a room does not exist', async () => {
    const p = await Phone.open(wsUrl('QQQQ'));
    await p.until((x) => x.inbox.length > 0);
    expect(p.inbox[0]).toMatchObject({ type: 'error', code: 'ROOM_ENDED' });
  });

  it('broadcasts lobby changes to all 5 phones quickly', async () => {
    const code = await createRoom();
    const phones = await fiveJoin(code);
    const started = performance.now();
    (phones[0] as Phone).send({
      type: 'hostAction',
      action: { kind: 'settings', settings: { spice: 'unhinged' } },
    });
    await Promise.all(phones.map((p) => p.until((x) => x.view?.settings.spice === 'unhinged')));
    expect(performance.now() - started).toBeLessThan(150);
  });
});

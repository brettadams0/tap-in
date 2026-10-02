/**
 * 5 real WebSocket phones play Would You Rather and Reaction Shotgun on the Node adapter with
 * real timers (scaled 10x faster), including a mid-round reconnect and a private-view leak check.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlayView, ServerMessage } from '@tap-in/shared';
import { NodeRoomServer } from '../src/node/server.js';
import { avatar } from './harness.js';
import { Phone } from './phone.js';

const colors = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

describe('games over real WebSockets', () => {
  let server: NodeRoomServer;
  let base: string;

  beforeEach(async () => {
    server = new NodeRoomServer({ timeScale: 0.1 });
    base = `http://localhost:${await server.listen(0)}`;
  });
  afterEach(async () => {
    await server.close();
  });

  async function setup(games: string[]): Promise<{ phones: Phone[]; host: Phone; url: string }> {
    const res = await fetch(`${base}/rooms`, { method: 'POST' });
    const { code } = (await res.json()) as { code: string };
    const url = `${base.replace('http', 'ws')}/rooms/${code}/ws`;
    const phones: Phone[] = [];
    for (const [i, color] of colors.entries()) {
      const p = await Phone.open(url);
      p.send({ type: 'join', name: `Player${i + 1}`, avatar: avatar(color) });
      await p.until((x) => x.view !== null);
      phones.push(p);
    }
    const host = phones[0] as Phone;
    await host.until((x) => x.view?.players.length === 5);
    host.send({
      type: 'hostAction',
      action: { kind: 'settings', settings: { games: games as never } },
    });
    await host.until((x) => x.view?.settings.games.length === games.length);
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    return { phones, host, url };
  }

  const play = (p: Phone): PlayView | null => p.view?.session?.play ?? null;

  it('plays a Would You Rather round with a reconnect mid-vote', async () => {
    const { phones, host, url } = await setup(['wouldYouRather', 'tapRace']);
    await Promise.all(phones.map((p) => p.until((x) => x.view?.phase === 'roundInput', 5000)));
    const prompt = play(host);
    expect(prompt?.gameId).toBe('wouldYouRather');
    // Every phone sees the same two options.
    for (const p of phones) expect(play(p)?.pub).toEqual(prompt?.pub);

    const [p1, p2, p3, p4, p5] = phones as [Phone, Phone, Phone, Phone, Phone];
    p1.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    p2.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    p3.send({ type: 'submit', step: 'vote', data: { side: 'b' } });
    await host.until((x) => x.view?.session?.locked.length === 3);

    // p3 drops and comes back: its vote is restored, nobody else's leaks.
    await p3.close();
    const back = await Phone.open(url);
    back.send({ type: 'rejoin', playerId: p3.playerId ?? '', token: p3.token ?? '' });
    await back.until((x) => x.view?.phase === 'roundInput');
    expect(play(back)?.me).toEqual({ choice: 'b' });

    p4.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    p5.send({ type: 'submit', step: 'vote', data: { side: 'b' } });
    await host.until((x) => x.view?.phase === 'roundReveal');
    await host.until((x) => x.view?.phase === 'drink');
    expect(host.view?.session?.drink?.drinkers.map((d) => d.id).sort()).toEqual(
      [p3.playerId, p5.playerId].sort(),
    );

    // Leak check: before the reveal, a phone only ever saw its own side.
    const sent = new Map<Phone, string>([
      [p1, 'a'],
      [p2, 'a'],
      [p4, 'a'],
      [p5, 'b'],
    ]);
    for (const [phone, side] of sent) {
      for (const v of phone.views) {
        const pv = v.session?.play;
        if (v.phase !== 'roundInput' || pv?.gameId !== 'wouldYouRather') continue;
        expect(pv.reveal).toBeNull();
        expect(JSON.stringify(v)).not.toMatch(/"(a|b)":\["p_/);
        expect([null, side]).toContain(pv.me.choice);
      }
    }
    await Promise.all([p1, p2, p4, p5, back].map((p) => p.close()));
  });

  it('plays a Reaction Shotgun round end to end', async () => {
    const { phones, host } = await setup(['reactionShotgun', 'tapRace']);
    await host.until((x) => {
      const pv = x.view?.session?.play;
      return pv?.gameId === 'reactionShotgun' && pv.step === 'armed';
    }, 8000);
    const pv = play(host);
    const flashAt = pv?.gameId === 'reactionShotgun' ? pv.pub.flashAt : null;
    expect(flashAt).toBeTypeOf('number');
    // Every phone got the same flash time for its synced cue.
    for (const p of phones) {
      await p.until((x) => {
        const v = x.view?.session?.play;
        return v?.gameId === 'reactionShotgun' && v.pub.flashAt === flashAt;
      });
    }
    await new Promise((r) => setTimeout(r, Math.max(0, (flashAt ?? 0) - Date.now() + 30)));
    phones.forEach((p, i) => {
      p.send({ type: 'submit', step: 'armed', data: { ms: 180 + i * 40 } });
    });
    await host.until((x) => x.view?.phase === 'roundReveal');
    const reveal = play(host);
    expect(reveal?.gameId === 'reactionShotgun' && reveal.reveal?.board[0]?.ms).toBe(180);
    await host.until((x) => x.view?.phase === 'drink');
    expect(host.view?.session?.drink?.drinkers).toEqual([
      { id: phones[4]?.playerId, reason: 'slowest' },
    ]);
    host.send({ type: 'hostAction', action: { kind: 'end' } });
    await Promise.all(phones.map((p) => p.until((x) => x.view?.phase === 'results')));
    const errors = phones.flatMap((p) =>
      p.inbox.filter((m): m is Extract<ServerMessage, { type: 'error' }> => m.type === 'error'),
    );
    expect(errors).toEqual([]);
    await Promise.all(phones.map((p) => p.close()));
  });
});

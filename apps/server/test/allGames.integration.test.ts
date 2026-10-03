/**
 * SPEC "Integration tests": a real room server in-process, 5 real WebSocket phones, and every game
 * played end to end (a whole block, then the results screen). Phones auto-play with seeded input;
 * one phone drops and rejoins mid-block. Timers run 10x faster, except Tap Race's window and
 * Countdown's collision window, which are never scaled.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRng, GAME_IDS } from '@tap-in/shared';
import { NodeRoomServer } from '../src/node/server.js';
import { randomInput } from './autoplay.js';
import { avatar } from './harness.js';
import { Phone } from './phone.js';

const colors = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

describe('every game over real WebSockets', () => {
  let server: NodeRoomServer;
  let base: string;

  beforeAll(async () => {
    server = new NodeRoomServer({ timeScale: 0.1 });
    base = `http://localhost:${await server.listen(0)}`;
  });
  afterAll(async () => {
    await server.close();
  });

  for (const gameId of GAME_IDS) {
    it(`${gameId}: a whole block to the results, with a drop and a rejoin`, async () => {
      const rng = createRng(`all-${gameId}`);
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
        action: { kind: 'settings', settings: { games: [gameId] } },
      });
      await host.until((x) => x.view?.settings.games.length === 1);
      host.send({ type: 'hostAction', action: { kind: 'start' } });

      let dropped = false;
      const deadline = Date.now() + 60_000;
      while (host.view?.phase !== 'gameOutro' && host.view?.phase !== 'results') {
        if (Date.now() > deadline) {
          const v = host.view;
          throw new Error(
            `${gameId} stuck: ${JSON.stringify({ phase: v?.phase, ends: v?.phaseEndsAt, overlay: v?.session?.overlay, round: v?.session?.round, step: v?.session?.play?.step, presence: v?.players.map((x) => x.presence), dropped })}`,
          );
        }
        await new Promise((r) => setTimeout(r, 40 + rng.int(80)));
        for (const p of phones) {
          const view = p.view;
          if (!view) continue;
          const input = rng.next() < 0.5 ? randomInput(view, rng) : null;
          if (input) p.send({ type: 'submit', step: input.step, data: input.data });
          if (view.phase === 'drink') p.send({ type: 'ready' });
        }
        // Mid-block, phone 3 drops and comes back on a new socket.
        if (!dropped && host.view?.phase === 'roundInput' && (host.view.session?.round ?? 0) >= 2) {
          dropped = true;
          const old = phones[2] as Phone;
          const phase = old.view?.phase;
          await old.close();
          const back = await Phone.open(url);
          back.send({ type: 'rejoin', playerId: old.playerId ?? '', token: old.token ?? '' });
          back.playerId = old.playerId;
          back.token = old.token;
          await back.until((x) => x.view !== null);
          expect([phase, 'roundReveal', 'drink']).toContain(back.view?.phase);
          phones[2] = back;
        }
      }
      expect(dropped).toBe(true);
      host.send({ type: 'hostAction', action: { kind: 'end' } });
      for (const p of phones) await p.until((x) => x.view?.phase === 'results', 5000);
      const results = host.view.session?.results;
      expect(results?.standings).toHaveLength(5);
      expect(results?.games).toEqual([gameId]);
      // Every phone agrees on the final tally.
      for (const p of phones) expect(p.view?.session?.drinks).toEqual(host.view.session?.drinks);
      for (const p of phones) await p.close();
    }, 90_000);
  }
});

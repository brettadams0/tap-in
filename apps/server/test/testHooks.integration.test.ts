/** The Node adapter's e2e hook: `?roundsPerGame=` only counts when test hooks are on. */
import { describe, expect, it } from 'vitest';
import { NodeRoomServer } from '../src/node/server.js';
import { avatar } from './harness.js';
import { Phone } from './phone.js';

async function roundsIn(testHooks: boolean): Promise<number | undefined> {
  const server = new NodeRoomServer({ timeScale: 0.1, testHooks });
  const base = `http://localhost:${await server.listen(0)}`;
  try {
    const res = await fetch(`${base}/rooms?roundsPerGame=1`, { method: 'POST' });
    const { code } = (await res.json()) as { code: string };
    const url = `${base.replace('http', 'ws')}/rooms/${code}/ws`;
    const phones: Phone[] = [];
    for (const color of ['red', 'sky', 'green'] as const) {
      const p = await Phone.open(url);
      p.send({ type: 'join', name: color, avatar: avatar(color) });
      await p.until((x) => x.view !== null);
      phones.push(p);
    }
    const host = phones[0] as Phone;
    host.send({
      type: 'hostAction',
      action: { kind: 'settings', settings: { games: ['wouldYouRather'] } },
    });
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    // Generous waits: CI runs this beside the all-games and chaos files, with coverage on.
    const where = () =>
      JSON.stringify({
        phase: host.view?.phase,
        errors: host.inbox.flatMap((m) => (m.type === 'error' ? [m.message] : [])),
      });
    await host
      .until((x) => x.view?.phase !== 'lobby', 15_000)
      .catch(() => {
        throw new Error(`start never landed: ${where()}`);
      });
    await host
      .until((x) => x.view?.phase === 'roundInput', 15_000)
      .catch(() => {
        throw new Error(`no round started: ${where()}`);
      });
    const rounds = host.view?.session?.rounds;
    for (const p of phones) await p.close();
    return rounds;
  } finally {
    await server.close();
  }
}

describe('test hooks', () => {
  it('caps a block at one round only when the server runs with test hooks', async () => {
    expect(await roundsIn(true)).toBe(1);
    expect(await roundsIn(false)).toBe(4);
  }, 60_000);
});

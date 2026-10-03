/**
 * The phase 4 games through the real engine: a round of each, the Drink outcome, a refresh
 * mid-step that restores the private view, and leak checks where there's something to hide.
 */
import { describe, expect, it } from 'vitest';
import type { GameId, PlayView, RoomView } from '@tap-in/shared';
import type { BlankState, CountState, SpinState, TapState } from '@tap-in/games';
import { Harness, type FakeClient } from './harness.js';

const COLORS = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

function session(gameId: GameId, n = 5) {
  const h = new Harness({ seed: `remaining-${gameId}` });
  const players = COLORS.slice(0, n).map((c, i) => h.join(`P${i + 1}`, c));
  const host = players[0] as FakeClient;
  host.send({ type: 'hostAction', action: { kind: 'settings', settings: { games: [gameId] } } });
  host.send({ type: 'hostAction', action: { kind: 'start' } });
  h.until(() => host.view?.phase === 'roundInput');
  return { h, players, host };
}

const view = (c: FakeClient): RoomView => {
  if (!c.view) throw new Error('no view');
  return c.view;
};
const play = (c: FakeClient): PlayView | null => view(c).session?.play ?? null;
const game = (h: Harness): unknown => h.engine.snapshot.session?.game;
const submit = (c: FakeClient, step: string, data: unknown) => {
  c.send({ type: 'submit', step, data });
};
function refresh(h: Harness, c: FakeClient): FakeClient {
  c.disconnect();
  const back = h.connect();
  back.send({ type: 'rejoin', playerId: c.playerId ?? '', token: c.token ?? '' });
  back.playerId = c.playerId;
  back.token = c.token;
  return back;
}
const drinkers = (c: FakeClient) => view(c).session?.drink?.drinkers ?? [];

describe('Rank It', () => {
  it('the odd one out drinks; a refresh keeps your ranking', () => {
    const { h, players, host } = session('rankIt');
    const [p1, p2, p3, p4, p5] = players as [
      FakeClient,
      FakeClient,
      FakeClient,
      FakeClient,
      FakeClient,
    ];
    for (const p of [p1, p2, p3, p4]) submit(p, 'rank', { ranking: [0, 1, 2, 3] });
    const back = refresh(h, p4);
    const pv = play(back);
    expect(pv?.gameId === 'rankIt' && pv.me.ranking).toEqual([0, 1, 2, 3]);
    // Nobody else's ranking ever reached p2.
    expect(JSON.stringify(p2.inbox)).not.toContain('"ranking":[0,1,2,3]],');
    submit(p5, 'rank', { ranking: [3, 2, 1, 0] });
    expect(view(host).phase).toBe('roundReveal');
    h.until(() => view(host).phase === 'drink');
    expect(drinkers(host)).toEqual([{ id: p5.playerId, reason: 'furthest' }]);
  });
});

describe('Tap Race', () => {
  it('counts arrive after the window; the fewest taps drinks', () => {
    const { h, players, host } = session('tapRace', 3);
    const s = game(h) as TapState;
    const pv = play(host);
    expect(pv?.gameId === 'tapRace' && pv.pub.goAt).toBe(s.goAt);
    submit(players[0] as FakeClient, 'tap', { count: 10 });
    expect((players[0] as FakeClient).last('error')?.message).toBe('Not yet!');
    h.advance(s.goAt + 5000 - h.time);
    players.forEach((p, i) => {
      submit(p, 'tap', { count: 30 + i * 5 });
    });
    expect(view(host).phase).toBe('roundReveal');
    h.until(() => view(host).phase === 'drink');
    expect(drinkers(host)).toEqual([{ id: players[0]?.playerId, reason: 'fewestTaps' }]);
  });
});

describe('Spin the Bottle', () => {
  it('lands, the dare is done, the room says Nope: the chosen one drinks', () => {
    const { h, players, host } = session('spinTheBottle', 4);
    const s = game(h) as SpinState;
    const chosen = players.find((p) => p.playerId === s.chosen) as FakeClient;
    const others = players.filter((p) => p !== chosen);
    expect(play(host)?.step).toBe('spin');
    // The spin is a fixed-length moment: nobody can skip it.
    h.advance(1000);
    expect(play(host)?.step).toBe('spin');
    h.until(() => play(host)?.step === 'choice');
    submit(others[0] as FakeClient, 'choice', { choice: 'drink' });
    expect((others[0] as FakeClient).errors()).toContain('REJECTED');
    submit(chosen, 'choice', { choice: 'dare' });
    expect(play(host)?.step).toBe('perform');
    const back = refresh(h, chosen);
    expect(play(back)?.step).toBe('perform');
    submit(back, 'perform', { performed: true });
    expect(play(host)?.step).toBe('confirm');
    submit(others[0] as FakeClient, 'confirm', { verdict: 'nope' });
    const mine = play(others[0] as FakeClient);
    expect(mine?.gameId === 'spinTheBottle' && mine.me.verdict).toBe('nope');
    // Verdicts stay private until the reveal.
    expect(JSON.stringify(view(others[1] as FakeClient))).not.toContain('"nope"');
    submit(others[1] as FakeClient, 'confirm', { verdict: 'nope' });
    submit(others[2] as FakeClient, 'confirm', { verdict: 'done' });
    expect(view(host).phase).toBe('roundReveal');
    h.until(() => view(host).phase === 'drink');
    expect(drinkers(host)).toEqual([{ id: chosen.playerId, reason: 'dareFailed' }]);
  });
});

describe('Fill in the Blank', () => {
  it('anonymous answers; the fewest votes drinks', () => {
    const { h, players, host } = session('fillInTheBlank', 3);
    const [p1, p2, p3] = players as [FakeClient, FakeClient, FakeClient];
    submit(p1, 'write', { answer: 'A goose in a tux' });
    submit(p2, 'write', { answer: 'Tax forms' });
    submit(p3, 'write', { answer: 'Wet socks' });
    expect(play(host)?.step).toBe('vote');
    const s = game(h) as BlankState;
    // Options never say who wrote what before the reveal.
    for (const p of players) expect(JSON.stringify(p.inbox)).not.toContain('"authors"');
    const goose = s.options.indexOf('A goose in a tux');
    submit(p2, 'vote', { vote: goose });
    submit(p3, 'vote', { vote: goose });
    submit(p1, 'vote', { vote: s.options.indexOf('Tax forms') });
    expect(view(host).phase).toBe('roundReveal');
    h.until(() => view(host).phase === 'drink');
    expect(drinkers(host)).toEqual([{ id: p3.playerId, reason: 'fewestVotes' }]);
  });
});

describe('Countdown', () => {
  it('a collision resets the count; reaching the target means nobody drinks', () => {
    const { h, players, host } = session('countdown', 3);
    const [p1, p2, p3] = players as [FakeClient, FakeClient, FakeClient];
    h.advance(1000);
    submit(p1, 'count', { tap: true });
    submit(p2, 'count', { tap: true }); // same instant: collision
    const pv = play(host);
    expect(pv?.gameId === 'countdown' && pv.pub.count).toBe(0);
    expect(pv?.gameId === 'countdown' && pv.pub.collisions[0]?.ids).toEqual([
      p1.playerId,
      p2.playerId,
    ]);
    const order = [p1, p2, p3];
    for (let i = 0; i < 6; i++) {
      h.advance(700);
      submit(order[i % 3] as FakeClient, 'count', { tap: true });
    }
    expect((game(h) as CountState).count).toBe(6);
    h.advance(700);
    expect(view(host).phase).toBe('roundReveal');
    h.until(() => view(host).phase === 'drink');
    expect(view(host).session?.drink?.everyone).toBe(false);
    expect(drinkers(host).map((d) => d.reason)).toEqual(['collision', 'collision']);
  });

  it('running out of time: everyone drinks', () => {
    const { h, host } = session('countdown', 3);
    h.until(() => view(host).phase === 'drink', 60_000);
    expect(view(host).session?.drink?.everyone).toBe(true);
  });
});

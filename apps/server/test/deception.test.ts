/**
 * The phase 3 deception games through the real engine: full rounds, Drink outcomes,
 * private-view leak checks on every frame a phone received, and reconnects mid-step.
 */
import { describe, expect, it } from 'vitest';
import type { GameId, PlayView, RoomView } from '@tap-in/shared';
import type { FakeState, LiarState, SecretState, TruthsState } from '@tap-in/games';
import { Harness, type FakeClient } from './harness.js';

const COLORS = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

function session(gameId: GameId, opts: { length?: 'short' } = {}) {
  const h = new Harness({ seed: `deception-${gameId}` });
  const players = COLORS.map((c, i) => h.join(`P${i + 1}`, c));
  const host = players[0] as FakeClient;
  host.send({
    type: 'hostAction',
    action: { kind: 'settings', settings: { games: [gameId, 'tapRace'], ...opts } },
  });
  host.send({ type: 'hostAction', action: { kind: 'start' } });
  h.until(() => host.view?.phase === 'roundInput');
  return { h, players, host };
}

const view = (c: FakeClient): RoomView => {
  if (!c.view) throw new Error('no view');
  return c.view;
};
const play = (c: FakeClient): PlayView | null => view(c).session?.play ?? null;
const step = (c: FakeClient) => play(c)?.step;
const game = (h: Harness): unknown => h.engine.snapshot.session?.game;
const byId = (players: FakeClient[], id: string) => {
  const c = players.find((p) => p.playerId === id);
  if (!c) throw new Error(`no player ${id}`);
  return c;
};
const submit = (c: FakeClient, s: string, data: unknown) => {
  c.send({ type: 'submit', step: s, data });
};
/** Everything a phone has received so far, as one string (for leak checks). */
const frames = (c: FakeClient, from = 0) => JSON.stringify(c.inbox.slice(from));
/** Rejoin a player on a new socket, the way a refreshed phone does. */
function refresh(h: Harness, c: FakeClient): FakeClient {
  c.disconnect();
  const back = h.connect();
  back.send({ type: 'rejoin', playerId: c.playerId ?? '', token: c.token ?? '' });
  back.playerId = c.playerId;
  back.token = c.token;
  return back;
}

describe("Liar's Prompt", () => {
  it('plays a round: the imposter is caught, and nothing leaks before the reveal', () => {
    const { h, players } = session('liarsPrompt');
    const s = game(h) as LiarState;
    const imposter = byId(players, s.imposter ?? '');
    const host = players.find((p) => p !== imposter) as FakeClient;
    const prompt = s.prompt;
    if (!prompt) throw new Error('no prompt');
    expect(step(host)).toBe('answer');
    for (const p of players) {
      const pv = play(p);
      expect(pv?.gameId === 'liarsPrompt' && pv.me.question).toBe(
        p === imposter ? prompt.imposter : prompt.main,
      );
    }

    players.forEach((p, i) => {
      submit(p, 'answer', { answer: `answer ${i + 1}` });
    });
    expect(step(host)).toBe('show');
    // The show step is a fixed-length synced moment: it never ends early.
    h.advance(1000);
    expect(step(host)).toBe('show');
    h.until(() => step(host) === 'vote');
    const pv = play(host);
    expect(pv?.gameId === 'liarsPrompt' && pv.pub.question).toBe(prompt.main);

    // A phone refreshed mid-vote comes back to the vote with its own question.
    const back = refresh(h, imposter);
    const ipv = play(back);
    expect(ipv?.gameId === 'liarsPrompt' && ipv.me.question).toBe(prompt.imposter);
    players[players.indexOf(imposter)] = back;

    const voted = new Map<FakeClient, string>();
    const others = players.filter((p) => p !== back);
    for (const p of others) voted.set(p, back.playerId ?? '');
    voted.set(back, others[0]?.playerId ?? '');
    const order = [back, ...others];
    order.slice(0, -1).forEach((p) => {
      submit(p, 'vote', { vote: voted.get(p) });
    });
    // Everything each phone saw before the last vote triggers the reveal.
    const before = new Map(players.map((p) => [p, frames(p)]));
    const last = order.at(-1) as FakeClient;
    submit(last, 'vote', { vote: voted.get(last) });
    expect(view(host).phase).toBe('roundReveal');

    // Leak check: before the reveal nobody learned who the imposter was, only the imposter
    // ever saw the imposter question, and each phone only ever saw its own vote.
    for (const p of players) {
      const seen = before.get(p) ?? '';
      expect(seen).not.toContain('"imposter"');
      expect(seen).not.toContain('"caught"');
      if (p !== back) expect(seen).not.toContain(prompt.imposter);
      for (const [q, target] of voted) {
        if (q !== p && target !== voted.get(p)) expect(seen).not.toContain(`"vote":"${target}"`);
      }
    }
    expect(frames(host)).toContain(prompt.imposter);

    h.until(() => view(host).phase === 'drink');
    expect(view(host).session?.drink?.drinkers).toEqual([{ id: back.playerId, reason: 'caught' }]);
  });

  it('an imposter who escapes: everyone else drinks and they score a liar point', () => {
    const { h, players, host } = session('liarsPrompt');
    const imposter = (game(h) as LiarState).imposter ?? '';
    h.until(() => step(host) === 'vote');
    for (const p of players) {
      const other = players.find((x) => x !== p && x.playerId !== imposter);
      submit(p, 'vote', { vote: other?.playerId });
    }
    h.until(() => view(host).phase === 'drink');
    const drink = view(host).session?.drink;
    expect(drink?.everyone).toBe(true);
    expect(drink?.spared).toEqual({ ids: [imposter], why: 'imposterEscaped' });
    expect(view(host).session?.drinks[imposter]).toBe(0);
    expect(
      Object.entries(view(host).session?.drinks ?? {}).filter(([id, n]) => id !== imposter && n),
    ).toHaveLength(4);
    // Every non-imposter can tap Done; the imposter can't.
    byId(players, imposter).send({ type: 'ready' });
    expect(view(host).session?.done).toEqual([]);
    host.send({ type: 'hostAction', action: { kind: 'end' } });
    const awards = view(host).session?.results?.awards ?? [];
    expect(awards.find((a) => a.id === 'bestLiar')?.players).toEqual([imposter]);
  });
});

describe('Secret Word', () => {
  it('runs hint turns in order, catches the outsider, who guesses wrong', () => {
    const { h, players } = session('secretWord');
    const s = game(h) as SecretState;
    const word = s.entry?.word ?? '?';
    const outsider = byId(players, s.outsider ?? '');
    const host = players.find((p) => p !== outsider) as FakeClient;
    expect(s.order[0]).not.toBe(outsider.playerId);
    // Only the outsider is told they're the outsider; they never get the word.
    for (const p of players) {
      const pv = play(p);
      if (pv?.gameId !== 'secretWord') throw new Error('wrong game');
      expect(pv.me.outsider).toBe(p === outsider);
      expect(pv.me.word).toBe(p === outsider ? null : word);
    }

    // Out of turn: rejected. Then each player hints in order.
    const second = byId(players, s.order[1] ?? '');
    submit(second, 'hint', { hint: 'nope' });
    expect(second.errors()).toContain('REJECTED');
    const first = byId(players, s.order[0] ?? '');
    submit(first, 'hint', { hint: word });
    expect(first.last('error')?.message).toBe('Too close to the word! Try another.');
    submit(first, 'hint', { hint: 'zebra' });
    const pv = play(host);
    expect(pv?.gameId === 'secretWord' && pv.pub.hints).toEqual([
      { id: first.playerId, text: 'zebra' },
    ]);
    // The next player's turn has its own fresh 15 s.
    expect(view(host).phaseEndsAt).toBe(h.time + 15_000);

    // A phone refreshed mid-hint comes back to the same turn, with its secret intact.
    const back = refresh(h, outsider);
    const opv = play(back);
    expect(opv?.gameId === 'secretWord' && opv.me).toMatchObject({ outsider: true, word: null });
    players[players.indexOf(outsider)] = back;

    s.order.slice(1).forEach((id, i) => {
      submit(byId(players, id), 'hint', { hint: `clue${i}` });
    });
    expect(step(host)).toBe('vote');
    for (const p of players) {
      if (p !== back) submit(p, 'vote', { vote: back.playerId });
    }
    submit(back, 'vote', { vote: host.playerId });
    expect(step(host)).toBe('guess');
    const gpv = play(host);
    expect(gpv?.gameId === 'secretWord' && gpv.pub.caught).toBe(back.playerId);

    // Leak check: the outsider never received the word before the reveal.
    expect(frames(outsider) + frames(back)).not.toContain(`"${word}"`);
    submit(back, 'guess', { guess: 'definitely not it' });
    expect(view(host).phase).toBe('roundReveal');
    expect(frames(back)).toContain(word);
    h.until(() => view(host).phase === 'drink');
    expect(view(host).session?.drink?.drinkers).toEqual([
      { id: back.playerId, reason: 'wrongGuess' },
    ]);
  });

  it('skips a disconnected player’s hint turn right away', () => {
    const { h, players, host } = session('secretWord');
    const s = game(h) as SecretState;
    const first = byId(players, s.order[0] ?? '');
    first.disconnect();
    const pv = play(host);
    expect(pv?.gameId === 'secretWord' && pv.pub.hints).toEqual([
      { id: first.playerId, text: null },
    ]);
    expect(pv?.gameId === 'secretWord' && pv.pub.turn).toBe(1);
    expect(h.time).toBeGreaterThan(0);
  });
});

describe('Two Truths, One App', () => {
  it('setup, reroll, spotlight, guesses; nobody sees anyone else’s fake', () => {
    const { h, players } = session('twoTruths');
    let host = players[0] as FakeClient;
    expect(step(host)).toBe('setup');
    expect(view(host).session?.rounds).toBe(5);
    const s0 = game(h) as TruthsState;
    const fakes = players.map((p) => s0.offers[p.playerId ?? '']?.text ?? '?');

    const [p1] = players as [FakeClient];
    submit(p1, 'setup', { reroll: true });
    const rerolled = (game(h) as TruthsState).offers[p1.playerId ?? '']?.text ?? '?';
    const mine = play(p1);
    expect(mine?.gameId === 'twoTruths' && mine.me.setup?.fake).toBe(rerolled);
    expect(mine?.gameId === 'twoTruths' && mine.me.setup?.rerollsLeft).toBe(1);

    // Mid-setup refresh: the fake and rerolls come back.
    const back = refresh(h, p1);
    const restored = play(back);
    expect(restored?.gameId === 'twoTruths' && restored.me.setup).toMatchObject({
      fake: rerolled,
      rerollsLeft: 1,
      truths: null,
    });
    players[0] = back;
    host = back;

    // Only 3 of 5 type their facts: the block shrinks to 3 spotlights.
    players.slice(0, 3).forEach((p, i) => {
      submit(p, 'setup', { truths: [`truth A${i}`, `truth B${i}`] });
    });
    // Leak check: during setup, no phone saw another player's fake or facts.
    players.forEach((p, i) => {
      fakes.forEach((f, j) => {
        if (i !== j) expect(frames(p)).not.toContain(f);
      });
      players.forEach((_, j) => {
        if (i !== j) expect(frames(p)).not.toContain(`truth A${j}`);
      });
    });

    h.until(() => step(host) === 'guess');
    expect(view(host).session?.rounds).toBe(3);
    const s = game(h) as TruthsState;
    const spot = s.spotlight ?? '';
    const marks = players.map((p) => p.inbox.length);
    for (const p of players) {
      if (p.playerId !== spot) submit(p, 'guess', { guess: (s.fakeIndex + 1) % 3 });
    }
    expect(view(host).phase).toBe('roundReveal');
    // The fake's position never reached a phone before the reveal.
    players.forEach((p, i) => {
      const before = JSON.stringify(p.inbox.slice(0, marks[i]));
      expect(before).not.toContain('"fakeIndex"');
    });
    h.until(() => view(host).phase === 'drink');
    const drinkers = view(host).session?.drink?.drinkers ?? [];
    expect(drinkers).toHaveLength(4);
    expect(drinkers.every((d) => d.reason === 'fooled')).toBe(true);

    h.until(() => view(host).phase === 'roundInput');
    expect(view(host).session?.round).toBe(2);
    expect(step(host)).toBe('guess');
    h.until(() => view(host).phase === 'gameOutro' || view(host).phase === 'results', 300_000);
    expect(view(host).session?.round).toBe(3);
  });
});

describe('Fake Answer', () => {
  it('rejects a too-close fake, merges duplicates, and fooled voters drink', () => {
    const { h, players, host } = session('fakeAnswer');
    const s = game(h) as FakeState;
    const answer = s.entry?.answer ?? '?';
    const [p1, p2, p3, p4, p5] = players as [
      FakeClient,
      FakeClient,
      FakeClient,
      FakeClient,
      FakeClient,
    ];
    submit(p1, 'write', { fake: answer });
    expect(p1.last('error')?.message).toBe('Too close, try again.');
    submit(p1, 'write', { fake: 'Glow sticks' });
    submit(p2, 'write', { fake: 'glow sticks!' });
    submit(p3, 'write', { fake: 'Pet rocks' });

    // A phone refreshed mid-write gets its own fake back, and nobody else's.
    const back = refresh(h, p2);
    const pv = play(back);
    expect(pv?.gameId === 'fakeAnswer' && pv.me.fake).toBe('glow sticks!');
    players[1] = back;

    submit(p4, 'write', { fake: 'Rubber chickens' });
    submit(p5, 'write', { fake: 'Yo-yos' });
    expect(step(host)).toBe('vote');
    const v = game(h) as FakeState;
    expect(v.options).toHaveLength(5);
    // The real answer is among the options, but nothing says which.
    expect(frames(host)).not.toContain('realIndex');
    expect(frames(p4)).not.toContain('"authors"');
    const glow = v.options.findIndex((o) => o.toLowerCase().startsWith('glow'));
    const mine = play(back);
    expect(mine?.gameId === 'fakeAnswer' && mine.me.mine).toEqual([glow]);
    submit(back, 'vote', { vote: glow });
    expect(back.last('error')?.message).toBe("That's yours! Pick another.");

    submit(p1, 'vote', { vote: v.realIndex });
    submit(back, 'vote', { vote: v.realIndex });
    submit(p3, 'vote', { vote: glow });
    submit(p4, 'vote', { vote: glow });
    submit(p5, 'vote', { vote: v.realIndex });
    expect(view(host).phase).toBe('roundReveal');
    const r = play(host);
    expect(r?.gameId === 'fakeAnswer' && r.reveal?.masterLiars).toEqual([
      p1.playerId,
      back.playerId,
    ]);
    h.until(() => view(host).phase === 'drink');
    expect(view(host).session?.drink?.drinkers).toEqual([
      { id: p3.playerId, reason: 'fooled' },
      { id: p4.playerId, reason: 'fooled' },
    ]);
  });
});

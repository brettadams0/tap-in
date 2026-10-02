import { describe, expect, it } from 'vitest';
import type { GameId, RoomView } from '@tap-in/shared';
import { LEAD_MS, PAUSE_MS, WATER_EVERY_MS, GONE_AFTER_MS } from '../src/engine/state.js';
import { Harness, type FakeClient } from './harness.js';

const COLORS = ['red', 'sky', 'green', 'pink', 'lemon'] as const;

function session(games: GameId[], n = 5, opts: { seed?: string; length?: 'short' } = {}) {
  const h = new Harness({ seed: opts.seed ?? 'session' });
  const players = Array.from({ length: n }, (_, i) => h.join(`P${i + 1}`, COLORS[i]));
  const host = players[0] as FakeClient;
  host.send({
    type: 'hostAction',
    action: {
      kind: 'settings',
      settings: { games, ...(opts.length ? { length: opts.length } : {}) },
    },
  });
  host.send({ type: 'hostAction', action: { kind: 'start' } });
  return { h, players, host };
}

const view = (c: FakeClient): RoomView => {
  if (!c.view) throw new Error('no view');
  return c.view;
};
const phase = (c: FakeClient) => view(c).phase;
const sess = (c: FakeClient) => {
  const s = view(c).session;
  if (!s) throw new Error('no session');
  return s;
};

function voteAll(players: FakeClient[], sides: ('a' | 'b' | null)[]) {
  players.forEach((p, i) => {
    const side = sides[i];
    if (side) p.send({ type: 'submit', step: 'vote', data: { side } });
  });
}

describe('session flow', () => {
  it('runs intro → title card → rounds → reveal → Drink → next round', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    expect(phase(host)).toBe('intro');
    expect(view(host).phaseAt).toBe(h.time + LEAD_MS);
    expect(sess(host).drinks).toEqual(Object.fromEntries(players.map((p) => [p.playerId, 0])));

    h.until(() => phase(host) === 'gameIntro');
    expect(sess(host).gameId).toBe('wouldYouRather');
    expect(sess(host).block).toBe(1);

    h.until(() => phase(host) === 'roundInput');
    const s = sess(host);
    expect(s.round).toBe(1);
    expect(s.rounds).toBe(4);
    expect(s.play?.gameId).toBe('wouldYouRather');
    expect(s.play?.step).toBe('vote');
    expect(view(host).phaseEndsAt).toBe(h.time + 15_000);

    voteAll(players, ['a', 'a', 'a', 'b', 'b']);
    // Everyone voted: the step ends early and the reveal starts.
    expect(phase(host)).toBe('roundReveal');
    const play = sess(host).play;
    expect(play?.gameId === 'wouldYouRather' && play.reveal?.b).toEqual([
      players[3]?.playerId,
      players[4]?.playerId,
    ]);
    expect(sess(host).drink).toBeNull();

    h.until(() => phase(host) === 'drink');
    const drink = sess(host).drink;
    expect(drink?.drinkers.map((d) => d.id)).toEqual([players[3]?.playerId, players[4]?.playerId]);
    expect(drink?.drinkers.every((d) => d.reason === 'smallerSide')).toBe(true);
    expect(sess(host).drinks[players[3]?.playerId ?? '']).toBe(1);

    // Both drinkers tap Done: the moment wraps up early.
    players[3]?.send({ type: 'ready' });
    players[4]?.send({ type: 'ready' });
    players[0]?.send({ type: 'ready' }); // not a drinker: ignored
    expect(sess(host).done).toHaveLength(2);
    h.advance(2500);
    expect(phase(host)).toBe('roundInput');
    expect(sess(host).round).toBe(2);
  });

  it('plays every round, then the outro, then the next game, then results', () => {
    const { h, host } = session(['wouldYouRather', 'reactionShotgun'], 5, { length: 'short' });
    const seen = new Set<string>();
    h.until(
      () => {
        seen.add(`${phase(host)}:${sess(host).gameId ?? ''}`);
        return phase(host) === 'results';
      },
      30 * 60_000,
      250,
    );
    expect(seen).toContain('gameOutro:wouldYouRather');
    expect(seen).toContain('roundInput:reactionShotgun');
    const results = sess(host).results;
    expect(results?.standings).toHaveLength(5);
    expect(results?.games.length).toBeGreaterThanOrEqual(2);
    // Nobody tapped or voted, so everyone collected drinks and the tally adds up.
    const total = Object.values(sess(host).drinks).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(results?.awards.map((a) => a.id)).toContain('mostDrinks');
    expect(view(host).phaseEndsAt).toBeNull();
  });

  it('keeps every vote private until the reveal', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    h.until(() => phase(host) === 'roundInput');
    const [p1, p2] = players as [FakeClient, FakeClient];
    const before = p2.inbox.length;
    p1.send({ type: 'submit', step: 'vote', data: { side: 'b' } });
    const p1Play = sess(p1).play;
    expect(p1Play?.gameId === 'wouldYouRather' && p1Play.me).toEqual({ choice: 'b' });
    const p2Play = sess(p2).play;
    expect(p2Play?.gameId === 'wouldYouRather' && p2Play.me).toEqual({ choice: null });
    // p2 learns only that p1 locked in, never which side.
    expect(sess(p2).locked).toEqual([p1.playerId]);
    expect(JSON.stringify(p2.inbox.slice(before))).not.toContain('"b"');
  });

  it('applies the 2-in-a-row fairness cap', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    const loner = players[4] as FakeClient;
    const drinkersPerRound: string[][] = [];
    for (let round = 0; round < 3; round++) {
      h.until(() => phase(host) === 'roundInput');
      voteAll(players, ['a', 'a', 'a', 'a', 'b']);
      h.until(() => phase(host) === 'drink');
      drinkersPerRound.push(sess(host).drink?.drinkers.map((d) => d.id) ?? []);
      if (round === 2) {
        expect(sess(host).drink?.saves).toEqual([{ saved: loner.playerId, by: null }]);
        expect(sess(host).drink?.nobody).toBe('lucky');
      }
      h.until(() => phase(host) !== 'drink');
    }
    expect(drinkersPerRound).toEqual([[loner.playerId], [loner.playerId], []]);
    expect(sess(host).drinks[loner.playerId ?? '']).toBe(2);
  });

  it('runs Reaction Shotgun with a synced flash and a ms leaderboard', () => {
    const { h, players, host } = session(['reactionShotgun', 'tapRace']);
    h.until(() => phase(host) === 'roundInput');
    expect(sess(host).play?.step).toBe('ready');
    h.until(() => sess(host).play?.step === 'armed');
    const play = sess(host).play;
    const flashAt = play?.gameId === 'reactionShotgun' ? play.pub.flashAt : null;
    expect(flashAt).not.toBeNull();
    expect((flashAt ?? 0) - h.time).toBeLessThanOrEqual(LEAD_MS);
    h.until(() => h.time >= (flashAt ?? 0) + 200);
    players.forEach((p, i) => {
      p.send({ type: 'submit', step: 'armed', data: { ms: 200 + i * 50 } });
    });
    expect(phase(host)).toBe('roundReveal');
    const reveal = sess(host).play;
    expect(reveal?.gameId === 'reactionShotgun' && reveal.reveal?.board.map((e) => e.ms)).toEqual([
      200, 250, 300, 350, 400,
    ]);
    h.until(() => phase(host) === 'drink');
    expect(sess(host).drink?.drinkers).toEqual([{ id: players[4]?.playerId, reason: 'slowest' }]);
  });

  it('rejects input for the wrong step, bad data and outside play', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    const p = players[1] as FakeClient;
    p.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    expect(p.errors()).toContain('WRONG_STEP');
    h.until(() => phase(host) === 'roundInput');
    p.send({ type: 'submit', step: 'armed', data: { side: 'a' } });
    p.send({ type: 'submit', step: 'vote', data: { side: 'c' } });
    p.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    p.send({ type: 'submit', step: 'vote', data: { side: 'b' } });
    expect(p.errors()).toEqual(['WRONG_STEP', 'WRONG_STEP', 'BAD_MESSAGE', 'REJECTED']);
  });

  it('pauses (host only), shifts the timer on resume and auto-resumes after 60 s', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    h.until(() => phase(host) === 'roundInput');
    players[1]?.send({ type: 'hostAction', action: { kind: 'pause' } });
    expect(players[1]?.errors()).toContain('NOT_HOST');
    const endsAt = view(host).phaseEndsAt ?? 0;
    const left = endsAt - h.time;
    host.send({ type: 'hostAction', action: { kind: 'pause' } });
    expect(sess(host).overlay).toEqual({ kind: 'paused', endsAt: h.time + PAUSE_MS });
    expect(view(host).phaseEndsAt).toBeNull();
    host.send({ type: 'hostAction', action: { kind: 'pause' } });
    expect(host.errors()).toContain('NOT_ALLOWED');
    // Votes are frozen while paused.
    players[2]?.send({ type: 'submit', step: 'vote', data: { side: 'a' } });
    expect(players[2]?.errors()).toContain('WRONG_STEP');
    h.advance(5000);
    host.send({ type: 'hostAction', action: { kind: 'resume' } });
    expect(sess(host).overlay).toBeNull();
    expect(view(host).phaseEndsAt).toBe(h.time + left);

    host.send({ type: 'hostAction', action: { kind: 'pause' } });
    h.advance(PAUSE_MS + 10);
    expect(sess(host).overlay).toBeNull();
    expect(phase(host)).toBe('roundInput');
  });

  it('offers a water break about every 10 minutes, between rounds', () => {
    const { h, host } = session(['wouldYouRather', 'reactionShotgun'], 5, { seed: 'water' });
    h.until(() => sess(host).overlay?.kind === 'water', WATER_EVERY_MS + 5 * 60_000, 250);
    expect(phase(host)).toBe('drink');
    h.until(() => sess(host).overlay === null, 20_000);
    expect(['roundInput', 'gameOutro']).toContain(phase(host));
  });

  it('waits for players when fewer than 3 are active, and resumes when one returns', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace'], 3);
    h.until(() => phase(host) === 'roundInput');
    const leaver = players[2] as FakeClient;
    leaver.disconnect();
    // Reconnecting players still count; after 3 minutes they're gone.
    expect(sess(host).overlay).toBeNull();
    h.until(() => sess(host).overlay?.kind === 'waiting', GONE_AFTER_MS + 120_000, 1000);
    const back = h.connect();
    back.send({ type: 'rejoin', playerId: leaver.playerId ?? '', token: leaver.token ?? '' });
    expect(sess(host).overlay).toBeNull();
    expect(phase(back)).not.toBe('lobby');
  });

  it('freezes when nobody is connected', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace'], 3);
    h.until(() => phase(host) === 'roundInput');
    for (const p of players) p.disconnect();
    expect(h.saved?.session?.overlay?.kind).toBe('waiting');
    expect(h.saved?.phase).toBe('roundInput');
  });

  it('ends early to results, then rematch or back to the lobby', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    host.send({ type: 'hostAction', action: { kind: 'rematch' } });
    expect(host.errors()).toContain('NOT_ALLOWED');
    h.until(() => phase(host) === 'roundInput');
    voteAll(players, ['a', 'a', 'a', 'b', 'b']);
    host.send({ type: 'hostAction', action: { kind: 'end' } });
    expect(phase(host)).toBe('results');
    expect(sess(host).results?.standings.map((s) => s.drinks)).toEqual([0, 0, 0, 0, 0]);
    host.send({ type: 'hostAction', action: { kind: 'end' } });
    expect(host.errors().filter((e) => e === 'NOT_ALLOWED')).toHaveLength(2);
    // Caps can change on the results screen.
    host.send({
      type: 'avatar',
      avatar: { ...(view(host).players[0]?.avatar ?? avatarFallback), topper: 'crown' },
    });
    expect(view(host).players[0]?.avatar.topper).toBe('crown');

    host.send({ type: 'hostAction', action: { kind: 'rematch' } });
    expect(phase(host)).toBe('intro');
    expect(sess(host).block).toBe(0);
    h.until(() => phase(host) === 'gameIntro');
    host.send({ type: 'hostAction', action: { kind: 'end' } });
    host.send({ type: 'hostAction', action: { kind: 'lobby' } });
    expect(phase(host)).toBe('lobby');
    expect(view(host).session).toBeNull();
    host.send({ type: 'hostAction', action: { kind: 'lobby' } });
    expect(host.errors().at(-1)).toBe('NOT_ALLOWED');
  });

  it("won't start when none of the enabled games are playable yet", () => {
    const h = new Harness();
    const players = COLORS.slice(0, 3).map((c, i) => h.join(`P${i + 1}`, c));
    const host = players[0] as FakeClient;
    host.send({
      type: 'hostAction',
      action: { kind: 'settings', settings: { games: ['tapRace', 'countdown'] } },
    });
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    expect(host.errors()).toContain('NOT_ALLOWED');
    expect(phase(host)).toBe('lobby');
    host.send({ type: 'hostAction', action: { kind: 'pause' } });
    expect(host.errors().at(-1)).toBe('NOT_ALLOWED');
  });

  it('a removed player mid-round no longer holds the round up', () => {
    const { h, players, host } = session(['wouldYouRather', 'tapRace']);
    h.until(() => phase(host) === 'roundInput');
    voteAll(players, ['a', 'a', 'b', 'b', null]);
    expect(phase(host)).toBe('roundInput');
    host.send({
      type: 'hostAction',
      action: { kind: 'remove', playerId: players[4]?.playerId ?? '' },
    });
    expect(phase(host)).toBe('roundReveal');
  });
});

const avatarFallback = {
  color: 'red',
  pattern: 'solid',
  eyes: 'dots',
  mouth: 'grin',
  topper: 'none',
} as const;

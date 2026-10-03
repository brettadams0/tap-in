import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { spinTheBottle as g, type SpinState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4'];

function ok(s: SpinState | { reject: string }): SpinState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

function landed(ctx: GameCtx): SpinState {
  const s = { ...g.startRound(g.init(ctx), ctx), chosen: 'p2' };
  return g.onTimer(s, ctx);
}

describe('Spin the Bottle', () => {
  it('decides the result before the spin and lands every phone on it', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    const pub = g.publicView(s);
    expect(players).toContain(pub.chosen);
    expect(pub.ring).toEqual(players);
    expect(pub.spinAt).toBe(ctx.now + 600);
    expect(pub.landAt).toBe(pub.spinAt + 4000);
    expect(pub.dare).toBeNull();
    expect(g.endsEarly(s)).toBe(false);
    expect(g.awaiting(s)).toEqual([]);
  });

  it('never lands on a player the fairness cap would excuse', () => {
    for (let i = 0; i < 30; i++) {
      const ctx = testCtx(players, { seed: `spin${i}`, capped: ['p1', 'p2', 'p3'] });
      expect(g.startRound(g.init(ctx), ctx).chosen).toBe('p4');
    }
    const all = testCtx(players, { capped: players });
    expect(players).toContain(g.startRound(g.init(all), all).chosen);
  });

  it('dare, perform, Done beats Nope: nobody drinks', () => {
    const ctx = testCtx(players);
    let s = landed(ctx);
    expect(g.step(s)).toBe('choice');
    expect(g.publicView(s).dare).toBeTruthy();
    expect(g.awaiting(s)).toEqual(['p2']);
    expect(g.onInput(s, 'p1', { choice: 'dare' }, ctx)).toEqual({ reject: "It's not your spin." });
    s = ok(g.onInput(s, 'p2', { choice: 'dare' }, ctx));
    expect(g.step(s)).toBe('perform');
    expect(g.onInput(s, 'p1', { performed: true }, ctx)).toEqual({
      reject: "It's not your dare.",
    });
    s = ok(g.onInput(s, 'p2', { performed: true }, ctx));
    expect(g.step(s)).toBe('confirm');
    expect(g.onInput(s, 'p2', { verdict: 'done' }, ctx)).toEqual({
      reject: "You can't judge your own dare.",
    });
    s = ok(g.onInput(s, 'p1', { verdict: 'done' }, ctx));
    expect(g.onInput(s, 'p1', { verdict: 'nope' }, ctx)).toEqual({ reject: 'Already voted.' });
    expect(g.privateView(s, 'p1').verdict).toBe('done');
    expect(g.privateView(s, 'p3').verdict).toBeNull();
    s = ok(g.onInput(s, 'p3', { verdict: 'nope' }, ctx));
    expect(g.awaiting(s)).toEqual(['p4']);
    s = g.onTimer(s, ctx);
    const r = g.result(s, ctx);
    expect(r.reveal).toMatchObject({ choice: 'dare', done: 1, nope: 1, passed: true });
    expect(r.nobody).toBe('dared');
    expect(r.assigned).toEqual([]);
  });

  it('Nope beats Done: the dare failed and they drink', () => {
    const ctx = testCtx(players);
    let s = ok(g.onInput(landed(ctx), 'p2', { choice: 'dare' }, ctx));
    s = g.onTimer(s, ctx); // ran out of time performing → straight to the vote
    expect(g.step(s)).toBe('confirm');
    s = ok(g.onInput(s, 'p1', { verdict: 'nope' }, ctx));
    s = g.onTimer(s, ctx);
    expect(g.result(s, ctx).assigned).toEqual([{ id: 'p2', reason: 'dareFailed' }]);
  });

  it('choosing Drink, or running out of time, is self-inflicted', () => {
    const ctx = testCtx(players);
    const chose = ok(g.onInput(landed(ctx), 'p2', { choice: 'drink' }, ctx));
    expect(g.roundOver(chose)).toBe(true);
    expect(g.result(chose, ctx).selfInflicted).toEqual([{ id: 'p2', reason: 'choseDrink' }]);
    const late = g.onTimer(landed(ctx), ctx);
    expect(late.choice).toBe('drink');
    // A chosen player who dropped is never penalised for it.
    const gone = testCtx(players, { connected: ['p1'] });
    const dropped = g.onTimer(landed(gone), gone);
    expect(dropped.choice).toBeNull();
    expect(g.result(dropped, gone)).toMatchObject({
      selfInflicted: [],
      assigned: [],
      nobody: null,
    });
    expect(g.onInput(dropped, 'p2', { choice: 'dare' }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.onInput(dropped, 'x', { choice: 'dare' }, ctx)).toEqual({ reject: 'Not now.' });
  });

  it('describes its block and shifts its times', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    expect(g.shift(s, 7).landAt).toBe(s.landAt + 7);
    expect(g.shift(g.init(ctx), 7).endsAt).toBeNull();
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(30_000);
    expect(g.revealMs(5)).toBeGreaterThan(1000);
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    expect(g.result(g.init(ctx), ctx).reveal.dare).toBe('');
  });
});

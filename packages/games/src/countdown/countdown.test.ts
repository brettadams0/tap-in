import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { COLLISION_MS, countdown as g, type CountState } from './index.js';

const players = ['p1', 'p2', 'p3'];

function tap(s: CountState, ctx: GameCtx, p: string, at: number): CountState {
  ctx.now = at;
  const next = g.onInput(s, p, { tap: true }, ctx);
  if (isReject(next)) throw new Error(next.reject);
  return next;
}

describe('Countdown', () => {
  it('counts up on every tap, to players + 3', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    expect(g.publicView(s)).toMatchObject({ count: 0, target: 6, lastBy: null });
    expect(g.awaiting(s)).toEqual([]);
    expect(g.endsEarly(s)).toBe(false);
    s = tap(s, ctx, 'p1', ctx.now + 1000);
    expect(g.publicView(s)).toMatchObject({ count: 1, lastBy: 'p1', lastAt: ctx.now });
  });

  it("won't let the same player tap twice in a row (R3)", () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = tap(s, ctx, 'p1', ctx.now + 1000);
    ctx.now += 2000;
    expect(g.onInput(s, 'p1', { tap: true }, ctx)).toEqual({ reject: 'Wait for someone else.' });
    // Inside its own window, too.
    ctx.now -= 1900;
    expect(g.onInput(s, 'p1', { tap: true }, ctx)).toEqual({ reject: 'Wait for someone else.' });
    expect(g.onInput(s, 'x', { tap: true }, ctx)).toEqual({ reject: 'Not now.' });
  });

  it('two taps inside 600 ms collide: the count resets and both are marked', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    const t = ctx.now + 1000;
    s = tap(s, ctx, 'p1', t);
    s = tap(s, ctx, 'p2', t + 200);
    expect(s.count).toBe(1 - 1);
    expect(s.collisions).toEqual([{ ids: ['p1', 'p2'], at: t + 200 }]);
    // A third tapper in the same window joins the same collision.
    s = tap(s, ctx, 'p3', t + 400);
    expect(s.collisions).toEqual([{ ids: ['p1', 'p2', 'p3'], at: t + 200 }]);
    // After the window anyone, even a collider, can start again.
    s = tap(s, ctx, 'p1', t + COLLISION_MS + 10);
    expect(s.count).toBe(1);
    expect(s.best).toBe(1);
  });

  it('reaching the target waits for a clean window, then nobody drinks', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    let t = ctx.now + 1000;
    for (let i = 0; i < 6; i++) {
      s = tap(s, ctx, players[i % 3] ?? '', t);
      t += 700;
    }
    const last = t - 700;
    expect(s.count).toBe(6);
    expect(g.deadline(s)).toBe(last + COLLISION_MS);
    ctx.now = last + 100;
    expect(g.onTimer(s, ctx)).toBe(s);
    ctx.now = last + COLLISION_MS;
    s = g.onTimer(s, ctx);
    expect(g.roundOver(s)).toBe(true);
    expect(g.deadline(s)).toBeNull();
    expect(g.onInput(s, 'p1', { tap: true }, ctx)).toEqual({ reject: 'Not now.' });
    const r = g.result(s, ctx);
    expect(r).toMatchObject({ everyone: false, nobody: 'counted', selfInflicted: [] });
    expect(r.reveal).toMatchObject({ reached: true, target: 6, best: 6 });
  });

  it('running out of time: everyone drinks, and colliders are on the list', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    const t = ctx.now + 1000;
    s = tap(s, ctx, 'p1', t);
    s = tap(s, ctx, 'p2', t + 100);
    ctx.now = s.endsAt;
    s = g.onTimer(s, ctx);
    const r = g.result(s, ctx);
    expect(r.everyone).toBe(true);
    expect(r.selfInflicted).toEqual([
      { id: 'p1', reason: 'collision' },
      { id: 'p2', reason: 'collision' },
    ]);
    expect(r.nobody).toBeNull();
    expect(r.stats).toEqual({ p1: { chaos: 1 }, p2: { chaos: 1 } });
  });

  it('shifts every time after a pause', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = tap(s, ctx, 'p1', ctx.now + 10);
    s = tap(s, ctx, 'p2', ctx.now + 10);
    const moved = g.shift(s, 1000);
    expect(moved.endsAt).toBe(s.endsAt + 1000);
    expect(moved.collisions[0]?.at).toBe((s.collisions[0]?.at ?? 0) + 1000);
    expect(moved.windowAt).toBe((s.windowAt ?? 0) + 1000);
    const idle = g.shift(g.init(ctx), 5);
    expect(idle.lastAt).toBeNull();
    expect(idle.windowAt).toBeNull();
    expect(g.privateView(s, 'p1')).toEqual({});
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(30_000);
    expect(g.revealMs(5)).toBeGreaterThan(1000);
  });
});

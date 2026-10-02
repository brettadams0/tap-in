import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { reactionShotgun as g, type ShotgunState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function at(ctx: GameCtx, now: number): GameCtx {
  return { ...ctx, now };
}

function tap(s: ShotgunState, p: string, ms: number | null, ctx: GameCtx): ShotgunState {
  const next = g.onInput(s, p, { ms }, ctx);
  if (isReject(next)) throw new Error(next.reject);
  return next;
}

/** Start a round and run timers until the real flash is armed. */
function armed(seed = 'test') {
  const ctx = testCtx(players, { seed });
  let s = g.startRound(g.init(ctx), ctx);
  while (g.step(s) !== 'armed') s = g.onTimer(s, at(ctx, g.deadline(s) ?? 0));
  return { ctx, s };
}

describe('Reaction Shotgun', () => {
  it('waits 2–7 s and keeps the flash time secret until the lead window', () => {
    for (let i = 0; i < 50; i++) {
      const ctx = testCtx(players, { seed: `s${String(i)}` });
      const s = g.startRound(g.init(ctx), ctx);
      expect(s.flashAt - ctx.now).toBeGreaterThanOrEqual(2000);
      expect(s.flashAt - ctx.now).toBeLessThanOrEqual(7000);
      expect(g.publicView(s)).toEqual({ fakeAt: null, flashAt: null });
      expect(g.deadline(s)).toBe((s.fakeAt ?? s.flashAt) - 600);
      if (s.fakeAt !== null) {
        expect(s.fakeAt - ctx.now).toBeGreaterThanOrEqual(1000);
        expect(s.flashAt - s.fakeAt).toBeGreaterThanOrEqual(800);
      }
    }
  });

  it('includes a fake-out in roughly 30% of rounds', () => {
    let fakes = 0;
    for (let i = 0; i < 400; i++) {
      const ctx = testCtx(players, { seed: `f${String(i)}` });
      if (g.startRound(g.init(ctx), ctx).fakeAt !== null) fakes++;
    }
    expect(fakes / 400).toBeGreaterThan(0.18);
    expect(fakes / 400).toBeLessThan(0.36);
  });

  it('steps ready → fake → armed → done, revealing each time only in its lead window', () => {
    let seed = 0;
    let ctx = testCtx(players, { seed: 'x0' });
    let s = g.startRound(g.init(ctx), ctx);
    while (s.fakeAt === null) {
      ctx = testCtx(players, { seed: `x${String(++seed)}` });
      s = g.startRound(g.init(ctx), ctx);
    }
    s = g.onTimer(s, ctx);
    expect(g.step(s)).toBe('fake');
    expect(g.publicView(s)).toEqual({ fakeAt: s.fakeAt, flashAt: null });
    s = g.onTimer(s, ctx);
    expect(g.step(s)).toBe('armed');
    expect(g.publicView(s).flashAt).toBe(s.flashAt);
    expect(g.deadline(s)).toBe(s.flashAt + 2500);
    s = g.onTimer(s, ctx);
    expect(g.roundOver(s)).toBe(true);
  });

  it('early taps drink and the slowest is spared', () => {
    const r0 = armed();
    const ctx = r0.ctx;
    let s = r0.s;
    const after = at(ctx, s.flashAt + 300);
    s = tap(s, 'p1', null, at(ctx, s.flashAt - 1000));
    s = tap(s, 'p2', 250, after);
    s = tap(s, 'p3', 400, after);
    s = tap(s, 'p4', 300, after);
    s = tap(s, 'p5', 500, after);
    s = g.onTimer(s, after);
    const r = g.result(s, after);
    expect(r.selfInflicted).toEqual([{ id: 'p1', reason: 'early' }]);
    expect(r.assigned).toEqual([]);
    expect(r.reveal.board.map((e) => e.id)).toEqual(['p2', 'p4', 'p3', 'p5', 'p1']);
    expect(r.stats?.p2).toEqual({ reactionMs: 250 });
  });

  it('otherwise the slowest drinks, ties all drink', () => {
    const r0 = armed();
    const ctx = r0.ctx;
    let s = r0.s;
    const after = at(ctx, s.flashAt + 400);
    s = tap(s, 'p1', 200, after);
    s = tap(s, 'p2', 333, after);
    s = tap(s, 'p3', 333, after);
    s = tap(s, 'p4', 210, after);
    s = tap(s, 'p5', 220, after);
    const r = g.result(g.onTimer(s, after), after);
    expect(r.assigned).toEqual([
      { id: 'p2', reason: 'slowest' },
      { id: 'p3', reason: 'slowest' },
    ]);
    expect(r.ranking[0]).toBe('p3');
  });

  it('a connected player who never taps is the slowest; a disconnected one abstains', () => {
    const r0 = armed();
    const ctx = r0.ctx;
    let s = r0.s;
    const after = { ...at(ctx, s.flashAt + 400), connected: ['p1', 'p2', 'p3', 'p4'] };
    s = tap(s, 'p1', 200, after);
    s = tap(s, 'p2', 900, after);
    s = tap(s, 'p3', 300, after);
    const r = g.result(g.onTimer(s, after), after);
    expect(r.assigned).toEqual([{ id: 'p4', reason: 'noTap' }]);
    expect(r.reveal.board.map((e) => e.id)).toEqual(['p1', 'p3', 'p2', 'p4']);
    expect(r.ranking).toEqual(['p4', 'p2', 'p3', 'p1']);
  });

  it('counts sub-90 ms, fake-out and too-early-to-be-real taps as early', () => {
    const r0 = armed();
    const ctx = r0.ctx;
    let s = r0.s;
    s = tap(s, 'p1', 60, at(ctx, s.flashAt + 100));
    s = tap(s, 'p2', 300, at(ctx, s.flashAt - 200));
    s = tap(s, 'p3', null, at(ctx, s.flashAt + 100));
    expect(g.privateView(s, 'p1')).toEqual({ tapped: true, early: true, ms: null });
    expect(g.privateView(s, 'p4')).toEqual({ tapped: false, early: false, ms: null });
    expect(isReject(g.onInput(s, 'p1', { ms: 300 }, ctx))).toBe(true);
    expect(isReject(g.onInput(s, 'p9', { ms: 300 }, ctx))).toBe(true);
    const r = g.result(g.onTimer(s, ctx), ctx);
    expect(r.selfInflicted.map((d) => d.id)).toEqual(['p1', 'p2', 'p3']);
    expect(isReject(g.onInput(g.onTimer(s, ctx), 'p4', { ms: 300 }, ctx))).toBe(true);
  });

  it('a tap during the ready step is early', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = tap(s, 'p1', null, ctx);
    expect(s.taps.p1).toEqual({ ms: null, early: true });
    expect(g.awaiting(s)).toEqual(['p2', 'p3', 'p4', 'p5']);
  });

  it('shifts every absolute time after a pause', () => {
    const { s } = armed();
    const shifted = g.shift(s, 10_000);
    expect(shifted.flashAt).toBe(s.flashAt + 10_000);
    expect(g.deadline(shifted)).toBe((g.deadline(s) ?? 0) + 10_000);
    expect(g.shift({ ...s, endsAt: null, fakeAt: null }, 5).endsAt).toBeNull();
    expect(g.endsEarly(s)).toBe(true);
    expect(g.estimateMs(5)).toBeGreaterThan(30_000);
    expect(g.revealMs(5)).toBeGreaterThan(2000);
    expect(g.rounds(5)).toBe(4);
  });
});

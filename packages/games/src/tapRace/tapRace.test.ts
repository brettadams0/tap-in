import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject } from '../types.js';
import { MAX_TAPS, TAP_MS, tapRace as g, type TapState } from './index.js';

const players = ['p1', 'p2', 'p3'];

function ok(s: TapState | { reject: string }): TapState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

describe('Tap Race', () => {
  it('runs a synced 3-2-1 then a 5 s window, never time-scaled', () => {
    const ctx = { ...testCtx(players), ms: (d: number) => d / 10 };
    const s = g.startRound(g.init(ctx), ctx);
    expect(s.goAt).toBe(ctx.now + 600 + 300);
    expect(g.publicView(s)).toEqual({ goAt: s.goAt, tapMs: TAP_MS });
    expect(g.deadline(s)).toBe(s.goAt + TAP_MS + 1500);
  });

  it('takes one count per phone after the go, and refuses the impossible', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    expect(g.onInput(s, 'p1', { count: 10 }, ctx)).toEqual({ reject: 'Not yet!' });
    ctx.now = s.goAt + TAP_MS;
    expect(g.onInput(s, 'p1', { count: MAX_TAPS + 1 }, ctx)).toEqual({
      reject: "That's not humanly possible.",
    });
    s = ok(g.onInput(s, 'p1', { count: 42 }, ctx));
    expect(g.onInput(s, 'p1', { count: 43 }, ctx)).toEqual({ reject: 'Already counted.' });
    expect(g.onInput(s, 'x', { count: 1 }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.privateView(s, 'p1').count).toBe(42);
    expect(g.privateView(s, 'p2').count).toBeNull();
    expect(g.awaiting(s)).toEqual(['p2', 'p3']);
  });

  it('the fewest taps drinks; a silent connected phone scores 0', () => {
    const ctx = testCtx(players, { connected: ['p1', 'p2'] });
    let s = g.startRound(g.init(ctx), ctx);
    ctx.now = s.goAt + TAP_MS;
    s = ok(g.onInput(s, 'p1', { count: 40 }, ctx));
    s = g.onTimer(s, ctx);
    const r = g.result(s, ctx);
    expect(r.reveal.board).toEqual([
      { id: 'p1', count: 40 },
      { id: 'p2', count: null },
    ]);
    expect(r.assigned).toEqual([{ id: 'p2', reason: 'noAnswer' }]);
    expect(r.ranking).toEqual(['p2', 'p1']);
    // Fastest thumbs: only real counts become stats.
    expect(r.stats).toEqual({ p1: { taps: 40 } });
  });

  it('ties for fewest all drink', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    ctx.now = s.goAt + 1;
    s = ok(g.onInput(s, 'p1', { count: 30 }, ctx));
    s = ok(g.onInput(s, 'p2', { count: 30 }, ctx));
    s = ok(g.onInput(s, 'p3', { count: 50 }, ctx));
    expect(g.roundOver(g.onTimer(s, ctx))).toBe(true);
    expect(g.result(s, ctx).assigned).toEqual([
      { id: 'p1', reason: 'fewestTaps' },
      { id: 'p2', reason: 'fewestTaps' },
    ]);
    expect(g.result(g.init(ctx), { ...ctx, connected: [] }).assigned).toEqual([]);
  });

  it('describes its block', () => {
    const ctx = testCtx(players);
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(30_000);
    expect(g.revealMs(5)).toBeGreaterThan(2000);
    expect(g.endsEarly(g.init(ctx))).toBe(true);
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    const s = g.startRound(g.init(ctx), ctx);
    expect(g.shift(s, 10).goAt).toBe(s.goAt + 10);
    expect(g.shift(g.init(ctx), 10).endsAt).toBeNull();
  });
});

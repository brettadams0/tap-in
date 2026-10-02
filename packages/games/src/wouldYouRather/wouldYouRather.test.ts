import { describe, expect, it } from 'vitest';
import { isReject } from '../types.js';
import { testCtx } from '../testCtx.js';
import { wouldYouRather as g, type WyrState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function round(votes: Record<string, 'a' | 'b'>, connected = players) {
  const ctx = testCtx(players, { connected });
  let s = g.startRound(g.init(ctx), ctx);
  for (const [p, side] of Object.entries(votes)) {
    const next = g.onInput(s, p, { side }, ctx);
    if (isReject(next)) throw new Error(next.reject);
    s = next;
  }
  s = g.onTimer(s, ctx);
  return { s, result: g.result(s, ctx) };
}

describe('Would You Rather', () => {
  it('starts a round with a prompt, a 15 s timer and everyone awaited', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    expect(s.round).toBe(1);
    expect(g.step(s)).toBe('vote');
    expect(g.deadline(s)).toBe(ctx.now + 15_000);
    expect(g.awaiting(s)).toEqual(players);
    expect(g.publicView(s).a.length).toBeGreaterThan(2);
    expect(ctx.used).toHaveLength(1);
    expect(g.rounds(5)).toBe(4);
  });

  it('keeps votes private until the reveal', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = g.onInput(s, 'p1', { side: 'a' }, ctx) as WyrState;
    expect(g.privateView(s, 'p1')).toEqual({ choice: 'a' });
    expect(g.privateView(s, 'p2')).toEqual({ choice: null });
    expect(JSON.stringify(g.publicView(s))).not.toContain('p1');
    expect(g.awaiting(s)).toEqual(['p2', 'p3', 'p4', 'p5']);
  });

  it('rejects double votes, outsiders and late votes', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = g.onInput(s, 'p1', { side: 'a' }, ctx) as WyrState;
    expect(isReject(g.onInput(s, 'p1', { side: 'b' }, ctx))).toBe(true);
    expect(isReject(g.onInput(s, 'p9', { side: 'b' }, ctx))).toBe(true);
    s = g.onTimer(s, ctx);
    expect(g.roundOver(s)).toBe(true);
    expect(g.awaiting(s)).toEqual([]);
    expect(isReject(g.onInput(s, 'p2', { side: 'b' }, ctx))).toBe(true);
  });

  it('makes the smaller side drink', () => {
    const { result } = round({ p1: 'a', p2: 'a', p3: 'a', p4: 'b', p5: 'b' });
    expect(result.assigned).toEqual([
      { id: 'p4', reason: 'smallerSide' },
      { id: 'p5', reason: 'smallerSide' },
    ]);
    expect(result.reveal).toEqual({ a: ['p1', 'p2', 'p3'], b: ['p4', 'p5'], noVote: [] });
    expect(result.nobody).toBeNull();
  });

  it('a tie is perfectly balanced and a unanimous vote is safe', () => {
    const four = ['p1', 'p2', 'p3', 'p4'];
    const tie = round({ p1: 'a', p2: 'a', p3: 'b', p4: 'b' }, four);
    expect(tie.result.assigned).toEqual([]);
    expect(tie.result.nobody).toBe('balanced');
    const all = round({ p1: 'a', p2: 'a', p3: 'a', p4: 'a', p5: 'a' });
    expect(all.result.nobody).toBe('unanimous');
  });

  it('connected non-voters drink; disconnected ones abstain', () => {
    const { result } = round({ p1: 'a', p2: 'a', p3: 'b' }, ['p1', 'p2', 'p3', 'p4']);
    expect(result.assigned).toEqual([
      { id: 'p4', reason: 'noVote' },
      { id: 'p3', reason: 'smallerSide' },
    ]);
    expect(result.reveal.noVote).toEqual(['p4']);
  });

  it('shifts its deadline after a pause', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    expect(g.deadline(g.shift(s, 5000))).toBe(ctx.now + 20_000);
    expect(g.deadline(g.shift(g.onTimer(s, ctx), 5000))).toBeNull();
    expect(g.endsEarly(s)).toBe(true);
    expect(g.estimateMs(5)).toBeGreaterThan(60_000);
    expect(g.revealMs(5)).toBeGreaterThan(2000);
  });
});

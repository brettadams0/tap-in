import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject } from '../types.js';
import { averages, distance, rankIt as g, type RankState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function play(rankings: Record<string, number[]>, connected = players) {
  const ctx = testCtx(players, { connected });
  let s = g.startRound(g.init(ctx), ctx);
  for (const [p, ranking] of Object.entries(rankings)) {
    const next = g.onInput(s, p, { ranking }, ctx);
    if (isReject(next)) throw new Error(next.reject);
    s = next;
  }
  s = g.onTimer(s, ctx);
  return { s, r: g.result(s, ctx) };
}

describe('Rank It', () => {
  it('deals four items to everyone and keeps rankings private', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    expect(g.publicView(s).items).toHaveLength(4);
    expect(g.deadline(s)).toBe(ctx.now + 30_000);
    s = g.onInput(s, 'p1', { ranking: [3, 2, 1, 0] }, ctx) as RankState;
    expect(g.privateView(s, 'p1').ranking).toEqual([3, 2, 1, 0]);
    expect(g.privateView(s, 'p2').ranking).toBeNull();
    expect(JSON.stringify(g.publicView(s))).not.toContain('p1');
    expect(g.onInput(s, 'p1', { ranking: [0, 1, 2, 3] }, ctx)).toEqual({
      reject: 'Already locked in.',
    });
    expect(g.onInput(s, 'x', { ranking: [0, 1, 2, 3] }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.awaiting(s)).toEqual(['p2', 'p3', 'p4', 'p5']);
    expect(g.inputSchema.safeParse({ ranking: [0, 0, 1, 2] }).success).toBe(false);
  });

  it('scores distance from the group average', () => {
    const avg = averages(
      [
        [0, 1, 2, 3],
        [0, 1, 2, 3],
        [3, 2, 1, 0],
      ],
      4,
    );
    expect(avg).toEqual([2, 2.33, 2.67, 3]);
    expect(distance([0, 1, 2, 3], avg)).toBe(2.66);
    expect(averages([], 4)).toEqual([0, 0, 0, 0]);
  });

  it('the furthest from the group drinks, plus anyone who never ranked', () => {
    const same = [0, 1, 2, 3];
    const { r } = play({ p1: same, p2: same, p3: same, p4: [3, 2, 1, 0] });
    expect(r.assigned).toEqual([
      { id: 'p5', reason: 'noAnswer' },
      { id: 'p4', reason: 'furthest' },
    ]);
    expect(r.reveal.group).toEqual([0, 1, 2, 3]);
    expect(r.reveal.distances[0]?.id).toBe('p4');
    expect(r.reveal.distances.at(-1)).toEqual({ id: 'p5', distance: null, ranking: null });
    expect(r.ranking).toEqual(['p5', 'p4', 'p1', 'p2', 'p3']);
  });

  it('ties all drink; perfect agreement means nobody does', () => {
    const tie = play({ p1: [0, 1, 2, 3], p2: [3, 2, 1, 0] }, ['p1', 'p2']);
    expect(tie.r.assigned.map((d) => d.id)).toEqual(['p1', 'p2']);
    const same = play({ p1: [0, 1, 2, 3], p2: [0, 1, 2, 3] }, ['p1', 'p2']);
    expect(same.r.assigned).toEqual([]);
    expect(same.r.nobody).toBe('unanimous');
    expect(play({}, []).r.nobody).toBeNull();
  });

  it('describes its block', () => {
    const ctx = testCtx(players);
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(60_000);
    expect(g.revealMs(5)).toBeGreaterThan(3000);
    expect(g.endsEarly(g.init(ctx))).toBe(true);
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    expect(g.shift(g.startRound(g.init(ctx), ctx), 5).endsAt).toBe(ctx.now + 30_005);
    expect(g.shift(g.init(ctx), 5).endsAt).toBeNull();
    expect(g.publicView(g.init(ctx))).toEqual({ prompt: '', items: [] });
  });
});

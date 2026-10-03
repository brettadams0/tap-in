import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { fillInTheBlank as g, type BlankState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4'];

function ok(s: BlankState | { reject: string }): BlankState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

function toVote(ctx: GameCtx, answers: Record<string, string>): BlankState {
  let s = g.startRound(g.init(ctx), ctx);
  for (const [p, a] of Object.entries(answers)) s = ok(g.onInput(s, p, { answer: a }, ctx));
  return g.onTimer(s, ctx);
}

const idx = (s: BlankState, text: string) => s.options.indexOf(text);

describe('Fill in the Blank', () => {
  it('shows a prompt with a blank and keeps answers private until the vote', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    expect(g.publicView(s).prompt).toContain('___');
    expect(g.publicView(s).options).toBeNull();
    s = ok(g.onInput(s, 'p1', { answer: 'A goose' }, ctx));
    expect(g.privateView(s, 'p1').answer).toBe('A goose');
    expect(JSON.stringify(g.privateView(s, 'p2'))).not.toContain('goose');
    expect(g.onInput(s, 'p1', { answer: 'Two geese' }, ctx)).toEqual({
      reject: 'Already locked in.',
    });
    expect(isReject(g.onInput(s, 'p2', { answer: 'x'.repeat(61) }, ctx))).toBe(true);
    expect(g.onInput(s, 'p2', { vote: 0 }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.onInput(s, 'x', { answer: 'hi' }, ctx)).toEqual({ reject: 'Not now.' });
  });

  it('votes are anonymous; the fewest votes drinks and the top answer is crowned', () => {
    const ctx = testCtx(players);
    let s = toVote(ctx, { p1: 'A goose', p2: 'Tax forms', p3: 'Wet socks', p4: 'A goose!' });
    expect(s.options).toHaveLength(3);
    expect(JSON.stringify(g.publicView(s))).not.toMatch(/p\d/);
    const goose = idx(s, 'A goose');
    expect(g.privateView(s, 'p4').mine).toEqual([goose]);
    expect(g.onInput(s, 'p1', { vote: goose }, ctx)).toEqual({
      reject: "That's yours! Pick another.",
    });
    expect(g.onInput(s, 'p1', { vote: 9 }, ctx)).toEqual({ reject: 'Pick one of the answers.' });
    s = ok(g.onInput(s, 'p1', { vote: idx(s, 'Tax forms') }, ctx));
    expect(g.onInput(s, 'p1', { vote: 0 }, ctx)).toEqual({ reject: 'Already voted.' });
    s = ok(g.onInput(s, 'p2', { vote: goose }, ctx));
    s = ok(g.onInput(s, 'p3', { vote: goose }, ctx));
    s = g.onTimer(s, ctx);
    const r = g.result(s, ctx);
    expect(r.reveal.top).toEqual([goose]);
    expect(r.assigned).toEqual([
      { id: 'p3', reason: 'fewestVotes' },
      { id: 'p4', reason: 'noVote' },
    ]);
    expect(r.ranking[0]).toBe('p3');
  });

  it('a connected player who never writes drinks', () => {
    const ctx = testCtx(players);
    let s = toVote(ctx, { p1: 'One', p2: 'Two', p3: 'Three' });
    for (const [p, v] of [
      ['p1', 'Two'],
      ['p2', 'Three'],
      ['p3', 'One'],
      ['p4', 'One'],
    ] as const) {
      s = ok(g.onInput(s, p, { vote: idx(s, v) }, ctx));
    }
    const r = g.result(g.onTimer(s, ctx), ctx);
    expect(r.assigned).toEqual([
      { id: 'p4', reason: 'noAnswer' },
      { id: 'p2', reason: 'fewestVotes' },
      { id: 'p3', reason: 'fewestVotes' },
    ]);
  });

  it('with fewer than two answers there is no vote', () => {
    const ctx = testCtx(players, { connected: ['p1', 'p2'] });
    const s = toVote(ctx, { p1: 'Only me' });
    expect(g.roundOver(s)).toBe(true);
    expect(g.publicView(s).options).toEqual(['Only me']);
    expect(g.result(s, ctx).assigned).toEqual([{ id: 'p2', reason: 'noAnswer' }]);
    expect(g.result(toVote(ctx, {}), ctx).reveal.top).toEqual([]);
  });

  it('describes its block', () => {
    const ctx = testCtx(players);
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(60_000);
    expect(g.revealMs(5)).toBeGreaterThan(3000);
    expect(g.endsEarly(g.init(ctx))).toBe(true);
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    expect(g.awaiting(toVote(ctx, { p1: 'a1', p2: 'b2' }))).toEqual(players);
    expect(g.shift(g.startRound(g.init(ctx), ctx), 3).endsAt).toBe(ctx.now + 40_003);
    expect(g.shift(g.init(ctx), 3).endsAt).toBeNull();
    expect(g.publicView(g.init(ctx)).prompt).toBe('');
  });
});

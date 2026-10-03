import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { LIAR_SHOW_EACH_MS, liarsPrompt as g, type LiarState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function ok(s: LiarState | { reject: string }): LiarState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

/** A round in its vote step with the imposter forced to `imposter`. */
function toVote(ctx: GameCtx, imposter = 'p3'): LiarState {
  let s: LiarState = { ...g.startRound(g.init(ctx), ctx), imposter };
  for (const p of players) s = ok(g.onInput(s, p, { answer: `answer ${p}` }, ctx));
  s = g.onTimer(s, ctx); // → show
  return g.onTimer(s, ctx); // → vote
}

function vote(s: LiarState, ctx: GameCtx, votes: Record<string, string>): LiarState {
  for (const [p, v] of Object.entries(votes)) s = ok(g.onInput(s, p, { vote: v }, ctx));
  return g.onTimer(s, ctx);
}

describe("Liar's Prompt", () => {
  it('deals one imposter a different question, privately', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    expect(g.step(s)).toBe('answer');
    expect(g.deadline(s)).toBe(ctx.now + 30_000);
    expect(players).toContain(s.imposter);
    const imposter = s.imposter ?? '';
    const prompt = s.prompt;
    expect(prompt).not.toBeNull();
    for (const p of players) {
      const me = g.privateView(s, p);
      expect(me.question).toBe(p === imposter ? prompt?.imposter : prompt?.main);
      // Nobody is told who is who, including the imposter.
      expect(JSON.stringify(me)).not.toContain(imposter === p ? 'imposter' : imposter);
    }
    const pub = JSON.stringify(g.publicView(s));
    expect(pub).not.toContain(imposter);
    expect(pub).not.toContain(prompt?.main ?? '?');
    expect(pub).not.toContain(prompt?.imposter ?? '?');
    expect(g.awaiting(s)).toEqual(players);
    expect(g.endsEarly(s)).toBe(true);
  });

  it('takes one clean answer per player and rejects the rest', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = ok(g.onInput(s, 'p1', { answer: '  Banana  ' }, ctx));
    expect(g.privateView(s, 'p1').answer).toBe('Banana');
    expect(g.privateView(s, 'p2').answer).toBeNull();
    expect(JSON.stringify(g.publicView(s))).not.toContain('Banana');
    expect(g.onInput(s, 'p1', { answer: 'Kiwi' }, ctx)).toEqual({ reject: 'Already locked in.' });
    expect(isReject(g.onInput(s, 'p2', { answer: 'x'.repeat(31) }, ctx))).toBe(true);
    expect(isReject(g.onInput(s, 'p2', { answer: '   ' }, ctx))).toBe(true);
    expect(g.onInput(s, 'p2', { vote: 'p1' }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.onInput(s, 'stranger', { answer: 'hi' }, ctx)).toEqual({ reject: 'Not now.' });
  });

  it('shows the answers one by one in sync, then reveals the real question for the vote', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    s = ok(g.onInput(s, 'p1', { answer: 'Apple' }, ctx));
    s = g.onTimer(s, ctx);
    expect(g.step(s)).toBe('show');
    expect(g.endsEarly(s)).toBe(false);
    expect(g.awaiting(s)).toEqual([]);
    const pub = g.publicView(s);
    expect(pub.showAt).toBe(ctx.now + ctx.lead);
    expect(pub.showEach).toBe(LIAR_SHOW_EACH_MS);
    expect(pub.answers?.map((a) => a.id).sort()).toEqual(players);
    expect(pub.answers?.find((a) => a.id === 'p1')?.text).toBe('Apple');
    expect(pub.answers?.find((a) => a.id === 'p2')?.text).toBeNull();
    expect(pub.question).toBeNull();
    expect(g.deadline(s)).toBeGreaterThan((pub.showAt ?? 0) + 4 * LIAR_SHOW_EACH_MS);

    s = g.onTimer(s, ctx);
    expect(g.step(s)).toBe('vote');
    expect(g.publicView(s).question).toBe(s.prompt?.main);
    expect(JSON.stringify(g.publicView(s))).not.toContain(s.prompt?.imposter ?? '?');
  });

  it('catches the imposter with a majority: the imposter and idle voters drink', () => {
    const ctx = testCtx(players);
    let s = toVote(ctx);
    expect(g.onInput(s, 'p1', { vote: 'p1' }, ctx)).toEqual({ reject: 'Pick someone else.' });
    expect(g.onInput(s, 'p1', { vote: 'nobody' }, ctx)).toEqual({ reject: 'Pick someone else.' });
    s = ok(g.onInput(s, 'p1', { vote: 'p3' }, ctx));
    expect(g.onInput(s, 'p1', { vote: 'p2' }, ctx)).toEqual({ reject: 'Already voted.' });
    expect(g.privateView(s, 'p1').vote).toBe('p3');
    expect(JSON.stringify(g.publicView(s))).not.toContain('"vote"');
    s = vote(s, ctx, { p2: 'p3', p3: 'p1', p4: 'p3' });
    expect(g.roundOver(s)).toBe(true);
    const r = g.result(s, ctx);
    expect(r.reveal.caught).toBe(true);
    expect(r.reveal.imposter).toBe('p3');
    expect(r.assigned).toEqual([
      { id: 'p3', reason: 'caught' },
      { id: 'p5', reason: 'noVote' },
    ]);
    expect(r.everyone).toBe(false);
    expect(r.ranking).toEqual(['p5', 'p1', 'p2', 'p4']);
  });

  it('lets the imposter escape without a majority: everyone else drinks', () => {
    const ctx = testCtx(players);
    // 2 of 5 votes on the imposter is not more than half.
    const s = vote(toVote(ctx), ctx, { p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p1', p5: 'p2' });
    const r = g.result(s, ctx);
    expect(r.reveal.caught).toBe(false);
    expect(r.everyone).toBe(true);
    expect(r.spared).toEqual({ ids: ['p3'], why: 'imposterEscaped' });
    expect(r.assigned).toEqual([]);
    expect(r.stats).toEqual({ p3: { liarPoints: 1 } });
    expect(r.reveal.imposterQuestion).toBe(s.prompt?.imposter);
  });

  it('an exact half is not a catch, and no votes at all lets the imposter off', () => {
    const ctx = testCtx(['p1', 'p2', 'p3', 'p4']);
    let s: LiarState = { ...g.startRound(g.init(ctx), ctx), imposter: 'p1' };
    s = g.onTimer(g.onTimer(s, ctx), ctx);
    expect(g.result(vote(s, ctx, { p2: 'p1', p3: 'p1', p4: 'p2', p1: 'p2' }), ctx).everyone).toBe(
      true,
    );
    expect(g.result(g.onTimer(s, ctx), ctx).everyone).toBe(true);
  });

  it('shifts every absolute time after a pause', () => {
    const ctx = testCtx(players);
    const s = g.onTimer(g.startRound(g.init(ctx), ctx), ctx);
    const moved = g.shift(s, 5000);
    expect(moved.endsAt).toBe((s.endsAt ?? 0) + 5000);
    expect(moved.showAt).toBe((s.showAt ?? 0) + 5000);
    const idle = g.shift(g.init(ctx), 5000);
    expect(idle.endsAt).toBeNull();
    expect(idle.showAt).toBeNull();
  });

  it('describes its block', () => {
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(60_000);
    expect(g.revealMs(5)).toBeGreaterThan(3000);
    const ctx = testCtx(players);
    expect(g.privateView(g.init(ctx), 'p1').question).toBeNull();
    expect(g.publicView(g.init(ctx)).answers).toBeNull();
  });
});

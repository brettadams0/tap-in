import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { fakeAnswer as g, mergeFakes, TOO_CLOSE_MSG, type FakeState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function ok(s: FakeState | { reject: string }): FakeState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

function fixed(ctx: GameCtx): FakeState {
  return {
    ...g.startRound(g.init(ctx), ctx),
    entry: { id: 'fa-test', question: 'What did LEGO make first?', answer: 'Wooden toys' },
  };
}

function toVote(ctx: GameCtx, fakes: Record<string, string>): FakeState {
  let s = fixed(ctx);
  for (const [p, f] of Object.entries(fakes)) s = ok(g.onInput(s, p, { fake: f }, ctx));
  return g.onTimer(s, ctx);
}

const optionOf = (s: FakeState, text: string) => s.options.indexOf(text);

describe('Fake Answer', () => {
  it('asks a question and keeps the real answer server-side', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    expect(g.step(s)).toBe('write');
    expect(g.deadline(s)).toBe(ctx.now + 40_000);
    expect(g.publicView(s).question).toBe(s.entry?.question);
    expect(g.publicView(s).options).toBeNull();
    const answer = s.entry?.answer ?? '?';
    expect(JSON.stringify(g.publicView(s))).not.toContain(answer);
    expect(JSON.stringify(g.privateView(s, 'p1'))).not.toContain(answer);
  });

  it('rejects fakes too close to the real answer (R12)', () => {
    const ctx = testCtx(players);
    let s = fixed(ctx);
    expect(g.onInput(s, 'p1', { fake: 'Wooden toy' }, ctx)).toEqual({ reject: TOO_CLOSE_MSG });
    expect(g.onInput(s, 'p1', { fake: 'Toys made of wood? Wooden toys!' }, ctx)).toEqual({
      reject: TOO_CLOSE_MSG,
    });
    expect(isReject(g.onInput(s, 'p1', { fake: 'x'.repeat(41) }, ctx))).toBe(true);
    s = ok(g.onInput(s, 'p1', { fake: 'Rubber ducks' }, ctx));
    expect(g.privateView(s, 'p1').fake).toBe('Rubber ducks');
    expect(g.onInput(s, 'p1', { fake: 'Kites' }, ctx)).toEqual({ reject: 'Already locked in.' });
    expect(g.onInput(s, 'p2', { vote: 0 }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.onInput(s, 'x', { fake: 'Kites' }, ctx)).toEqual({ reject: 'Not now.' });
    expect(JSON.stringify(g.privateView(s, 'p2'))).not.toContain('Rubber ducks');
    expect(g.awaiting(s)).toEqual(['p2', 'p3', 'p4', 'p5']);
  });

  it('merges identical fakes into one card with shared credit', () => {
    expect(mergeFakes(['a', 'b', 'c'], { a: 'Kites', b: 'kites!', c: 'Yo-yos' })).toEqual([
      { text: 'Kites', authors: ['a', 'b'] },
      { text: 'Yo-yos', authors: ['c'] },
    ]);
    const ctx = testCtx(players);
    const s = toVote(ctx, { p1: 'Kites', p2: 'kites', p3: 'Yo-yos' });
    expect(g.step(s)).toBe('vote');
    expect(g.deadline(s)).toBe(ctx.now + 25_000);
    expect(s.options).toHaveLength(3);
    expect(s.options).toContain('Wooden toys');
    expect(g.privateView(s, 'p1').mine).toEqual([optionOf(s, 'Kites')]);
    expect(g.privateView(s, 'p2').mine).toEqual([optionOf(s, 'Kites')]);
    expect(g.privateView(s, 'p4').mine).toEqual([]);
    // Options never say who wrote what, or which one is real.
    const pub = JSON.stringify(g.publicView(s));
    expect(pub).not.toMatch(/p\d/);
    expect(pub).not.toContain('realIndex');
  });

  it('pickers of a fake drink; the best fake earns Master Liar', () => {
    const ctx = testCtx(players);
    let s = toVote(ctx, { p1: 'Kites', p2: 'Yo-yos', p3: 'Rubber ducks' });
    const kites = optionOf(s, 'Kites');
    expect(g.onInput(s, 'p1', { vote: kites }, ctx)).toEqual({
      reject: "That's yours! Pick another.",
    });
    expect(g.onInput(s, 'p1', { vote: 9 }, ctx)).toEqual({ reject: 'Pick one of the answers.' });
    s = ok(g.onInput(s, 'p2', { vote: kites }, ctx));
    expect(g.onInput(s, 'p2', { vote: 0 }, ctx)).toEqual({ reject: 'Already voted.' });
    s = ok(g.onInput(s, 'p3', { vote: kites }, ctx));
    s = ok(g.onInput(s, 'p4', { vote: optionOf(s, 'Yo-yos') }, ctx));
    s = ok(g.onInput(s, 'p1', { vote: s.realIndex }, ctx));
    s = g.onTimer(s, ctx);
    const r = g.result(s, ctx);
    expect(r.assigned).toEqual([
      { id: 'p2', reason: 'fooled' },
      { id: 'p3', reason: 'fooled' },
      { id: 'p4', reason: 'fooled' },
      { id: 'p5', reason: 'noVote' },
    ]);
    expect(r.reveal.masterLiars).toEqual(['p1']);
    expect(r.reveal.answer).toBe('Wooden toys');
    expect(r.reveal.options[r.reveal.realIndex]).toBe('Wooden toys');
    expect(r.reveal.authors[kites]).toEqual(['p1']);
    expect(r.stats).toEqual({ p1: { liarPoints: 2 }, p2: { liarPoints: 1 } });
    expect(r.ranking).toEqual(['p5', 'p2', 'p3', 'p4', 'p1']);
  });

  it('when nobody falls for a fake, nobody drinks', () => {
    const ctx = testCtx(players);
    let s = toVote(ctx, { p1: 'Kites' });
    for (const p of players) s = ok(g.onInput(s, p, { vote: s.realIndex }, ctx));
    const r = g.result(g.onTimer(s, ctx), ctx);
    expect(r.assigned).toEqual([]);
    expect(r.nobody).toBe('sharp');
    expect(r.reveal.masterLiars).toEqual([]);
  });

  it('with no fakes written, there is nothing to vote on', () => {
    const ctx = testCtx(players);
    const s = toVote(ctx, {});
    expect(g.roundOver(s)).toBe(true);
    expect(g.publicView(s).options).toBeNull();
    const r = g.result(s, ctx);
    expect(r.assigned).toEqual([]);
    expect(r.reveal.options).toEqual(['Wooden toys']);
  });

  it('describes its block', () => {
    const ctx = testCtx(players);
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(60_000);
    expect(g.revealMs(5)).toBeGreaterThan(3000);
    expect(g.endsEarly(fixed(ctx))).toBe(true);
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    expect(g.awaiting(toVote(ctx, { p1: 'Kites' }))).toEqual(players);
    expect(g.shift(fixed(ctx), 10).endsAt).toBe(ctx.now + 40_010);
    expect(g.shift(g.init(ctx), 10).endsAt).toBeNull();
    expect(g.publicView(g.init(ctx)).question).toBe('');
  });
});

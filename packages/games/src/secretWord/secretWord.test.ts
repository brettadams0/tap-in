import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { secretWord as g, turnOrder, type SecretState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function ok(s: SecretState | { reject: string }): SecretState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

/** A round with a fixed word, outsider and turn order. */
function fixed(ctx: GameCtx, outsider = 'p3'): SecretState {
  return {
    ...g.startRound(g.init(ctx), ctx),
    entry: { id: 'sw-test', word: 'Pizza', category: 'Food' },
    outsider,
    order: [...players],
  };
}

function hintAll(s: SecretState, ctx: GameCtx): SecretState {
  const words = ['cheese', 'slice', 'round', 'oven', 'crust'];
  players.forEach((p, i) => {
    s = ok(g.onInput(s, p, { hint: words[i] ?? 'x' }, ctx));
  });
  return s;
}

function vote(s: SecretState, ctx: GameCtx, votes: Record<string, string>): SecretState {
  for (const [p, v] of Object.entries(votes)) s = ok(g.onInput(s, p, { vote: v }, ctx));
  return g.onTimer(s, ctx);
}

describe('Secret Word', () => {
  it('never puts the outsider first in the turn order (R4)', () => {
    expect(turnOrder(['a', 'b', 'c'], 'a', [0])).toEqual(['b', 'a', 'c']);
    expect(turnOrder(['a', 'b', 'c'], 'a', [0.99])).toEqual(['c', 'b', 'a']);
    expect(turnOrder(['a', 'b', 'c'], 'b', [0])).toEqual(['a', 'b', 'c']);
    for (let seed = 0; seed < 40; seed++) {
      const ctx = testCtx(players, { seed: `s${seed}` });
      const s = g.startRound(g.init(ctx), ctx);
      expect(s.order[0]).not.toBe(s.outsider);
      expect([...s.order].sort()).toEqual(players);
    }
  });

  it('shows the word to everyone but the outsider, who only gets the category', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    const word = s.entry?.word ?? '?';
    for (const p of players) {
      const me = g.privateView(s, p);
      if (p === s.outsider) {
        expect(me).toEqual({ word: null, outsider: true, vote: null, guess: null });
        expect(JSON.stringify(me)).not.toContain(word);
      } else expect(me.word).toBe(word);
    }
    const pub = g.publicView(s);
    expect(pub.category).toBe(s.entry?.category);
    expect(JSON.stringify(pub)).not.toContain(word);
    expect(pub.caught).toBeNull();
    expect(g.step(s)).toBe('hint');
    expect(g.deadline(s)).toBe(ctx.now + 15_000);
  });

  it('takes one-word hints in turn order, each with its own 15 s turn', () => {
    const ctx = testCtx(players);
    let s = fixed(ctx);
    expect(g.awaiting(s)).toEqual(['p1']);
    expect(g.onInput(s, 'p2', { hint: 'cheese' }, ctx)).toEqual({
      reject: "It's not your turn yet.",
    });
    expect(g.onInput(s, 'p1', { hint: 'two words' }, ctx)).toEqual({ reject: 'One word only.' });
    expect(g.onInput(s, 'p1', { hint: 'pizzas' }, ctx)).toEqual({
      reject: 'Too close to the word! Try another.',
    });
    expect(isReject(g.onInput(s, 'p1', { hint: '' }, ctx))).toBe(true);
    s = ok(g.onInput(s, 'p1', { hint: 'cheese' }, ctx));
    expect(g.publicView(s).hints).toEqual([{ id: 'p1', text: 'cheese' }]);
    expect(g.publicView(s).turn).toBe(1);
    expect(g.awaiting(s)).toEqual(['p2']);
    // p2 runs out of time: a silent hint, and the turn moves on with a fresh 15 s.
    ctx.now += 15_000;
    s = g.onTimer(s, ctx);
    expect(g.publicView(s).hints[1]).toEqual({ id: 'p2', text: null });
    expect(g.deadline(s)).toBe(ctx.now + 15_000);
    // The outsider doesn't know the word, so their hint is never blocked (that would leak it).
    s = ok(g.onInput(s, 'p3', { hint: 'Pizza' }, ctx));
    s = ok(g.onInput(s, 'p4', { hint: 'oven' }, ctx));
    s = ok(g.onInput(s, 'p5', { hint: 'crust' }, ctx));
    expect(g.step(s)).toBe('vote');
    expect(g.deadline(s)).toBe(ctx.now + 25_000);
    expect(g.awaiting(s)).toEqual(players);
    expect(g.onInput(s, 'p1', { hint: 'late' }, ctx)).toEqual({ reject: 'Not now.' });
  });

  it('a caught outsider who guesses the word makes everyone else drink', () => {
    const ctx = testCtx(players);
    let s = vote(hintAll(fixed(ctx), ctx), ctx, { p1: 'p3', p2: 'p3', p4: 'p3', p3: 'p1' });
    expect(g.step(s)).toBe('guess');
    expect(g.publicView(s).caught).toBe('p3');
    expect(g.awaiting(s)).toEqual(['p3']);
    expect(g.onInput(s, 'p1', { guess: 'pizza' }, ctx)).toEqual({
      reject: 'Only the outsider guesses.',
    });
    s = ok(g.onInput(s, 'p3', { guess: 'pizzas' }, ctx));
    expect(g.privateView(s, 'p3').guess).toBe('pizzas');
    expect(g.roundOver(s)).toBe(true);
    const r = g.result(s, ctx);
    expect(r.reveal).toMatchObject({ outsider: 'p3', word: 'Pizza', caught: true });
    expect(r.reveal.guessedRight).toBe(true);
    expect(r.everyone).toBe(true);
    expect(r.spared).toEqual({ ids: ['p3'], why: 'outsiderGuessed' });
    expect(r.stats).toEqual({ p3: { liarPoints: 1 } });
  });

  it('a caught outsider who guesses wrong drinks, with any idle voters', () => {
    const ctx = testCtx(players);
    let s = vote(hintAll(fixed(ctx), ctx), ctx, { p1: 'p3', p2: 'p3', p4: 'p3', p3: 'p2' });
    s = ok(g.onInput(s, 'p3', { guess: 'tacos' }, ctx));
    const r = g.result(s, ctx);
    expect(r.reveal.guessedRight).toBe(false);
    expect(r.assigned).toEqual([
      { id: 'p3', reason: 'wrongGuess' },
      { id: 'p5', reason: 'noVote' },
    ]);
    expect(r.ranking).toEqual(['p5', 'p1', 'p2', 'p4']);
  });

  it('a caught outsider who never guesses drinks for being caught', () => {
    const ctx = testCtx(players);
    let s = vote(hintAll(fixed(ctx), ctx), ctx, { p1: 'p3', p2: 'p3', p4: 'p3', p5: 'p1' });
    s = g.onTimer(s, ctx);
    expect(g.result(s, ctx).assigned).toEqual([{ id: 'p3', reason: 'caught' }]);
    expect(g.result(s, ctx).ranking).toEqual(['p5', 'p1', 'p2', 'p4']);
  });

  it('an outsider who slips through makes everyone else drink', () => {
    const ctx = testCtx(players);
    const s = vote(hintAll(fixed(ctx), ctx), ctx, { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p3' });
    expect(g.roundOver(s)).toBe(true);
    const r = g.result(s, ctx);
    expect(r.reveal.caught).toBe(false);
    expect(r.spared).toEqual({ ids: ['p3'], why: 'outsiderEscaped' });
    expect(g.onInput(s, 'p3', { guess: 'pizza' }, ctx)).toEqual({ reject: 'Not now.' });
  });

  it('validates votes and ignores strangers', () => {
    const ctx = testCtx(players);
    let s = hintAll(fixed(ctx), ctx);
    expect(g.onInput(s, 'p1', { vote: 'p1' }, ctx)).toEqual({ reject: 'Pick someone else.' });
    s = ok(g.onInput(s, 'p1', { vote: 'p2' }, ctx));
    expect(g.onInput(s, 'p1', { vote: 'p4' }, ctx)).toEqual({ reject: 'Already voted.' });
    expect(g.onInput(s, 'x', { vote: 'p4' }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.privateView(s, 'p1').vote).toBe('p2');
    expect(JSON.stringify(g.publicView(s))).not.toContain('p2"}');
  });

  it('describes its block and shifts its deadline', () => {
    const ctx = testCtx(players);
    expect(g.rounds(5, 'standard')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(60_000);
    expect(g.revealMs(5)).toBeGreaterThan(3000);
    expect(g.endsEarly(fixed(ctx))).toBe(true);
    expect(g.shift(fixed(ctx), 1000).endsAt).toBe(ctx.now + 16_000);
    expect(g.shift(g.init(ctx), 1000).endsAt).toBeNull();
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    expect(g.privateView(g.init(ctx), 'p1').word).toBeNull();
    expect(g.onTimer(g.init(ctx), ctx).step).toBe('done');
    // A hint step past the last player moves straight on to the vote.
    const past = g.onTimer({ ...fixed(ctx), turn: 5 }, ctx);
    expect(past.step).toBe('vote');
    expect(g.awaiting({ ...fixed(ctx), turn: 5 })).toEqual([]);
  });
});

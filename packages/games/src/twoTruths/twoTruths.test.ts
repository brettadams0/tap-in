import { describe, expect, it } from 'vitest';
import { testCtx } from '../testCtx.js';
import { isReject, type GameCtx } from '../types.js';
import { twoTruths as g, TRUTHS_REROLLS, type TruthsState } from './index.js';

const players = ['p1', 'p2', 'p3', 'p4', 'p5'];

function ok(s: TruthsState | { reject: string }): TruthsState {
  if (isReject(s)) throw new Error(s.reject);
  return s;
}

function setupAll(ctx: GameCtx, who = players): TruthsState {
  let s = g.startRound(g.init(ctx), ctx);
  for (const p of who) {
    s = ok(g.onInput(s, p, { truths: [`${p} likes jazz`, `${p} owns a kayak`] }, ctx));
  }
  return g.onTimer(s, ctx);
}

/** Everyone but the spotlight guesses: `wrong` pick a truth, the rest pick the fake. */
function guess(s: TruthsState, ctx: GameCtx, wrong: string[], skip: string[] = []): TruthsState {
  for (const p of s.players) {
    if (p === s.spotlight || skip.includes(p) || s.guesses[p] !== undefined) continue;
    const pick = wrong.includes(p) ? (s.fakeIndex + 1) % 3 : s.fakeIndex;
    s = ok(g.onInput(s, p, { guess: pick }, ctx));
  }
  return g.onTimer(s, ctx);
}

describe('Two Truths, One App', () => {
  it('opens with a private setup: your fake, your rerolls, nobody else sees either', () => {
    const ctx = testCtx(players);
    const s = g.startRound(g.init(ctx), ctx);
    expect(g.step(s)).toBe('setup');
    expect(g.deadline(s)).toBe(ctx.now + 45_000);
    expect(g.awaiting(s)).toEqual(players);
    const p1 = g.privateView(s, 'p1').setup;
    expect(p1?.rerollsLeft).toBe(TRUTHS_REROLLS);
    expect(p1?.truths).toBeNull();
    expect(g.publicView(s)).toEqual({ spotlight: null, cards: null });
    // Each player's fake is private to them.
    const p2fake = g.privateView(s, 'p2').setup?.fake ?? '?';
    expect(JSON.stringify(g.privateView(s, 'p1'))).not.toContain(p2fake);
    expect(g.privateView(s, 'stranger').setup).toBeNull();
  });

  it('rerolls a fake that is actually true, up to twice (R9)', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    const first = g.privateView(s, 'p1').setup?.fake;
    s = ok(g.onInput(s, 'p1', { reroll: true }, ctx));
    expect(g.privateView(s, 'p1').setup?.fake).not.toBe(first);
    s = ok(g.onInput(s, 'p1', { reroll: true }, ctx));
    expect(g.privateView(s, 'p1').setup?.rerollsLeft).toBe(0);
    expect(g.onInput(s, 'p1', { reroll: true }, ctx)).toEqual({ reject: 'No rerolls left.' });
    s = ok(g.onInput(s, 'p2', { truths: ['I surf', 'I bake bread'] }, ctx));
    expect(g.onInput(s, 'p2', { reroll: true }, ctx)).toEqual({ reject: 'Already locked in.' });
  });

  it('checks typed facts', () => {
    const ctx = testCtx(players);
    let s = g.startRound(g.init(ctx), ctx);
    expect(g.onInput(s, 'p1', { truths: ['I surf', 'i SURF!'] }, ctx)).toEqual({
      reject: 'Two different facts, please.',
    });
    expect(isReject(g.onInput(s, 'p1', { truths: ['I surf', 'x'.repeat(61)] }, ctx))).toBe(true);
    expect(isReject(g.onInput(s, 'p1', { truths: ['', 'I surf'] }, ctx))).toBe(true);
    s = ok(g.onInput(s, 'p1', { truths: ['  I surf ', 'I bake bread'] }, ctx));
    expect(g.privateView(s, 'p1').setup?.truths).toEqual(['I surf', 'I bake bread']);
    expect(g.onInput(s, 'p1', { truths: ['a b c', 'd e f'] }, ctx)).toEqual({
      reject: 'Already locked in.',
    });
    expect(g.onInput(s, 'p2', { guess: 0 }, ctx)).toEqual({ reject: 'Not now.' });
    expect(g.onInput(s, 'x', { reroll: true }, ctx)).toEqual({ reject: 'Not now.' });
    // Other players' truths never show up in anyone else's view.
    expect(JSON.stringify(g.privateView(s, 'p2'))).not.toContain('I surf');
    expect(JSON.stringify(g.publicView(s))).not.toContain('I surf');
  });

  it('spotlights a player: three shuffled facts, the fake hidden until the reveal', () => {
    const ctx = testCtx(players);
    const s = setupAll(ctx);
    expect(g.step(s)).toBe('guess');
    expect(g.deadline(s)).toBe(ctx.now + 20_000);
    expect(g.plannedRounds?.(s)).toBe(5);
    const spot = s.spotlight ?? '';
    const pub = g.publicView(s);
    expect(pub.spotlight).toBe(spot);
    expect(pub.cards).toHaveLength(3);
    expect(pub.cards).toContain(`${spot} likes jazz`);
    expect(JSON.stringify(pub)).not.toContain('fakeIndex');
    expect(g.awaiting(s)).toEqual(players.filter((p) => p !== spot));
    expect(g.privateView(s, spot).setup).toBeNull();
    expect(g.onInput(s, spot, { guess: 0 }, ctx)).toEqual({
      reject: "It's your round. Enjoy the show.",
    });
  });

  it('wrong guessers drink, and the spotlight scores a liar point per fool', () => {
    const ctx = testCtx(players);
    let s = setupAll(ctx);
    const others = players.filter((p) => p !== s.spotlight);
    const [a, b] = others as [string, string];
    s = ok(g.onInput(s, a, { guess: (s.fakeIndex + 1) % 3 }, ctx));
    expect(g.onInput(s, a, { guess: 0 }, ctx)).toEqual({ reject: 'Already locked in.' });
    expect(g.privateView(s, a).guess).toBe((s.fakeIndex + 1) % 3);
    s = guess(s, ctx, [a, b]);
    const r = g.result(s, ctx);
    expect(r.reveal.fooled.sort()).toEqual([a, b].sort());
    expect(r.assigned.map((d) => d.reason)).toEqual(['fooled', 'fooled']);
    expect(r.stats).toEqual({ [s.spotlight ?? '']: { liarPoints: 2 } });
    expect(r.reveal.cards[r.reveal.fakeIndex]).toBe(s.offers[s.spotlight ?? '']?.text);
  });

  it('if nobody is fooled the spotlight drinks; idle guessers always do', () => {
    const ctx = testCtx(players);
    let s = setupAll(ctx);
    const idle = players.find((p) => p !== s.spotlight) ?? '';
    s = guess(s, ctx, [], [idle]);
    const r = g.result(s, ctx);
    expect(r.assigned).toEqual([
      { id: s.spotlight, reason: 'nobodyFooled' },
      { id: idle, reason: 'noVote' },
    ]);
    expect(r.ranking[0]).toBe(idle);
  });

  it('nobody guessing at all (everyone offline) means nobody drinks', () => {
    const ctx = testCtx(players, { connected: [] });
    const s = g.onTimer(setupAll(ctx), ctx);
    expect(g.result(s, ctx).assigned).toEqual([]);
  });

  it('runs one spotlight per round and ends early when facts run out', () => {
    const ctx = testCtx(players);
    let s = setupAll(ctx, ['p1', 'p2']);
    expect(g.plannedRounds?.(s)).toBe(2);
    const first = s.spotlight;
    s = g.onTimer(s, ctx);
    s = g.startRound(s, ctx);
    expect(s.round).toBe(2);
    expect(s.spotlight).not.toBe(first);
    expect(['p1', 'p2']).toContain(s.spotlight);
    s = g.startRound(g.onTimer(s, ctx), ctx);
    expect(g.roundOver(s)).toBe(true);
    expect(g.result(s, ctx)).toMatchObject({ assigned: [], reveal: { spotlight: null } });
  });

  it('skips a spotlight who has left the game', () => {
    const ctx = testCtx(players);
    let s = g.onTimer(setupAll(ctx, ['p1', 'p2']), ctx);
    const next = s.order?.[1] ?? '';
    const stay = players.filter((p) => p !== next);
    s = g.startRound(s, { ...ctx, players: stay });
    expect(g.roundOver(s)).toBe(true);
  });

  it('with no facts at all, the block is one empty round', () => {
    const ctx = testCtx(players);
    const s = setupAll(ctx, []);
    expect(g.roundOver(s)).toBe(true);
    expect(g.plannedRounds?.(s)).toBe(1);
    expect(g.plannedRounds?.(g.init(ctx))).toBeNull();
  });

  it('caps spotlights on Short sessions and big groups (R15)', () => {
    expect(g.rounds(5, 'standard')).toBe(5);
    expect(g.rounds(5, 'short')).toBe(3);
    expect(g.rounds(7, 'long')).toBe(3);
    expect(g.rounds(3, 'short')).toBe(3);
    expect(g.estimateMs(5, 'standard')).toBeGreaterThan(g.estimateMs(5, 'short'));
    expect(g.revealMs(5)).toBeGreaterThan(3000);
    const ctx = testCtx(players);
    expect(g.shift(setupAll(ctx), 100).endsAt).toBe(ctx.now + 20_100);
    expect(g.shift(g.init(ctx), 100).endsAt).toBeNull();
    expect(g.awaiting(g.init(ctx))).toEqual([]);
    expect(g.endsEarly(g.init(ctx))).toBe(true);
  });
});

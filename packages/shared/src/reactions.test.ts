import { describe, expect, it } from 'vitest';
import type { RoomView, SessionView } from './protocol.js';
import { canReact, findNote, NOTES, REACTION_EMOJI } from './reactions.js';
import { parseClientMessage } from './schemas.js';
import { defaultSettings } from './settings.js';

function view(phase: RoomView['phase'], session: Partial<SessionView> = {}, reactions = true) {
  return {
    phase,
    settings: { ...defaultSettings(), reactions },
    session: {
      block: 1,
      gameId: 'wouldYouRather',
      round: 1,
      rounds: 4,
      play: null,
      participants: ['me', 'p2'],
      locked: [],
      drink: null,
      done: [],
      overlay: null,
      drinks: {},
      flag: null,
      skippedAt: null,
      results: null,
      ...session,
    },
  } as unknown as RoomView;
}

describe('reactions', () => {
  it('has 8 fixed emoji and notes in all three tabs', () => {
    expect(REACTION_EMOJI).toHaveLength(8);
    for (const tab of ['kind', 'funny', 'glaze']) {
      expect(NOTES.some((n) => n.tab === tab && n.spice === 'chill')).toBe(true);
    }
  });

  it('finds a note only at or below the room spice', () => {
    const spicy = NOTES.find((n) => n.spice === 'spicy');
    expect(spicy).toBeDefined();
    expect(findNote(spicy?.id ?? '', 'unhinged')).toEqual(spicy);
    expect(findNote(spicy?.id ?? '', 'chill')).toBeUndefined();
    expect(findNote('nope', 'unhinged')).toBeUndefined();
  });

  it('parses react messages: an emoji or a note id, never free text', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'react', to: 'p_1', emoji: '😂' })).ok).toBe(
      true,
    );
    expect(
      parseClientMessage(JSON.stringify({ type: 'react', to: 'p_1', note: 'rx-c-k01' })).ok,
    ).toBe(true);
    expect(parseClientMessage(JSON.stringify({ type: 'react', to: 'p_1' })).ok).toBe(false);
    expect(
      parseClientMessage(JSON.stringify({ type: 'react', to: 'p_1', note: 'hey you look great!' }))
        .ok,
    ).toBe(false);
  });

  it('only when the player has time (DESIGN §12)', () => {
    expect(canReact(view('lobby'), 'me')).toBe(true);
    expect(canReact(view('results'), 'me')).toBe(true);
    expect(canReact(view('roundReveal'), 'me')).toBe(true);
    expect(canReact(view('gameIntro'), 'me')).toBe(false);
    expect(canReact(view('lobby', {}, false), 'me')).toBe(false);
    // Owes an answer: no. Locked in: yes. Speed games: never.
    expect(canReact(view('roundInput'), 'me')).toBe(false);
    expect(canReact(view('roundInput', { locked: ['me'] }), 'me')).toBe(true);
    expect(canReact(view('roundInput', { participants: ['p2'] }), 'me')).toBe(true);
    expect(canReact(view('roundInput', { gameId: 'tapRace', locked: ['me'] }), 'me')).toBe(false);
    expect(canReact(view('roundInput', { overlay: { kind: 'paused', endsAt: 1 } }), 'me')).toBe(
      true,
    );
    expect(canReact({ ...view('roundInput'), session: null }, 'me')).toBe(true);
  });

  it('never during your own Drink takeover', () => {
    const drink = (d: Partial<NonNullable<SessionView['drink']>>) =>
      view('drink', {
        drink: { drinkers: [], everyone: false, spared: null, nobody: null, saves: [], ...d },
      });
    expect(canReact(drink({ drinkers: [{ id: 'me', reason: 'smallerSide' }] }), 'me')).toBe(false);
    expect(canReact(drink({ drinkers: [{ id: 'p2', reason: 'smallerSide' }] }), 'me')).toBe(true);
    expect(canReact(drink({ everyone: true }), 'me')).toBe(false);
    expect(
      canReact(drink({ everyone: true, spared: { ids: ['me'], why: 'imposterEscaped' } }), 'me'),
    ).toBe(true);
    expect(canReact(view('drink'), 'me')).toBe(true);
  });
});

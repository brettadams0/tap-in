import { describe, expect, it } from 'vitest';
import { defaultSettings, type RoomView, type SessionView } from '@tap-in/shared';
import { cuesFor } from './cues.js';

const avatar = {
  color: 'red',
  pattern: 'solid',
  eyes: 'dots',
  mouth: 'grin',
  topper: 'none',
} as const;
const players = ['me', 'p2', 'p3'].map((id) => ({
  id,
  name: id,
  avatar,
  presence: 'connected' as const,
  isHost: id === 'me',
}));

function view(
  phase: RoomView['phase'],
  session: Partial<SessionView>,
  extra: Partial<RoomView> = {},
): RoomView {
  return {
    protocol: 1,
    code: 'ABCD',
    phase,
    phaseEndsAt: null,
    phaseAt: 10_000,
    hostId: 'me',
    players,
    settings: defaultSettings(),
    you: { id: 'me' },
    claims: [],
    session: {
      block: 1,
      gameId: 'wouldYouRather',
      round: 1,
      rounds: 4,
      play: null,
      participants: ['me', 'p2', 'p3'],
      locked: [],
      drink: null,
      done: [],
      overlay: null,
      drinks: {},
      results: null,
      ...session,
    },
    ...extra,
  };
}

const drink = (drinkers: string[], everyone = false) => ({
  drinkers: drinkers.map((id) => ({ id, reason: 'smallerSide' as const })),
  everyone,
  spared: null,
  nobody: drinkers.length || everyone ? null : ('balanced' as const),
  saves: [],
});

describe('cues', () => {
  it('stings the title card and hits the reveal at phaseAt', () => {
    expect(cuesFor(view('gameIntro', {}))).toEqual([
      { key: 'sting:10000', at: 10_000, sound: 'sting', game: 'wouldYouRather' },
    ]);
    expect(cuesFor(view('roundReveal', {}))[0]?.sound).toBe('reveal');
    expect(cuesFor(view('lobby', {}, { session: null }))).toEqual([]);
  });

  it('ticks faster through the last 5 s, and not while frozen', () => {
    const ticks = cuesFor(view('roundInput', {}, { phaseEndsAt: 30_000 }));
    expect(ticks.map((c) => 30_000 - c.at)).toEqual([5000, 4000, 3000, 2000, 1500, 1000, 600, 300]);
    expect(
      cuesFor(
        view('roundInput', { overlay: { kind: 'paused', endsAt: 1 } }, { phaseEndsAt: 30_000 }),
      ),
    ).toEqual([]);
  });

  it('plays the Drink horn only on the drinker’s phone', () => {
    const mine = cuesFor(view('drink', { drink: drink(['me']) }));
    expect(mine[0]).toMatchObject({ sound: 'drinkYou', private: true, seat: 0 });
    expect(cuesFor(view('drink', { drink: drink(['p3']) }))[0]).toMatchObject({
      sound: 'drinkOther',
      seat: 2,
    });
    expect(cuesFor(view('drink', { drink: drink([], true) }))[0]?.sound).toBe('everyone');
    expect(cuesFor(view('drink', { drink: drink([]) }))[0]?.sound).toBe('nobody');
  });

  it('the spared player hears a private cheer while everyone else drinks', () => {
    const spared = {
      ...drink([], true),
      spared: { ids: ['me'], why: 'imposterEscaped' as const },
    };
    expect(cuesFor(view('drink', { drink: spared }))[0]).toMatchObject({
      sound: 'cheer',
      private: true,
    });
    const other = { ...spared, spared: { ids: ['p2'], why: 'imposterEscaped' as const } };
    expect(cuesFor(view('drink', { drink: other }))[0]?.sound).toBe('everyone');
  });

  it("lands Liar's Prompt answers one by one in each answerer's voice, without ticks", () => {
    const cues = cuesFor(
      view(
        'roundInput',
        {
          gameId: 'liarsPrompt',
          play: {
            gameId: 'liarsPrompt',
            step: 'show',
            pub: {
              answers: [
                { id: 'p3', text: 'Apple' },
                { id: 'me', text: null },
              ],
              showAt: 11_000,
              showEach: 1400,
              question: null,
            },
            me: { question: 'Name a fruit', answer: null, vote: null },
            reveal: null,
          },
        },
        { phaseEndsAt: 20_000 },
      ),
    );
    expect(cues.map((c) => [c.sound, c.at, c.seat])).toEqual([
      ['land', 11_000, 2],
      ['land', 12_400, 0],
    ]);
  });

  it('schedules the Shotgun fake-out and flash at their server times', () => {
    const cues = cuesFor(
      view('roundInput', {
        gameId: 'reactionShotgun',
        play: {
          gameId: 'reactionShotgun',
          step: 'armed',
          pub: { fakeAt: 11_000, flashAt: 12_500 },
          me: { tapped: false, early: false, ms: null },
          reveal: null,
        },
      }),
    );
    expect(cues.map((c) => [c.sound, c.at])).toEqual([
      ['fake', 11_000],
      ['flash', 12_500],
    ]);
  });

  it('cheers at the results and the intro gets its slam', () => {
    expect(cuesFor(view('results', {}))[0]?.sound).toBe('cheer');
    expect(cuesFor(view('intro', {}))[0]?.sound).toBe('intro');
    expect(cuesFor(view('gameOutro', {}))).toEqual([]);
  });
});

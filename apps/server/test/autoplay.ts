/** Test helper: a seeded auto-player that sends plausible input for whatever a phone sees. */
import type { Rng, RoomView } from '@tap-in/shared';

const WORDS = ['banana', 'kettle', 'moose', 'zebra', 'orbit', 'pickle', 'goose'];

/** A plausible (sometimes wrong-step or rejected) input for whatever this phone sees. */
export function randomInput(view: RoomView, rng: Rng): { step: string; data: unknown } | null {
  const play = view.session?.play;
  if (view.phase !== 'roundInput' || !play) return null;
  const others = view.players.filter((p) => p.id !== view.you.id).map((p) => p.id);
  const word = () => rng.pick(WORDS);
  const step = play.step;
  switch (play.gameId) {
    case 'wouldYouRather':
      return { step, data: { side: rng.pick(['a', 'b']) } };
    case 'reactionShotgun':
      return { step, data: { ms: 120 + rng.int(500) } };
    case 'rankIt':
      return { step, data: { ranking: rng.shuffle([0, 1, 2, 3]) } };
    case 'tapRace':
      return { step, data: { count: rng.int(90) } };
    case 'countdown':
      return { step, data: { tap: true } };
    case 'liarsPrompt':
      return { step, data: step === 'vote' ? { vote: rng.pick(others) } : { answer: word() } };
    case 'secretWord':
      if (step === 'vote') return { step, data: { vote: rng.pick(others) } };
      return { step, data: step === 'guess' ? { guess: word() } : { hint: word() } };
    case 'twoTruths':
      if (step === 'guess') return { step, data: { guess: rng.int(3) } };
      return { step, data: rng.next() < 0.2 ? { reroll: true } : { truths: [word(), word()] } };
    case 'fakeAnswer':
      return {
        step,
        data: step === 'vote' ? { vote: rng.int(5) } : { fake: `${word()} ${word()}` },
      };
    case 'fillInTheBlank':
      return { step, data: step === 'vote' ? { vote: rng.int(5) } : { answer: word() } };
    case 'spinTheBottle':
      if (step === 'choice') return { step, data: { choice: rng.pick(['dare', 'drink']) } };
      if (step === 'perform') return { step, data: { performed: true } };
      return { step, data: { verdict: rng.pick(['done', 'nope']) } };
  }
}

/**
 * Capn's commentary (DESIGN §8, §12): one short line in the reaction lane's empty slot between
 * phases (never during input, so it can't distract anyone still answering). Picked from the
 * moment and the round, so it holds still while you read.
 * Voice: short, cheeky, warm (DESIGN §9). The Drink instruction is never Capn's to give.
 */
import type { RoomView } from '@tap-in/shared';

export type CapnMoment = 'reveal' | 'drink' | 'outro' | 'results';

export const CAPN_LINES: Record<CapnMoment, readonly string[]> = {
  reveal: [
    'Drumroll, please…',
    'Here it comes…',
    'Oh, this is good.',
    "Nobody look at anybody's phone.",
    'The moment of truth.',
    'Brace yourselves.',
    'Capn saw that coming. Probably.',
    'Well, well, well.',
  ],
  drink: [
    'Cheers to that.',
    'Hydrate between rounds, legends.',
    'Somebody had to lose.',
    'A moment of silence. Okay, done.',
    'The cap giveth, the cap taketh.',
    'Fair and square.',
    'Rules are rules.',
    'Next round, revenge.',
  ],
  outro: [
    'Shake it off, new game coming.',
    'That game is in the books.',
    'Stretch those thumbs.',
    'Changing it up…',
    'Fresh game, fresh chances.',
    'Who saw that coming?',
  ],
  results: [
    'What a night.',
    'Rematch? Rematch.',
    'Legends, every one of you.',
    'Same time next week?',
    'Strangers no more.',
    'Capn is proud of you all.',
  ],
};

export function capnMoment(view: RoomView): CapnMoment | null {
  switch (view.phase) {
    case 'roundReveal':
      return 'reveal';
    case 'drink':
      return 'drink';
    case 'gameOutro':
      return 'outro';
    case 'results':
      return 'results';
    default:
      return null;
  }
}

/** A small stable hash, so every re-render of the same moment picks the same line. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function capnLine(view: RoomView): string | null {
  const moment = capnMoment(view);
  if (!moment) return null;
  const s = view.session;
  const lines = CAPN_LINES[moment];
  const key = `${view.code}:${view.phase}:${String(s?.block ?? 0)}:${String(s?.round ?? 0)}`;
  return lines[hash(key) % lines.length] ?? null;
}

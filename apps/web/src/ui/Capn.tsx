/** Capn, the mascot (DESIGN.md §8): a dented foam bottle cap who only lives in margins and empty states. */
import type { Avatar } from '@tap-in/shared';
import { Cap } from './Cap.js';

const MOODS: Record<'happy' | 'sleepy' | 'shook' | 'loading', Avatar> = {
  happy: { color: 'foam', pattern: 'sunrays', eyes: 'anime', mouth: 'grin', topper: 'none' },
  sleepy: { color: 'foam', pattern: 'sunrays', eyes: 'sleepy', mouth: 'o', topper: 'none' },
  shook: { color: 'foam', pattern: 'sunrays', eyes: 'side', mouth: 'wobbly', topper: 'none' },
  loading: { color: 'foam', pattern: 'sunrays', eyes: 'spiral', mouth: 'whistle', topper: 'none' },
};

export function Capn({ mood = 'happy', size = 96 }: { mood?: keyof typeof MOODS; size?: number }) {
  return (
    <div className={mood === 'loading' ? 'capn capn-spin' : 'capn cap-bob'} aria-hidden="true">
      <Cap avatar={MOODS[mood]} size={size} label="Capn" />
    </div>
  );
}

export function Pouring({ text = 'Pouring…' }: { text?: string }) {
  return (
    <main className="screen pouring" aria-busy="true">
      <div className="pouring-inner">
        <Capn mood="loading" size={110} />
        <p className="title">{text}</p>
      </div>
    </main>
  );
}

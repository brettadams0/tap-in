/** Capn, the mascot (DESIGN.md §8): a dented foam bottle cap who only lives in margins and empty states. */
import { useState } from 'react';
import type { Avatar } from '@tap-in/shared';
import { audio } from '../audio/audio.js';
import { pop } from '../audio/synth.js';
import { Cap } from './Cap.js';

/** Taps on Capn before he burps a bubble (an easter egg, DESIGN §13). */
const BURP_TAPS = 5;

const MOODS: Record<'happy' | 'sleepy' | 'shook' | 'loading', Avatar> = {
  happy: { color: 'foam', pattern: 'sunrays', eyes: 'anime', mouth: 'grin', topper: 'none' },
  sleepy: { color: 'foam', pattern: 'sunrays', eyes: 'sleepy', mouth: 'o', topper: 'none' },
  shook: { color: 'foam', pattern: 'sunrays', eyes: 'side', mouth: 'wobbly', topper: 'none' },
  loading: { color: 'foam', pattern: 'sunrays', eyes: 'spiral', mouth: 'whistle', topper: 'none' },
};

export function Capn({ mood = 'happy', size = 96 }: { mood?: keyof typeof MOODS; size?: number }) {
  const [taps, setTaps] = useState(0);
  const burp = taps >= BURP_TAPS;
  return (
    <div
      className={mood === 'loading' ? 'capn capn-spin' : 'capn cap-bob'}
      aria-hidden="true"
      onClick={() => {
        const next = taps + 1;
        setTaps(next);
        if (next === BURP_TAPS) audio.playNow(pop, { freq: 110, timbre: 'rubber' });
      }}
    >
      <Cap avatar={burp ? MOODS.shook : MOODS[mood]} size={size} label="Capn" />
      {burp && (
        <span
          key={taps}
          className="capn-burp"
          onAnimationEnd={() => {
            setTaps(0);
          }}
        >
          🫧
        </span>
      )}
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

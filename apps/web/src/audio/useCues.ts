/** Schedules the view's synced cues on the audio clock, cancelling ones the view no longer wants. */
import { useEffect, useRef } from 'react';
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import { audio, buzz } from './audio.js';
import { cuesFor, type Cue } from './cues.js';
import * as synth from './synth.js';

/** Wake this long before the target, then hand the exact time to the audio clock. */
const WAKE_EARLY_MS = 120;

const RECIPES: Record<Exclude<Cue['sound'], 'everyone' | 'sting'>, synth.Recipe> = {
  intro: synth.intro,
  tick: synth.tick,
  land: synth.stamp,
  ding: synth.clink,
  buzzer: synth.buzzer,
  whoosh: synth.whoosh,
  clunk: synth.clunk,
  reveal: synth.reveal,
  drinkYou: synth.horn,
  drinkOther: synth.clink,
  nobody: synth.ahh,
  flash: synth.crack,
  fake: synth.nope,
  cheer: synth.cheer,
  role: synth.stamp,
};

function playCue(cue: Cue, perf: number, view: RoomView): void {
  const voice = synth.voiceFor(cue.seat ?? 0);
  if (cue.sound === 'everyone') {
    const voices = view.players.map((_, i) => synth.voiceFor(i));
    audio.play((ctx, out, t) => {
      synth.everyone(ctx, out, t, voices);
    }, perf);
  } else {
    const recipe =
      cue.sound === 'sting' ? synth.sting(cue.game ?? 'wouldYouRather') : RECIPES[cue.sound];
    audio.play(recipe, perf, voice, { private: cue.private });
  }
  const pattern = cue.vibrate;
  if (pattern) {
    setTimeout(
      () => {
        buzz(pattern);
      },
      Math.max(0, perf - performance.now()),
    );
  }
}

export function useCues(conn: RoomConnection, view: RoomView): void {
  const scheduled = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latest = useRef(view);
  useEffect(() => {
    latest.current = view;
  });

  useEffect(() => {
    const cues = cuesFor(view);
    const wanted = new Set(cues.map((c) => c.key));
    for (const [key, timer] of scheduled.current) {
      if (!wanted.has(key)) {
        clearTimeout(timer);
        scheduled.current.delete(key);
      }
    }
    for (const cue of cues) {
      if (scheduled.current.has(cue.key)) continue;
      const perf = conn.toPerf(cue.at);
      const timer = setTimeout(
        () => {
          playCue(cue, perf, latest.current);
        },
        Math.max(0, perf - performance.now() - WAKE_EARLY_MS),
      );
      scheduled.current.set(cue.key, timer);
    }
  }, [conn, view]);

  useEffect(() => {
    const map = scheduled.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);
}

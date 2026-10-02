/** Visual sync helpers: render a moment on the first frame at or after a server time. */
import { useEffect, useRef, useState } from 'react';
import type { RoomConnection } from '../net/connection.js';

/**
 * True once server time `at` has been reached on this phone. A timer wakes ~30 ms early, then a
 * rAF lands the change on the first frame at or after the target (PLAN.md §5 step 5).
 * `onFrame` gets the rAF timestamp of that frame (used to time Reaction Shotgun taps).
 */
export function useReached(
  conn: RoomConnection,
  at: number | null,
  onFrame?: (frameTime: number) => void,
): boolean {
  // Remembers which target was reached, so a new target starts out "not reached".
  const [reachedAt, setReachedAt] = useState<number | null>(null);
  const frameCb = useRef(onFrame);
  useEffect(() => {
    frameCb.current = onFrame;
  });
  useEffect(() => {
    if (at === null) return;
    const target = conn.toPerf(at);
    let raf = 0;
    const check = (frame: number) => {
      if (performance.now() >= target - 4) {
        frameCb.current?.(frame);
        setReachedAt(at);
      } else raf = requestAnimationFrame(check);
    };
    const timer = setTimeout(
      () => {
        raf = requestAnimationFrame(check);
      },
      Math.max(0, target - performance.now() - 30),
    );
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [conn, at]);
  return at !== null && reachedAt === at;
}

/** Re-render every `ms` while `active`; returns server "now". */
export function useServerNow(conn: RoomConnection, ms: number, active = true): number {
  const [now, setNow] = useState(() => conn.serverNow());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setNow(conn.serverNow());
    }, ms);
    return () => {
      clearInterval(t);
    };
  }, [conn, ms, active]);
  return now;
}

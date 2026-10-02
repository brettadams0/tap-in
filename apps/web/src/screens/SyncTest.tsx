/**
 * Dev page for the real-device sync check (TESTING.md): every phone flashes and beeps
 * on each 2-second boundary of *server* time. Put phones side by side and watch.
 */
import { useEffect, useRef, useState } from 'react';
import { schedulePlayAt } from '@tap-in/shared';
import { RoomConnection } from '../net/connection.js';
import { createRoom } from '../net/api.js';

export function SyncTest() {
  const [conn, setConn] = useState<RoomConnection | null>(null);
  const [stats, setStats] = useState('measuring…');
  const flash = useRef<HTMLDivElement>(null);
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    let c: RoomConnection | null = null;
    void createRoom().then((code) => {
      c = new RoomConnection(code);
      c.start();
      setConn(c);
    });
    return () => c?.stop();
  }, []);

  useEffect(() => {
    if (!conn) return;
    let timer: ReturnType<typeof setTimeout>;
    const loop = (): void => {
      const offset = conn.clock.offset;
      if (offset !== null) {
        setStats(
          `offset ${offset.toFixed(1)} ms · best rtt ${conn.clock.rtt?.toFixed(1) ?? '?'} ms`,
        );
        const serverNow = conn.serverNow();
        const playAt = Math.ceil((serverNow + 300) / 2000) * 2000;
        const d = schedulePlayAt(playAt - performance.timeOrigin, performance.now(), offset);
        const ctx = audio.current;
        if (ctx) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.25, 0);
          osc.frequency.value = 880;
          osc.connect(gain).connect(ctx.destination);
          const when = ctx.currentTime + (d.at - performance.now()) / 1000;
          osc.start(Math.max(ctx.currentTime, when));
          osc.stop(Math.max(ctx.currentTime, when) + 0.06);
        }
        setTimeout(
          () => {
            requestAnimationFrame(() => {
              flash.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
            });
          },
          Math.max(0, d.at - performance.now() - 8),
        );
        timer = setTimeout(loop, Math.max(50, d.at - performance.now() + 50));
      } else {
        timer = setTimeout(loop, 200);
      }
    };
    loop();
    return () => {
      clearTimeout(timer);
    };
  }, [conn]);

  return (
    <main
      className="screen"
      onPointerDown={() => {
        audio.current ??= new AudioContext();
        void audio.current.resume();
      }}
    >
      <div
        ref={flash}
        style={{
          position: 'fixed',
          inset: 0,
          background: '#D4FF3A',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
      <h1 className="title">Sync test</h1>
      <p className="hint">
        Tap once to enable sound. Every phone should flash and beep together every 2 s.
      </p>
      <p className="prompt">{stats}</p>
    </main>
  );
}

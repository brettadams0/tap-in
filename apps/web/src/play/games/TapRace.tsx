/**
 * Tap Race (DESIGN.md §2 Tap Red): a synced 3-2-1, then 5 seconds of hammering one huge button.
 * Taps are counted on this phone (each one bursts, ticks and climbs in pitch) and the total is
 * sent once the window closes. Then the bars race up.
 */
import { useEffect, useRef, useState } from 'react';
import type { RoomView } from '@tap-in/shared';
import { audio } from '../../audio/audio.js';
import { pop } from '../../audio/synth.js';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, playerOf } from '../parts.js';
import { useReached, useServerNow } from '../sync.js';

type Play = Extract<NonNullable<NonNullable<RoomView['session']>['play']>, { gameId: 'tapRace' }>;

function Pad({ conn, view, play }: { conn: RoomConnection; view: RoomView; play: Play }) {
  const { goAt, tapMs } = play.pub;
  const now = useServerNow(conn, 50);
  const started = useReached(conn, goAt);
  const ended = useReached(conn, goAt + tapMs);
  const [count, setCount] = useState(0);
  const counted = useRef(0);
  const sent = useRef(false);
  const canPlay = view.session?.participants.includes(view.you.id) ?? false;

  // Send the total once this phone's window closes.
  useEffect(() => {
    if (!ended || sent.current || !canPlay || play.me.count !== null) return;
    sent.current = true;
    conn.submit('tap', { count: counted.current });
  }, [ended, canPlay, conn, play.me.count]);

  const live = started && !ended && canPlay;
  const left = Math.max(0, Math.ceil((goAt - now) / 1000));
  const remaining = Math.max(0, (goAt + tapMs - now) / 1000);
  return (
    <section className="zone-content grow" aria-label="Tap race">
      <button
        type="button"
        className={`tap-pad${live ? ' is-live' : ''}${ended ? ' is-done' : ''}`}
        data-testid="tap-pad"
        onPointerDown={() => {
          if (!live) return;
          counted.current += 1;
          setCount(counted.current);
          audio.playNow(pop, { freq: 300 + Math.min(counted.current, 80) * 12, timbre: 'rubber' });
        }}
      >
        {!started && <span className="tap-big display">{left > 0 ? left : 'GO'}</span>}
        {live && (
          <>
            <span key={count} className="tap-big display tap-tick">
              {count}
            </span>
            <span className="tap-small">TAP! TAP! TAP! · {remaining.toFixed(1)}s</span>
          </>
        )}
        {ended && (
          <>
            <span className="tap-big display">{play.me.count ?? count}</span>
            <span className="tap-small">taps! Waiting on the others…</span>
          </>
        )}
      </button>
    </section>
  );
}

export function TapInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const inRound = view.session?.participants.includes(view.you.id) ?? false;
  return (
    <>
      <Pad key={String(view.session?.round)} conn={conn} view={view} play={play} />
      {!inRound && (
        <div className="zone-action">
          <DoThis>Sit this one out. Back in next round.</DoThis>
        </div>
      )}
    </>
  );
}

export function TapReveal({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const go = useReached(conn, view.phaseAt);
  const r = play.reveal;
  if (!r) return null;
  const max = Math.max(1, ...r.board.map((b) => b.count ?? 0));
  const fewest = Math.min(...r.board.map((b) => b.count ?? 0));
  return (
    <section className="zone-content" aria-label="Taps">
      <ul className="bars">
        {r.board.map((b, i) => {
          const p = playerOf(view, b.id);
          if (!p) return null;
          return (
            <li key={b.id} className={`bar-row${(b.count ?? 0) === fewest ? ' is-worst' : ''}`}>
              <Cap avatar={p.avatar} size={32} label={p.name} />
              <span className="bar-name">{p.name}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{
                    transform: `scaleX(${String(go ? (b.count ?? 0) / max : 0)})`,
                    transitionDelay: `${String(i * 120)}ms`,
                  }}
                />
              </span>
              <span className="bar-n">{b.count ?? 0}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Rank It (DESIGN.md §2 Sun): put four items in order, best first. Drag a row to move it, or just
 * tap the items in order 1→4 (R8). Then the group's order lands and everyone's distance grows.
 */
import { useRef, useState } from 'react';
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { TapButton } from '../../ui/TapButton.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';
import { stampNow } from '../typing.js';

type Play = Extract<NonNullable<NonNullable<RoomView['session']>['play']>, { gameId: 'rankIt' }>;

/** Row height + gap, in px (matches .rank-row in play.css). */
const ROW = 72;
const START = [0, 1, 2, 3];

function Ranker({ conn, view, play }: { conn: RoomConnection; view: RoomView; play: Play }) {
  const [order, setOrder] = useState(START);
  // Rows above this index have been placed by tapping in order.
  const [placed, setPlaced] = useState(0);
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const start = useRef<{ y: number; from: number } | null>(null);

  const tapRow = (i: number) => {
    if (i < placed) {
      setPlaced(i);
      return;
    }
    const next = [...order];
    const [item] = next.splice(i, 1);
    if (item === undefined) return;
    next.splice(placed, 0, item);
    setOrder(next);
    setPlaced(placed + 1);
  };

  const target = drag ? Math.max(0, Math.min(3, drag.from + Math.round(drag.dy / ROW))) : -1;
  const offset = (i: number): number => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    if (drag.from < target && i > drag.from && i <= target) return -ROW;
    if (drag.from > target && i < drag.from && i >= target) return ROW;
    return 0;
  };

  return (
    <>
      <section className="zone-content" aria-label="Rank the items">
        <p className="prompt">{play.pub.prompt}</p>
        <p className="hint">Drag to reorder, or tap them best to worst.</p>
        <ol className="rank-list" style={{ height: ROW * 4 }}>
          {order.map((item, i) => (
            <li
              key={item}
              className={`rank-row${drag?.from === i ? ' is-dragging' : ''}${i < placed ? ' is-placed' : ''}`}
              style={{ transform: `translateY(${String(i * ROW + offset(i))}px)` }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { y: e.clientY, from: i };
              }}
              onPointerMove={(e) => {
                const s = start.current;
                if (!s) return;
                const dy = e.clientY - s.y;
                if (drag || Math.abs(dy) > 8) setDrag({ from: s.from, dy });
              }}
              onPointerUp={() => {
                const s = start.current;
                start.current = null;
                if (!drag && s) {
                  tapRow(s.from);
                  return;
                }
                if (drag) {
                  const next = [...order];
                  const [moved] = next.splice(drag.from, 1);
                  if (moved !== undefined) next.splice(target, 0, moved);
                  setOrder(next);
                  setPlaced(4);
                }
                setDrag(null);
              }}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
            >
              <span className="rank-num display">{i + 1}</span>
              <span className="rank-text">{play.pub.items[item]}</span>
              <span className="rank-grip" aria-hidden="true">
                ⠿
              </span>
            </li>
          ))}
        </ol>
      </section>
      <div className="zone-action">
        <TapButton
          className="btn-primary"
          onClick={() => {
            stampNow(view);
            conn.submit('rank', { ranking: order });
          }}
        >
          Lock it in
        </TapButton>
      </div>
    </>
  );
}

export function RankInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const inRound = view.session?.participants.includes(view.you.id) ?? false;
  if (!inRound) {
    return (
      <div className="zone-action">
        <DoThis>Sit this one out. Back in next round.</DoThis>
      </div>
    );
  }
  const mine = play.me.ranking;
  if (mine === null) {
    return <Ranker key={String(view.session?.round)} conn={conn} view={view} play={play} />;
  }
  return (
    <>
      <section className="zone-content" aria-label="Your ranking">
        <p className="prompt">{play.pub.prompt}</p>
        <ol className="rank-done">
          {mine.map((item, i) => (
            <li key={item}>
              <span className="rank-num display">{i + 1}</span> {play.pub.items[item]}
            </li>
          ))}
        </ol>
      </section>
      <div className="zone-action">
        <LockRow view={view} />
        <DoThis>Locked in. Waiting on the slowpokes…</DoThis>
      </div>
    </>
  );
}

export function RankReveal({
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
  const max = Math.max(1, ...r.distances.map((d) => d.distance ?? 0));
  return (
    <section className="zone-content" aria-label="The group's order">
      <p className="label">The group says</p>
      <ol className="rank-done">
        {r.group.map((item, i) => (
          <li
            key={item}
            className={go ? 'slide-in' : 'is-hidden'}
            style={{ animationDelay: `${String(i * 200)}ms` }}
          >
            <span className="rank-num display">{i + 1}</span> {play.pub.items[item]}
          </li>
        ))}
      </ol>
      <p className="label">Distance from the group</p>
      <ul className="bars">
        {r.distances.map((d, i) => {
          const p = playerOf(view, d.id);
          if (!p) return null;
          const furthest = i === 0 && d.distance !== null && d.distance > 0;
          return (
            <li key={d.id} className={`bar-row${furthest ? ' is-worst' : ''}`}>
              <Cap avatar={p.avatar} size={32} label={p.name} />
              <span className="bar-name">{p.name}</span>
              <span className="bar-track">
                <span
                  className={`bar-fill${go ? ' grow' : ''}`}
                  style={{
                    transform: `scaleX(${String(go ? (d.distance ?? max) / max : 0)})`,
                    transitionDelay: `${String(900 + i * 150)}ms`,
                  }}
                />
              </span>
              <span className="bar-n">{d.distance === null ? '—' : d.distance.toFixed(1)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

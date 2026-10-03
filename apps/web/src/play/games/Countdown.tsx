/**
 * Countdown (DESIGN.md §2 Blue): count to the target together, one tap at a time, no talking.
 * Same 600 ms as someone else and you collide: the count resets. You can't tap twice in a row.
 */
import { useState } from 'react';
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, playerOf } from '../parts.js';
import { useReached, useServerNow } from '../sync.js';

type Play = Extract<NonNullable<NonNullable<RoomView['session']>['play']>, { gameId: 'countdown' }>;

/** How long the COLLISION! banner stays up. */
const BANNER_MS = 1400;

export function CountInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const me = view.you.id;
  const { count, target, lastBy, collisions } = play.pub;
  const now = useServerNow(conn, 200);
  // Optimistic: the button squashes and the next number shows before the server answers.
  // Remembers the count this phone tapped on; it only shows while the server hasn't moved on.
  const [pending, setPending] = useState<{ count: number; crashes: number } | null>(null);
  const crash = collisions.at(-1);
  const crashing = crash !== undefined && now - crash.at < BANNER_MS;
  const blocked = lastBy === me;
  const inRound = view.session?.participants.includes(me) ?? false;
  const shown =
    pending?.count === count && pending.crashes === collisions.length ? count + 1 : count;
  const last = lastBy ? playerOf(view, lastBy) : undefined;

  return (
    <>
      <section className="zone-content grow center" aria-label="Count">
        <p className="label">Count to {target}. No talking!</p>
        <div className={`count-num display${crashing ? ' is-crash shake' : ''}`} aria-live="polite">
          {crashing ? 'COLLISION!' : shown}
        </div>
        {crashing ? (
          <div className="count-crash">
            {crash.ids.map((id) => {
              const p = playerOf(view, id);
              return p ? (
                <Cap key={id} avatar={p.avatar} size={44} label={p.name} mood="drink" />
              ) : null;
            })}
          </div>
        ) : (
          last && <p className="hint">Last: {last.name}</p>
        )}
      </section>
      <div className="zone-action">
        <button
          type="button"
          className="btn btn-primary btn-big count-btn"
          data-testid="count-btn"
          disabled={!inRound || blocked}
          onPointerDown={() => {
            if (!inRound || blocked) return;
            setPending({ count, crashes: collisions.length });
            conn.submit('count', { tap: true });
          }}
        >
          {blocked ? 'Wait for someone else' : `Tap ${String(count + 1)}`}
        </button>
        <DoThis>
          {blocked ? "That was you. Someone else's turn." : 'Tap when it feels right.'}
        </DoThis>
      </div>
    </>
  );
}

export function CountReveal({
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
  return (
    <section className="zone-content center grow" aria-label="Result">
      <div className={`unmask paper${go ? ' slap' : ' is-hidden'}`}>
        <span className="unmask-name display">
          {r.reached ? `${String(r.target)}!` : "Time's up"}
        </span>
        <span className={`stamp unmask-stamp${r.reached ? ' is-escaped' : ''}`}>
          {r.reached ? 'COUNTED IT!' : `Best: ${String(r.best)}`}
        </span>
      </div>
      {go && (
        <p className="hint">
          {r.collisions.length === 0
            ? 'Not a single collision.'
            : `${String(r.collisions.length)} collision${r.collisions.length === 1 ? '' : 's'}`}
        </p>
      )}
    </section>
  );
}

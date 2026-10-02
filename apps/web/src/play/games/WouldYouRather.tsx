/** Would You Rather (DESIGN.md §2 Fluoro Pink): two big coasters to pick from, then caps fly to their side. */
import { useState } from 'react';
import type { RoomView, WyrSide } from '@tap-in/shared';
import { audio } from '../../audio/audio.js';
import { stamp, voiceFor } from '../../audio/synth.js';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'wouldYouRather' }
>;

export function WyrInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  // Optimistic: the card stamps before the server confirms (<50 ms feedback).
  const [picked, setPicked] = useState<{ round: number; side: WyrSide } | null>(null);
  const round = view.session?.round ?? 0;
  const choice = play.me.choice ?? (picked?.round === round ? picked.side : null);
  const mySeat = view.players.findIndex((p) => p.id === view.you.id);
  const canVote = view.session?.participants.includes(view.you.id) ?? false;

  const pick = (side: WyrSide) => {
    if (choice || !canVote) return;
    setPicked({ round, side });
    audio.playNow(stamp, voiceFor(mySeat));
    conn.submit('vote', { side });
  };

  return (
    <>
      <section className="zone-content wyr" aria-label="Would you rather">
        <p className="wyr-ask">Would you rather…</p>
        {(['a', 'b'] as const).map((side) => (
          <button
            key={side}
            type="button"
            className={`wyr-card wyr-${side}${choice === side ? ' is-picked' : ''}${choice && choice !== side ? ' is-other' : ''}`}
            aria-pressed={choice === side}
            disabled={!!choice || !canVote}
            onClick={() => {
              pick(side);
            }}
          >
            <span className="wyr-letter" aria-hidden="true">
              {side.toUpperCase()}
            </span>
            <span className="wyr-text">{side === 'a' ? play.pub.a : play.pub.b}</span>
            {choice === side && <span className="stamp">IN!</span>}
          </button>
        ))}
      </section>
      <div className="zone-action">
        <LockRow view={view} />
        <DoThis>
          {!canVote
            ? 'Sit this one out. Back in next round.'
            : choice
              ? 'Locked in. Waiting on the slowpokes…'
              : 'Tap one. Smaller side drinks.'}
        </DoThis>
      </div>
    </>
  );
}

export function WyrReveal({
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
  const smaller = r.a.length === r.b.length ? null : r.a.length < r.b.length ? 'a' : 'b';
  const unanimous = r.a.length === 0 || r.b.length === 0;
  return (
    <section className="zone-content wyr-reveal" aria-label="Results">
      <div className="wyr-cols">
        {(['a', 'b'] as const).map((side) => {
          const ids = r[side];
          const wobble = go && smaller === side && !unanimous;
          return (
            <div key={side} className={`wyr-col${wobble ? ' wobble' : ''}`}>
              <div className={`wyr-col-head wyr-${side}`}>
                <span className="wyr-letter">{side.toUpperCase()}</span>
                <span className="wyr-col-text">{side === 'a' ? play.pub.a : play.pub.b}</span>
              </div>
              <ul className="wyr-pile">
                {go &&
                  ids.map((id, i) => {
                    const p = playerOf(view, id);
                    if (!p) return null;
                    return (
                      <li
                        key={id}
                        className="fly-in"
                        style={{ animationDelay: `${150 + i * 160}ms` }}
                      >
                        <Cap avatar={p.avatar} size={44} label={p.name} />
                        <span className="pile-name">{p.name}</span>
                      </li>
                    );
                  })}
              </ul>
              <div className="wyr-count display">{go ? ids.length : '?'}</div>
            </div>
          );
        })}
      </div>
      {go && r.noVote.length > 0 && (
        <p className="hint center">
          No vote: {r.noVote.map((id) => playerOf(view, id)?.name ?? '?').join(', ')}
        </p>
      )}
    </section>
  );
}

/**
 * Reaction Shotgun: the whole screen is the button. The flash lands on the server's time on every
 * phone; reaction time is measured locally from the flash frame to the tap (SPEC §7).
 */
import { useRef, useState } from 'react';
import type { RoomView } from '@tap-in/shared';
import { audio } from '../../audio/audio.js';
import { pop, voiceFor } from '../../audio/synth.js';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { playerOf } from '../parts.js';
import { useReached } from '../sync.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'reactionShotgun' }
>;

const FAKE_SHOW_MS = 450;

export function ShotgunInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const flashFrame = useRef<number | null>(null);
  const [local, setLocal] = useState<{ round: number; early: boolean; ms: number | null } | null>(
    null,
  );
  const round = view.session?.round ?? 0;
  const flashed = useReached(conn, play.pub.flashAt, (t) => {
    flashFrame.current = t;
  });
  const fakeOn = useReached(conn, play.pub.fakeAt);
  const fakeOff = useReached(
    conn,
    play.pub.fakeAt === null ? null : play.pub.fakeAt + FAKE_SHOW_MS,
  );
  const showFake = fakeOn && !fakeOff && !flashed;
  const mine = local?.round === round ? local : null;
  const tapped = play.me.tapped || mine !== null;
  const early = play.me.tapped ? play.me.early : (mine?.early ?? false);
  const ms = play.me.ms ?? mine?.ms ?? null;
  const canPlay = view.session?.participants.includes(view.you.id) ?? false;

  const tap = (e: React.PointerEvent) => {
    if (tapped || !canPlay) return;
    const frame = flashFrame.current;
    const reaction =
      flashed && frame !== null ? Math.max(0, Math.round(e.timeStamp - frame)) : null;
    setLocal({ round, early: reaction === null, ms: reaction });
    audio.play(
      pop,
      performance.now(),
      voiceFor(view.players.findIndex((p) => p.id === view.you.id)),
    );
    conn.submit(play.step, { ms: reaction });
  };

  const state = tapped
    ? early
      ? 'early'
      : 'done'
    : flashed
      ? 'flash'
      : showFake
        ? 'fake'
        : 'wait';
  return (
    <button
      type="button"
      className={`shotgun shotgun-${state}`}
      onPointerDown={tap}
      aria-label="Tap when it flashes"
      data-testid="shotgun-pad"
    >
      {state === 'wait' && (
        <>
          <span className="shotgun-big display">Wait for it…</span>
          <span className="shotgun-small">Tap the moment it flashes. Too early = Drink.</span>
        </>
      )}
      {state === 'fake' && <span className="shotgun-small shotgun-nope">NOPE</span>}
      {state === 'flash' && <span className="shotgun-huge display">TAP!</span>}
      {state === 'early' && (
        <>
          <span className="shotgun-big display">Too early!</span>
          <span className="shotgun-small">That's a Drink. Hold tight for the rest.</span>
        </>
      )}
      {state === 'done' && (
        <>
          <span className="shotgun-big display">{ms !== null ? `${ms} ms` : 'IN!'}</span>
          <span className="shotgun-small">Locked in. Waiting on the others…</span>
        </>
      )}
    </button>
  );
}

export function ShotgunReveal({
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
    <section className="zone-content" aria-label="Reaction times">
      {r.hadFake && <p className="label center">There was a fake-out 👀</p>}
      <ol className="board">
        {r.board.map((e, i) => {
          const p = playerOf(view, e.id);
          if (!p) return null;
          return (
            <li
              key={e.id}
              className={`board-row${go ? ' slide-in' : ' is-hidden'}${i === 0 && e.ms !== null ? ' is-best' : ''}`}
              style={{ animationDelay: `${(r.board.length - 1 - i) * 220}ms` }}
            >
              <span className="board-rank">{i + 1}</span>
              <Cap avatar={p.avatar} size={36} label={p.name} />
              <span className="board-name">{p.name}</span>
              <span className="board-ms">
                {e.early ? 'EARLY' : e.ms === null ? 'no tap' : `${e.ms} ms`}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

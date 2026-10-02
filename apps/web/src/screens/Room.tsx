import { lazy, Suspense, useEffect, useState } from 'react';
import { useRoom } from '../hooks/useRoom.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { loadSession } from '../net/storage.js';
import { Pouring } from '../ui/Capn.js';
import { ClaimSeat } from './ClaimSeat.js';
import { Ended } from './Ended.js';
import { JoinForm } from './JoinForm.js';
import { Lobby } from './Lobby.js';

// The game screens, audio and their CSS load only once a session starts.
const Play = lazy(() => import('../play/Play.js'));

/** Errors the screens already explain in place; everything else becomes a toast. */
const SILENT = new Set(['BAD_TOKEN', 'ROOM_ENDED', 'RATE_LIMITED']);

export function Room({ code }: { code: string }) {
  const { conn, room } = useRoom(code);
  const [wantsClaim, setWantsClaim] = useState(false);
  useWakeLock(!!room.view);

  const error = room.error && !SILENT.has(room.error.code) ? room.error : null;
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => {
      conn.clearError();
    }, 3500);
    return () => {
      clearTimeout(t);
    };
  }, [error, conn]);

  let body;
  if (room.ended) {
    body = <Ended reason={room.ended} />;
  } else if (room.view) {
    body =
      room.view.phase === 'lobby' ? (
        <Lobby conn={conn} view={room.view} />
      ) : (
        <Suspense fallback={<Pouring />}>
          <Play conn={conn} view={room.view} />
        </Suspense>
      );
  } else if (
    !room.welcome ||
    (loadSession()?.roomCode === code && room.error?.code !== 'BAD_TOKEN')
  ) {
    // Waiting for the socket, or for our saved seat to be restored: no flash of the join form.
    body = <Pouring />;
  } else if (!room.welcome.joinable || wantsClaim || room.claim) {
    body = (
      <ClaimSeat
        conn={conn}
        welcome={room.welcome}
        claim={room.claim}
        onBack={
          room.welcome.joinable
            ? () => {
                setWantsClaim(false);
              }
            : null
        }
      />
    );
  } else {
    body = (
      <JoinForm
        conn={conn}
        welcome={room.welcome}
        onClaim={
          room.welcome.claimable.length > 0
            ? () => {
                setWantsClaim(true);
              }
            : null
        }
      />
    );
  }

  return (
    <>
      {room.link === 'reconnecting' && !room.ended && (
        <div className="banner" role="status">
          Reconnecting…
        </div>
      )}
      {error && (
        <div className="banner toast-error" role="alert">
          {error.message}
        </div>
      )}
      {body}
    </>
  );
}

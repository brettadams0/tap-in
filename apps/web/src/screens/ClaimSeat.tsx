import type { WelcomeInfo } from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import type { ClientRoomState } from '../net/reducer.js';
import { Cap } from '../ui/Cap.js';
import { Capn } from '../ui/Capn.js';

export function ClaimSeat({
  conn,
  welcome,
  claim,
  onBack,
}: {
  conn: RoomConnection;
  welcome: WelcomeInfo;
  claim: ClientRoomState['claim'];
  onBack: (() => void) | null;
}) {
  if (claim?.status === 'pending') {
    const who = welcome.claimable.find((s) => s.id === claim.playerId);
    return (
      <main className="screen">
        <div className="zone-content center">
          <Capn mood="loading" size={110} />
          <h1 className="title">Knock knock…</h1>
          <p className="hint">Waiting for the host to let {who?.name ?? 'you'} back in.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="screen">
      <div className="zone-content">
        <p className="label">Room {welcome.code}</p>
        <h1 className="title">{welcome.joinable ? 'Get back in' : 'This game already started'}</h1>
        {claim?.status === 'denied' && (
          <p role="alert" className="error-text">
            The host didn&apos;t let that one through. Try again?
          </p>
        )}
        {welcome.claimable.length > 0 ? (
          <>
            <p className="prompt">Are you…?</p>
            <div className="seat-list">
              {welcome.claimable.map((seat) => (
                <button
                  key={seat.id}
                  type="button"
                  className="seat paper"
                  onClick={() => {
                    conn.claim(seat.id);
                  }}
                >
                  <Cap avatar={seat.avatar} size={52} label={seat.name} />
                  <span>{seat.name}</span>
                </button>
              ))}
            </div>
            <p className="hint">
              The host approves it, then you&apos;re back with your drinks and secrets.
            </p>
          </>
        ) : (
          <p className="hint">New players can&apos;t join mid-game. Catch the next round!</p>
        )}
      </div>
      {onBack && (
        <div className="zone-action">
          <button type="button" className="link-btn" onClick={onBack}>
            ← I&apos;m new, join instead
          </button>
        </div>
      )}
    </main>
  );
}

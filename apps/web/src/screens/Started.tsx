/** Placeholder for the game loop (phase 2 brings intro, rotation, games and Drink moments). */
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import { Cap } from '../ui/Cap.js';
import { Capn } from '../ui/Capn.js';
import { ClaimPrompt } from './Lobby.js';

export function Started({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const isHost = view.hostId === view.you.id;
  return (
    <main className="screen started" data-testid="started">
      {isHost &&
        view.claims.map((c) => (
          <ClaimPrompt key={c.claimId} conn={conn} claimId={c.claimId} name={c.name} />
        ))}
      <div className="zone-content center">
        <Capn mood="happy" size={120} />
        <h1 className="title">Game on!</h1>
        <p className="hint">The mini-games pour in with the next update. Hang tight.</p>
      </div>
      <ul className="cap-strip" aria-label="Players">
        {view.players.map((p) => (
          <li key={p.id} className="strip-cap">
            <Cap avatar={p.avatar} size={40} label={p.name} dim={p.presence !== 'connected'} />
            <span>{p.name}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

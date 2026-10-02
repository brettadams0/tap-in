/** Results (basic, phase 2): the tally, award stickers, and one-tap rematch. */
import type { AwardId, RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import { Cap } from '../ui/Cap.js';
import { TapButton } from '../ui/TapButton.js';
import { playerOf } from './parts.js';
import { useReached } from './sync.js';

const AWARD: Record<AwardId, { title: string; icon: string }> = {
  mostDrinks: { title: 'Most drinks', icon: '🍺' },
  fastestThumbs: { title: 'Fastest thumbs', icon: '⚡' },
  cleanRecord: { title: 'Cleanest record', icon: '😇' },
};

export function Results({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const r = view.session?.results;
  const go = useReached(conn, view.phaseAt);
  if (!r) return null;
  const isHost = view.hostId === view.you.id;
  const host = view.players.find((p) => p.isHost);
  return (
    <main className="screen results" data-testid="results">
      <h1 className="title center">That's a wrap!</h1>
      <section className="zone-content">
        <ul className="awards">
          {r.awards.map((a, i) => (
            <li
              key={a.id}
              className={`paper award${go ? ' slap' : ' is-hidden'}`}
              style={{ animationDelay: `${i * 450}ms` }}
            >
              <span className="award-icon" aria-hidden="true">
                {AWARD[a.id].icon}
              </span>
              <div>
                <div className="award-title">{AWARD[a.id].title}</div>
                <div className="award-who">
                  {a.players.map((id) => playerOf(view, id)?.name ?? '?').join(' & ')} · {a.detail}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <ol className="standings" aria-label="Drinks">
          {r.standings.map((s) => {
            const p = playerOf(view, s.id);
            if (!p) return null;
            return (
              <li key={s.id} className="standing">
                <Cap avatar={p.avatar} size={40} label={p.name} live />
                <span className="standing-name">
                  {p.name}
                  {p.id === view.you.id && <span className="tag">You</span>}
                </span>
                <span className="standing-n">
                  {s.drinks}{' '}
                  <span className="hint small">{s.drinks === 1 ? 'drink' : 'drinks'}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <div className="zone-action">
        {isHost ? (
          <>
            <TapButton
              className="btn-primary"
              onClick={() => {
                conn.host({ kind: 'rematch' });
              }}
            >
              Rematch 🔁
            </TapButton>
            <TapButton
              className="btn-ghost"
              onClick={() => {
                conn.host({ kind: 'lobby' });
              }}
            >
              Back to lobby (change settings)
            </TapButton>
          </>
        ) : (
          <p className="do-this">Waiting for {host?.name ?? 'the host'} to start a rematch…</p>
        )}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            conn.leave();
          }}
        >
          Leave room
        </button>
      </div>
    </main>
  );
}

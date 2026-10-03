/** Building blocks for play screens (DESIGN.md §4): header strip, timer dial, lock-in row, chips. */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { GAME_META, GAME_NAMES, type GameId, type PlayerView, type RoomView } from '@tap-in/shared';
import { audio } from '../audio/audio.js';
import type { RoomConnection } from '../net/connection.js';
import { Cap } from '../ui/Cap.js';
import { Sheet } from '../ui/Sheet.js';
import { TapButton } from '../ui/TapButton.js';
import { reactionPrefs, useReactionPrefs } from './reactions.js';
import { useServerNow } from './sync.js';

export function inkOf(gameId: GameId | null | undefined): string {
  return gameId ? GAME_META[gameId].ink : '#FF4D3D';
}

export function playerOf(view: RoomView, id: string): PlayerView | undefined {
  return view.players.find((p) => p.id === id);
}

/** Status zone: game icon + name, "Round 2 of 4" and the timer. Always visible during play. */
export function HeaderStrip({
  conn,
  view,
  timer = true,
}: {
  conn: RoomConnection;
  view: RoomView;
  timer?: boolean;
}) {
  const s = view.session;
  const gameId = s?.gameId;
  if (!s || !gameId) return null;
  return (
    <header className="strip" style={{ background: inkOf(gameId) }}>
      <span className="strip-icon" aria-hidden="true">
        {GAME_META[gameId].icon}
      </span>
      <div className="strip-text">
        <div className="strip-name">{GAME_NAMES[gameId]}</div>
        {s.round > 0 && (
          <div className="strip-round">
            Round {s.round} of {s.rounds}
          </div>
        )}
      </div>
      {timer && view.phase === 'roundInput' && (
        <Timer
          conn={conn}
          startedAt={view.phaseAt}
          endsAt={view.phaseEndsAt}
          frozen={!!s.overlay}
        />
      )}
    </header>
  );
}

const R = 22;
const CIRC = 2 * Math.PI * R;

/** Coaster dial: a draining ring with the seconds; red and pulsing for the last 5 s. */
export function Timer({
  conn,
  startedAt,
  endsAt,
  frozen,
}: {
  conn: RoomConnection;
  startedAt: number;
  endsAt: number | null;
  frozen: boolean;
}) {
  const now = useServerNow(conn, 100, endsAt !== null && !frozen);
  if (endsAt === null) {
    return (
      <div className="timer" aria-label="Timer paused">
        <span className="timer-num">⏸</span>
      </div>
    );
  }
  const left = Math.max(0, endsAt - now);
  const total = Math.max(1, endsAt - startedAt);
  const secs = Math.ceil(left / 1000);
  const urgent = left <= 5000;
  return (
    <div
      className={`timer${urgent ? ' timer-urgent' : ''}`}
      role="timer"
      aria-label={`${secs} seconds left`}
    >
      <svg viewBox="-28 -28 56 56" width="56" height="56" aria-hidden="true">
        <circle r={R} className="timer-track" />
        <circle
          r={R}
          className="timer-ring"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - left / total)}
          transform="rotate(-90)"
        />
      </svg>
      <span key={urgent ? secs : 'calm'} className="timer-num">
        {secs}
      </span>
    </div>
  );
}

/** The "Do this now" line that sits right above the action area. */
export function DoThis({ children }: { children: ReactNode }) {
  return (
    <p className="do-this" aria-live="polite">
      {children}
    </p>
  );
}

/** "3 of 5 locked in": every participant's cap, with an IN! stamp once they've locked in. */
export function LockRow({ view }: { view: RoomView }) {
  const s = view.session;
  if (!s) return null;
  const locked = new Set(s.locked);
  return (
    <section className="lockrow" aria-label="Locked in">
      <div className="label">
        {locked.size} of {s.participants.length} locked in
      </div>
      <ul className="lockrow-caps">
        {s.participants.map((id) => {
          const p = playerOf(view, id);
          if (!p) return null;
          return (
            <li key={id} className="lockrow-cap">
              <Cap
                avatar={p.avatar}
                size={38}
                label={p.name}
                dim={p.presence !== 'connected'}
                live
              />
              {locked.has(id) && <span className="stamp stamp-small">IN!</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function useAudio() {
  return useSyncExternalStore(audio.subscribe, audio.getSnapshot);
}

/** Corner chip: sound always one tap away; the host also gets Pause and End here. */
export function CornerMenu({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const a = useAudio();
  const rx = useReactionPrefs();
  const [open, setOpen] = useState(false);
  const isHost = view.hostId === view.you.id;
  const playing = view.phase !== 'results';
  return (
    <>
      <div className="corner">
        <button
          type="button"
          className="corner-btn"
          aria-label={a.muted ? 'Unmute' : 'Mute'}
          onClick={() => {
            audio.unlock();
            audio.setMuted(!a.muted);
          }}
        >
          {a.muted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="corner-btn"
          aria-label="Menu"
          onClick={() => {
            setOpen(true);
          }}
        >
          ⋯
        </button>
      </div>
      {open && (
        <Sheet
          title="Menu"
          onClose={() => {
            setOpen(false);
          }}
        >
          <label className="label" htmlFor="volume">
            Volume
          </label>
          <input
            id="volume"
            className="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={a.volume}
            onChange={(e) => {
              audio.unlock();
              audio.setVolume(Number(e.target.value));
              if (a.muted) audio.setMuted(false);
            }}
          />
          {view.settings.reactions && (
            <TapButton
              className="btn-ghost btn-small"
              aria-pressed={!rx.off}
              onClick={() => {
                reactionPrefs.set({ off: !rx.off });
              }}
            >
              {rx.off ? 'Reactions: off 🙈' : 'Reactions: on 💌'}
            </TapButton>
          )}
          {isHost && playing && (
            <div className="menu-actions">
              <TapButton
                onClick={() => {
                  conn.host({
                    kind: view.session?.overlay?.kind === 'paused' ? 'resume' : 'pause',
                  });
                  setOpen(false);
                }}
              >
                {view.session?.overlay?.kind === 'paused' ? 'Resume' : 'Pause 60s'}
              </TapButton>
              <TapButton
                className="btn-ghost"
                onClick={() => {
                  conn.host({ kind: 'end' });
                  setOpen(false);
                }}
              >
                End game → results
              </TapButton>
            </div>
          )}
          {!isHost && <p className="hint">Only the host can pause or end the game.</p>}
        </Sheet>
      )}
    </>
  );
}

/**
 * Shown when iOS suspended audio (lock, refresh) or on first unlock (silent switch notice).
 * It sits in the page flow above the screen, so it can never cover a button (DESIGN.md §0).
 */
export function SoundChips() {
  const a = useAudio();
  useEffect(() => {
    if (!a.silentNotice) return;
    const t = setTimeout(() => {
      audio.dismissSilentNotice();
    }, 8000);
    return () => {
      clearTimeout(t);
    };
  }, [a.silentNotice]);
  if (a.silentNotice) {
    return (
      <button
        type="button"
        className="sound-chip"
        onClick={() => {
          audio.dismissSilentNotice();
        }}
      >
        iPhone on silent? Flip the switch to hear the game. ✕
      </button>
    );
  }
  if (a.status !== 'running' && !a.muted) {
    return (
      <button type="button" className="sound-chip" onClick={audio.unlock}>
        🔈 Tap for sound
      </button>
    );
  }
  return null;
}

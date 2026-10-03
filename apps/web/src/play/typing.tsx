/**
 * Shared pieces for the typing and voting games: a text entry that shows the server's rejection
 * right under the box ("Too close, try again."), a cap grid to vote for a player, and answer
 * bubbles with names.
 */
import { useId, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { RoomView } from '@tap-in/shared';
import { audio } from '../audio/audio.js';
import { stamp, voiceFor } from '../audio/synth.js';
import type { RoomConnection } from '../net/connection.js';
import { Cap } from '../ui/Cap.js';
import { TapButton } from '../ui/TapButton.js';
import { playerOf } from './parts.js';

/** The server's latest rejection of this phone's input, if it came after `since`. */
export function useRejection(conn: RoomConnection, since: number | null): string | null {
  const room = useSyncExternalStore(conn.subscribe, conn.getSnapshot);
  const err = room.error;
  if (since === null || err?.code !== 'REJECTED' || err.at < since) return null;
  return err.message;
}

/** Plays the lock-in stamp in this phone's own voice (feedback before the server answers). */
export function stampNow(view: RoomView): void {
  audio.playNow(stamp, voiceFor(view.players.findIndex((p) => p.id === view.you.id)));
}

export function TextEntry({
  conn,
  view,
  step,
  label,
  placeholder,
  max,
  submitLabel = 'Lock it in',
  toData,
}: {
  conn: RoomConnection;
  view: RoomView;
  step: string;
  label: string;
  placeholder: string;
  max: number;
  submitLabel?: string;
  toData: (text: string) => unknown;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const rejection = useRejection(conn, sentAt);
  const pending = sentAt !== null && rejection === null;
  const send = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || pending) return;
    setSentAt(Date.now());
    stampNow(view);
    conn.submit(step, toData(clean));
  };
  return (
    <form className="entry" onSubmit={send}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`field entry-field${rejection ? ' is-rejected' : ''}`}
        value={text}
        maxLength={max}
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="send"
        aria-invalid={rejection !== null}
        aria-describedby={`${id}-note`}
        onChange={(e) => {
          setText(e.target.value);
        }}
      />
      <div className="entry-meta" id={`${id}-note`}>
        <span className="entry-error" role="alert">
          {rejection}
        </span>
        <span className="entry-count">
          {text.length}/{max}
        </span>
      </div>
      <TapButton type="submit" className="btn-primary" disabled={!text.trim() || pending}>
        {pending ? 'Sending…' : submitLabel}
      </TapButton>
    </form>
  );
}

/** "Locked in" card showing what this phone sent. */
export function Locked({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="locked paper">
      <span className="label">{label}</span>
      <span className="locked-text">{children}</span>
      <span className="stamp">IN!</span>
    </div>
  );
}

/** A cap grid for voting on a player. Optimistic: the pick stamps before the server confirms. */
export function PlayerPick({
  view,
  ids,
  chosen,
  onPick,
  label,
}: {
  view: RoomView;
  ids: string[];
  chosen: string | null;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <ul className="pick-grid" aria-label={label}>
      {ids.map((id) => {
        const p = playerOf(view, id);
        if (!p) return null;
        return (
          <li key={id}>
            <button
              type="button"
              className={`pick${chosen === id ? ' is-picked' : ''}${chosen && chosen !== id ? ' is-other' : ''}`}
              aria-pressed={chosen === id}
              disabled={chosen !== null}
              onClick={() => {
                onPick(id);
              }}
            >
              <Cap avatar={p.avatar} size={48} label={p.name} live={chosen === null} />
              <span className="pick-name">{p.name}</span>
              {chosen === id && <span className="stamp stamp-small">IN!</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One vote per step: remembers the optimistic pick for this round and step, sends it once,
 * and falls back to the server's answer after a refresh.
 */
export function useVote<T>(
  conn: RoomConnection,
  view: RoomView,
  step: string,
  confirmed: T | null,
  toData: (choice: T) => unknown,
): [T | null, (choice: T) => void] {
  const key = `${String(view.session?.round)}:${step}`;
  const [picked, setPicked] = useState<{ key: string; choice: T } | null>(null);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const rejected = useRejection(conn, sentAt) !== null;
  const local = picked?.key === key && !rejected ? picked.choice : null;
  const choice = confirmed ?? local;
  const pick = (c: T) => {
    if (choice !== null) return;
    setPicked({ key, choice: c });
    setSentAt(Date.now());
    stampNow(view);
    conn.submit(step, toData(c));
  };
  return [choice, pick];
}

/** Named answer bubbles (Liar's Prompt answers, Secret Word hints). */
export function Bubbles({
  view,
  items,
  shown = items.length,
  current,
  empty = '(no answer)',
}: {
  view: RoomView;
  items: { id: string; text: string | null }[];
  shown?: number;
  current?: string | null;
  empty?: string;
}) {
  return (
    <ul className="bubbles">
      {items.map((a, i) => {
        const p = playerOf(view, a.id);
        if (!p) return null;
        const visible = i < shown;
        return (
          <li
            key={a.id}
            className={`bubble-row${visible ? ' pop-in' : ' is-hidden'}${current === a.id ? ' is-current' : ''}`}
          >
            <Cap avatar={p.avatar} size={40} label={p.name} />
            <div className="bubble">
              <span className="bubble-name">{p.name}</span>
              <span className={`bubble-text${a.text === null ? ' is-empty' : ''}`}>
                {visible ? (a.text ?? empty) : '…'}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

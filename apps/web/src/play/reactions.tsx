/**
 * Reactions (DESIGN.md §12). A lane in the margin zone, in the page flow below the action zone,
 * so it can never cover anything: a sticker slot (notes and emoji sent to you, one at a time, 4 s
 * each) above a strip of everyone else's caps. Tap a cap to send an emoji or a note.
 *
 * The lane only exists while this phone has time (`canReact`); reactions sent while you're busy
 * wait in a queue and are dropped after 20 s. Mute and "Reactions off" live on this phone only.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { RoomView } from '@tap-in/shared';
import {
  canReact,
  NOTE_TABS,
  NOTES,
  REACT_GAP_MS,
  REACT_STALE_MS,
  REACTION_EMOJI,
  type NoteTab,
} from '@tap-in/shared/reactions';
import { SPICE_LEVELS } from '@tap-in/shared';
import { audio } from '../audio/audio.js';
import { pop, voiceFor } from '../audio/synth.js';
import type { RoomConnection } from '../net/connection.js';
import { Cap } from '../ui/Cap.js';
import { Sheet } from '../ui/Sheet.js';
import { TapButton } from '../ui/TapButton.js';
import type { ReceivedReaction } from '../net/reducer.js';
import { playerOf } from './parts.js';
import '../styles/reactions.css';

// ---------------------------------------------------------------- per-phone preferences

interface Prefs {
  off: boolean;
  muted: string[];
}

const KEY = 'tapin.reactions';
let prefs: Prefs = load();
const listeners = new Set<() => void>();

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { off: p.off === true, muted: Array.isArray(p.muted) ? p.muted.map(String) : [] };
  } catch {
    return { off: false, muted: [] };
  }
}

export const reactionPrefs = {
  subscribe: (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get: (): Prefs => prefs,
  set: (next: Partial<Prefs>): void => {
    prefs = { ...prefs, ...next };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Private mode: the setting lasts for this tab only.
    }
    for (const fn of listeners) fn();
  },
  toggleMute: (id: string): void => {
    const muted = prefs.muted.includes(id)
      ? prefs.muted.filter((m) => m !== id)
      : [...prefs.muted, id];
    reactionPrefs.set({ muted });
  },
};

export function useReactionPrefs(): Prefs {
  return useSyncExternalStore(reactionPrefs.subscribe, reactionPrefs.get);
}

// ---------------------------------------------------------------- the lane

const STICKER_MS = 4000;
const FLIGHT_MS = 1600;
const TAB_LABEL: Record<NoteTab, string> = { kind: 'Kind', funny: 'Funny', glaze: 'Glaze 🍩' };

function useNow(ms: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setNow(Date.now());
    }, ms);
    return () => {
      clearInterval(t);
    };
  }, [ms, active]);
  return now;
}

export function ReactionLane({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const room = useSyncExternalStore(conn.subscribe, conn.getSnapshot);
  const p = useReactionPrefs();
  const me = view.you.id;
  const free = canReact(view, me);
  const [seen, setSeen] = useState(() => room.reactions.at(-1)?.seq ?? 0);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const recent = room.reactions.filter((r) => r.seq > seen);
  const now = useNow(250, recent.length > 0 || sentAt > 0);

  // The next sticker for this phone: addressed to me, not muted, not stale.
  const mine = recent.find(
    (r) =>
      r.reaction.to === me &&
      !p.off &&
      !p.muted.includes(r.reaction.from) &&
      now - r.at < REACT_STALE_MS,
  );
  const sticker = free ? mine : undefined;
  const stickerSeq = sticker?.seq;
  const stickerFrom = sticker?.reaction.from;

  // A sticker slaps on with the sender's note, then peels off after 4 s.
  useEffect(() => {
    if (stickerSeq === undefined || stickerFrom === undefined) return;
    audio.playNow(pop, voiceFor(view.players.findIndex((x) => x.id === stickerFrom)));
    const t = setTimeout(() => {
      setSeen((s) => Math.max(s, stickerSeq));
    }, STICKER_MS);
    return () => {
      clearTimeout(t);
    };
    // view.players only picks the voice; re-running on it would replay the pop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerSeq, stickerFrom]);

  // Everyone else's reactions fly past for a moment (emoji, or 💌/🍩 for notes).
  const flights = room.reactions.filter(
    (r) => r.reaction.to !== me && now - r.at < FLIGHT_MS && !p.off,
  );

  if (!free) return null;
  const others = view.players.filter((x) => x.id !== me && x.presence !== 'gone');
  const cooling = now - sentAt < REACT_GAP_MS;
  return (
    <section className="react-lane" aria-label="Reactions">
      <div className="react-slot" aria-live="polite">
        {sticker ? (
          <Sticker
            view={view}
            r={sticker}
            onDismiss={() => {
              setSeen((s) => Math.max(s, sticker.seq));
            }}
          />
        ) : (
          flights.map((f) => <Flight key={f.seq} view={view} r={f} />)
        )}
      </div>
      <ul className="react-strip">
        {others.map((x) => (
          <li key={x.id}>
            <button
              type="button"
              className="react-cap"
              aria-label={`React to ${x.name}`}
              disabled={cooling || p.off}
              onClick={() => {
                setSheetFor(x.id);
              }}
            >
              <Cap avatar={x.avatar} size={36} label={x.name} dim={p.muted.includes(x.id)} />
            </button>
          </li>
        ))}
      </ul>
      {sheetFor && (
        <ReactSheet
          view={view}
          to={sheetFor}
          onClose={() => {
            setSheetFor(null);
          }}
          onSend={(r) => {
            conn.react(sheetFor, r);
            setSentAt(Date.now());
            setSheetFor(null);
          }}
        />
      )}
    </section>
  );
}

function Sticker({
  view,
  r,
  onDismiss,
}: {
  view: RoomView;
  r: ReceivedReaction;
  onDismiss: () => void;
}) {
  const from = playerOf(view, r.reaction.from);
  const words = r.reaction.kind === 'emoji' ? r.reaction.emoji : r.reaction.line;
  return (
    <button type="button" className="react-sticker" onClick={onDismiss}>
      {from && <Cap avatar={from.avatar} size={32} label={from.name} />}
      <span className="react-from">{from?.name ?? '?'}</span>
      <span className={r.reaction.kind === 'emoji' ? 'react-emoji' : 'react-line'}>{words}</span>
    </button>
  );
}

function Flight({ view, r }: { view: RoomView; r: ReceivedReaction }) {
  const from = playerOf(view, r.reaction.from)?.name ?? '?';
  const to = playerOf(view, r.reaction.to)?.name ?? '?';
  let icon = '💌';
  if (r.reaction.kind === 'emoji') icon = r.reaction.emoji;
  else if (r.reaction.tab === 'glaze') icon = '🍩';
  return (
    <span className="react-flight">
      {from} <span className="react-emoji">{icon}</span> {to}
    </span>
  );
}

/** Four lines from a tab's pool, at or below the room's spice. */
function deal(tab: NoteTab, view: RoomView, sent: ReadonlySet<string>): typeof NOTES {
  const level = SPICE_LEVELS.indexOf(view.settings.spice);
  const pool = NOTES.filter((n) => n.tab === tab && SPICE_LEVELS.indexOf(n.spice) <= level);
  // Fresh lines first; ones already sent this session go to the back.
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [
    ...shuffled.filter((n) => !sent.has(n.id)),
    ...shuffled.filter((n) => sent.has(n.id)),
  ].slice(0, 4);
}

const sentNotes = new Set<string>();

function ReactSheet({
  view,
  to,
  onClose,
  onSend,
}: {
  view: RoomView;
  to: string;
  onClose: () => void;
  onSend: (r: { emoji: string } | { note: string }) => void;
}) {
  const p = useReactionPrefs();
  const target = playerOf(view, to);
  const [tab, setTab] = useState<'emoji' | NoteTab>('emoji');
  const [shuffle, setShuffle] = useState(0);
  const lines = useMemo(
    () => (tab === 'emoji' ? [] : deal(tab, view, sentNotes)),
    // `shuffle` deals a fresh hand on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, shuffle, view.settings.spice],
  );
  const muted = p.muted.includes(to);
  return (
    <Sheet title={`To ${target?.name ?? '?'}`} onClose={onClose}>
      <div className="react-tabs" role="tablist">
        {(['emoji', ...NOTE_TABS] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`react-tab${tab === t ? ' is-on' : ''}`}
            onClick={() => {
              setTab(t);
            }}
          >
            {t === 'emoji' ? 'Emoji' : TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === 'emoji' ? (
        <div className="react-emoji-grid">
          {REACTION_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              className="react-emoji-btn"
              onClick={() => {
                onSend({ emoji: e });
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : (
        <>
          <ul className="react-lines">
            {lines.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="react-line-btn"
                  onClick={() => {
                    sentNotes.add(n.id);
                    onSend({ note: n.id });
                  }}
                >
                  {n.line}
                </button>
              </li>
            ))}
          </ul>
          <TapButton
            className="btn-ghost btn-small"
            onClick={() => {
              setShuffle((x) => x + 1);
            }}
          >
            🔀 New lines
          </TapButton>
        </>
      )}
      <TapButton
        className="btn-ghost btn-small"
        onClick={() => {
          reactionPrefs.toggleMute(to);
        }}
      >
        {muted ? `Unmute ${target?.name ?? ''}` : `Mute ${target?.name ?? ''}`}
      </TapButton>
    </Sheet>
  );
}

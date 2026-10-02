import { useEffect, useRef, useState } from 'react';
import {
  GAME_IDS,
  GAME_NAMES,
  MIN_ENABLED_GAMES,
  MIN_PLAYERS,
  SESSION_MINUTES,
  type Avatar,
  type PlayerView,
  type RoomSettings,
  type RoomView,
} from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import { saveProfile, loadProfile } from '../net/storage.js';
import { Cap } from '../ui/Cap.js';
import { CapBuilder } from '../ui/CapBuilder.js';
import { Sheet } from '../ui/Sheet.js';
import { TapButton } from '../ui/TapButton.js';

const SPICE_LABEL = { chill: 'Chill', spicy: 'Spicy', unhinged: 'Unhinged' } as const;
const LENGTH_LABEL = { short: 'Short', standard: 'Standard', long: 'Long' } as const;

export function Lobby({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const me = view.players.find((p) => p.id === view.you.id);
  const isHost = view.hostId === view.you.id;
  const host = view.players.find((p) => p.isHost);
  const ready = view.players.filter((p) => p.presence === 'connected').length;
  const [sheet, setSheet] = useState<{ kind: 'settings' } | { kind: 'player'; id: string } | null>(
    null,
  );

  return (
    <main className="screen lobby">
      {isHost &&
        view.claims.map((c) => (
          <ClaimPrompt key={c.claimId} conn={conn} claimId={c.claimId} name={c.name} />
        ))}

      <RoomTicket code={view.code} />

      <section className="zone-content" aria-label="Players">
        <div className="row-between">
          <h2 className="label">Players · {view.players.length}/8</h2>
          <span className="hint small">Tap your cap to change it</span>
        </div>
        <ul className="cap-grid">
          {view.players.map((p) => (
            <PlayerTile
              key={p.id}
              player={p}
              isMe={p.id === view.you.id}
              onTap={
                p.id === view.you.id || isHost
                  ? () => {
                      setSheet({ kind: 'player', id: p.id });
                    }
                  : undefined
              }
            />
          ))}
        </ul>

        <SettingsSummary
          settings={view.settings}
          canEdit={isHost}
          onEdit={() => {
            setSheet({ kind: 'settings' });
          }}
        />
      </section>

      <div className="zone-action">
        {isHost ? (
          <>
            <TapButton
              className="btn-primary"
              disabled={ready < MIN_PLAYERS}
              onClick={() => {
                conn.host({ kind: 'start' });
              }}
            >
              Start!
            </TapButton>
            <p className="hint center">
              {ready < MIN_PLAYERS
                ? `Need ${MIN_PLAYERS}+ players to start (${ready} here)`
                : `${ready} ready. Hit Start when everyone's in.`}
            </p>
          </>
        ) : (
          <p className="waiting coaster">Waiting for {host?.name ?? 'the host'} to start…</p>
        )}
      </div>

      {sheet?.kind === 'settings' && (
        <Sheet
          title="Game settings"
          onClose={() => {
            setSheet(null);
          }}
        >
          <SettingsEditor conn={conn} settings={view.settings} />
        </Sheet>
      )}
      {sheet?.kind === 'player' && (
        <PlayerSheet
          conn={conn}
          view={view}
          player={view.players.find((p) => p.id === sheet.id)}
          me={me}
          onClose={() => {
            setSheet(null);
          }}
        />
      )}
    </main>
  );
}

function PlayerTile({
  player,
  isMe,
  onTap,
}: {
  player: PlayerView;
  isMe: boolean;
  onTap: (() => void) | undefined;
}) {
  const away = player.presence !== 'connected';
  const content = (
    <>
      <span className="cap-pop">
        <Cap
          avatar={player.avatar}
          size={60}
          label={player.name}
          dim={away}
          className={away ? undefined : 'cap-bob'}
        />
      </span>
      <span className="tile-name">
        {player.name}
        {isMe && <span className="tag">you</span>}
      </span>
      {player.isHost && <span className="tag tag-host">host</span>}
      {away && (
        <span className="tag tag-away">
          <PlugIcon /> {player.presence === 'gone' ? 'away' : 'reconnecting'}
        </span>
      )}
    </>
  );
  return (
    <li className="tile">
      {onTap ? (
        <button
          type="button"
          className="tile-btn"
          onClick={onTap}
          aria-label={`${player.name}${isMe ? ' (you)' : ''}`}
        >
          {content}
        </button>
      ) : (
        <div className="tile-btn">{content}</div>
      )}
    </li>
  );
}

function PlugIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M4 1v3M8 1v3M2.5 4h7v2a3.5 3.5 0 0 1-7 0zM6 9.5V11"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RoomTicket({ code }: { code: string }) {
  const url = `${location.origin}/${code}`;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const share = async (): Promise<void> => {
    const data = { title: 'Tap In', text: `Tap in! Room ${code}`, url };
    try {
      if ('share' in navigator && navigator.canShare(data)) {
        await navigator.share(data);
        return;
      }
    } catch {
      // cancelled or unsupported: fall back to copying
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      // clipboard blocked; the code is on screen anyway
    }
  };
  return (
    <section className="paper ticket" aria-label="Room code">
      <div className="label ticket-k">Room code · Admit 3–8</div>
      <div className="code" data-testid="room-code">
        {code}
      </div>
      <div className="perf" />
      <div className="ticket-row">
        <span className="ticket-url">{url.replace(/^https?:\/\//, '')}</span>
        <div className="ticket-actions">
          <button type="button" className="chip" onClick={() => void share()}>
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button
            type="button"
            className="chip"
            aria-expanded={showQr}
            onClick={() => {
              setShowQr((v) => !v);
            }}
          >
            QR
          </button>
        </div>
      </div>
      {showQr && <QrCode url={url} />}
    </section>
  );
}

function QrCode({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode-generator').then(({ default: qrcode }) => {
      if (!alive || !ref.current) return;
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      // Library output is a trusted SVG string built from our own URL.
      ref.current.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return <div ref={ref} className="qr" role="img" aria-label={`QR code for ${url}`} />;
}

function SettingsSummary({
  settings,
  canEdit,
  onEdit,
}: {
  settings: RoomSettings;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="coaster settings-summary">
      <div className="chips">
        <span className="chip chip-static">{SPICE_LABEL[settings.spice]}</span>
        <span className="chip chip-static">
          {LENGTH_LABEL[settings.length]} ~{SESSION_MINUTES[settings.length]} min
        </span>
        <span className="chip chip-static">{settings.games.length} games</span>
        <span className="chip chip-static">Reactions {settings.reactions ? 'on' : 'off'}</span>
      </div>
      {canEdit && (
        <TapButton className="btn-small btn-ghost" onClick={onEdit}>
          Edit settings
        </TapButton>
      )}
    </div>
  );
}

function SettingsEditor({ conn, settings }: { conn: RoomConnection; settings: RoomSettings }) {
  const set = (patch: Partial<RoomSettings>): void => {
    conn.host({ kind: 'settings', settings: patch });
  };
  const toggleGame = (id: (typeof GAME_IDS)[number]): void => {
    const on = settings.games.includes(id);
    if (on && settings.games.length <= MIN_ENABLED_GAMES) return;
    set({ games: on ? settings.games.filter((g) => g !== id) : [...settings.games, id] });
  };
  return (
    <div className="settings">
      <div className="label">Spice</div>
      <div className="seg">
        {(['chill', 'spicy', 'unhinged'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={settings.spice === s}
            onClick={() => {
              set({ spice: s });
            }}
          >
            {SPICE_LABEL[s]}
          </button>
        ))}
      </div>
      <div className="label">Session length</div>
      <div className="seg">
        {(['short', 'standard', 'long'] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={settings.length === l}
            onClick={() => {
              set({ length: l });
            }}
          >
            {LENGTH_LABEL[l]}
          </button>
        ))}
      </div>
      <div className="label">Games ({settings.games.length} on)</div>
      <ul className="toggles">
        {GAME_IDS.map((id) => {
          const on = settings.games.includes(id);
          return (
            <li key={id}>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={on}
                onClick={() => {
                  toggleGame(id);
                }}
              >
                <span>{GAME_NAMES[id]}</span>
                <span className="toggle-pill">{on ? 'On' : 'Off'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={settings.reactions}
        onClick={() => {
          set({ reactions: !settings.reactions });
        }}
      >
        <span>Player reactions</span>
        <span className="toggle-pill">{settings.reactions ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

function PlayerSheet({
  conn,
  view,
  player,
  me,
  onClose,
}: {
  conn: RoomConnection;
  view: RoomView;
  player: PlayerView | undefined;
  me: PlayerView | undefined;
  onClose: () => void;
}) {
  const isMe = player?.id === me?.id;
  const [draft, setDraft] = useState<Avatar | null>(player?.avatar ?? null);
  if (!player || !draft) return null;
  if (isMe) {
    const taken = view.players
      .filter((p) => p.id !== player.id)
      .map((p) => ({ color: p.avatar.color, name: p.name }));
    return (
      <Sheet title="Your cap" onClose={onClose}>
        <CapBuilder value={draft} onChange={setDraft} taken={taken} />
        <TapButton
          className="btn-primary sheet-cta"
          onClick={() => {
            conn.setAvatar(draft);
            saveProfile({ ...loadProfile(), avatar: draft });
            onClose();
          }}
        >
          Looks good
        </TapButton>
      </Sheet>
    );
  }
  return (
    <Sheet title={player.name} onClose={onClose}>
      <div className="center">
        <Cap avatar={player.avatar} size={96} label={player.name} />
      </div>
      <p className="hint center">
        Remove {player.name} from the room? Use this for someone who has left.
      </p>
      <TapButton
        className="btn-primary sheet-cta"
        onClick={() => {
          conn.host({ kind: 'remove', playerId: player.id });
          onClose();
        }}
      >
        Remove {player.name}
      </TapButton>
    </Sheet>
  );
}

function ClaimPrompt({
  conn,
  claimId,
  name,
}: {
  conn: RoomConnection;
  claimId: string;
  name: string;
}) {
  return (
    <div className="claim paper" role="alert">
      <p>
        <strong>{name}</strong> wants back in on a new phone.
      </p>
      <div className="claim-actions">
        <TapButton
          className="btn-small"
          onClick={() => {
            conn.host({ kind: 'resolveClaim', claimId, approve: true });
          }}
        >
          Let in
        </TapButton>
        <TapButton
          className="btn-small btn-ghost"
          onClick={() => {
            conn.host({ kind: 'resolveClaim', claimId, approve: false });
          }}
        >
          Nope
        </TapButton>
      </div>
    </div>
  );
}

export { ClaimPrompt };

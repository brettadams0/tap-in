/**
 * Spin the Bottle (DESIGN.md §2 Green): the server picks before the spin, and the bottle lands on
 * the same cap on every phone. Then Dare or Drink, 20 s to do it, and the room votes Done or Nope.
 */
import type { CSSProperties } from 'react';
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { TapButton } from '../../ui/TapButton.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';
import { stampNow, useVote } from '../typing.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'spinTheBottle' }
>;

const TURNS = 5;

function Bottle({ conn, view, play }: { conn: RoomConnection; view: RoomView; play: Play }) {
  const { ring, chosen, spinAt, landAt } = play.pub;
  const spinning = useReached(conn, spinAt);
  const landed = useReached(conn, landAt) || play.step !== 'spin';
  const step = 360 / Math.max(1, ring.length);
  const angle = TURNS * 360 + ring.indexOf(chosen) * step;
  const turned = spinning || landed;
  const bottle: CSSProperties = {
    transform: `rotate(${String(turned ? angle : 0)}deg)`,
    transition:
      spinning && !landed && play.step === 'spin'
        ? `transform ${String(Math.max(0, landAt - spinAt))}ms cubic-bezier(0.12, 0.65, 0.18, 1)`
        : 'none',
  };
  return (
    <div className="spin-ring" aria-label="The bottle">
      {ring.map((id, i) => {
        const p = playerOf(view, id);
        if (!p) return null;
        const a = i * step;
        return (
          <span
            key={id}
            className={`spin-seat${landed && id === chosen ? ' is-chosen' : ''}`}
            style={{
              transform: `rotate(${String(a)}deg) translateY(-118px) rotate(${String(-a)}deg)`,
            }}
          >
            <Cap avatar={p.avatar} size={44} label={p.name} />
          </span>
        );
      })}
      <svg
        className="spin-bottle"
        style={bottle}
        viewBox="-20 -60 40 120"
        width="48"
        height="144"
        aria-hidden="true"
      >
        {/* Neck points straight up at 0deg, so the rotation lands exactly on a seat. */}
        <path
          d="M-6 -58 h12 v20 c0 8 12 14 12 26 v62 a8 8 0 0 1 -8 8 h-20 a8 8 0 0 1 -8 -8 v-62 c0 -12 12 -18 12 -26 z"
          fill="var(--accent)"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect
          x="-10"
          y="6"
          width="20"
          height="26"
          rx="3"
          fill="var(--foam)"
          stroke="var(--ink)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

export function SpinInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const me = view.you.id;
  const { chosen, dare } = play.pub;
  const name = playerOf(view, chosen)?.name ?? '?';
  const mine = chosen === me;
  const inRound = view.session?.participants.includes(me) ?? false;
  const [verdict, judge] = useVote(
    conn,
    view,
    'confirm',
    play.me.verdict,
    (v: 'done' | 'nope') => ({
      verdict: v,
    }),
  );
  const send = (step: string, data: unknown) => {
    stampNow(view);
    conn.submit(step, data);
  };

  let action;
  if (play.step === 'spin') action = <DoThis>Round and round it goes…</DoThis>;
  else if (play.step === 'choice') {
    action = mine ? (
      <div className="choice-row">
        <TapButton
          className="btn-primary"
          onClick={() => {
            send('choice', { choice: 'dare' });
          }}
        >
          Dare!
        </TapButton>
        <TapButton
          onClick={() => {
            send('choice', { choice: 'drink' });
          }}
        >
          Drink 🍺
        </TapButton>
      </div>
    ) : (
      <DoThis>{`${name} is choosing: dare, or Drink?`}</DoThis>
    );
  } else if (play.step === 'perform') {
    action = mine ? (
      <TapButton
        className="btn-primary"
        onClick={() => {
          send('perform', { performed: true });
        }}
      >
        I did it ✅
      </TapButton>
    ) : (
      <DoThis>{`Watch ${name} do it…`}</DoThis>
    );
  } else if (mine || !inRound) {
    action = <DoThis>The room is judging…</DoThis>;
  } else {
    action = (
      <>
        <div className="choice-row">
          <TapButton
            className={`btn-primary${verdict === 'done' ? ' is-pressed' : ''}`}
            disabled={verdict !== null}
            onClick={() => {
              judge('done');
            }}
          >
            Done 👍
          </TapButton>
          <TapButton
            className={verdict === 'nope' ? 'is-pressed' : ''}
            disabled={verdict !== null}
            onClick={() => {
              judge('nope');
            }}
          >
            Nope 👎
          </TapButton>
        </div>
        <LockRow view={view} />
      </>
    );
  }

  return (
    <>
      <section className="zone-content" aria-label="Spin the bottle">
        <Bottle conn={conn} view={view} play={play} />
        {dare !== null && (
          <div className="dare paper">
            <span className="label">{mine ? 'Your dare' : `${name}'s dare`}</span>
            <p className="dare-text">{dare}</p>
          </div>
        )}
      </section>
      <div className="zone-action">{action}</div>
    </>
  );
}

export function SpinReveal({
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
  const p = playerOf(view, r.chosen);
  let verdict = 'Skipped';
  if (r.choice === 'drink') verdict = 'Took the Drink';
  else if (r.choice === 'dare') verdict = r.passed ? 'Dare done!' : 'Nope!';
  return (
    <section className="zone-content center grow" aria-label="The verdict">
      <div className={`unmask paper${go ? ' slap' : ' is-hidden'}`}>
        {p && <Cap avatar={p.avatar} size={84} label={p.name} />}
        <span className="unmask-name display">{p?.name ?? '?'}</span>
        <span className={`stamp unmask-stamp${r.passed ? ' is-escaped' : ''}`}>{verdict}</span>
      </div>
      {r.choice === 'dare' && go && (
        <p className="prompt">
          👍 {r.done} · 👎 {r.nope}
        </p>
      )}
    </section>
  );
}

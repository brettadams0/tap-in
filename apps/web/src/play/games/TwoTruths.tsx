/**
 * Two Truths, One App (DESIGN.md §2 Sky): type two true facts, see the fake the app will slip in
 * (reroll it if it's actually true), then spot the fake in each spotlight player's three cards.
 */
import { useId, useState } from 'react';
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { TapButton } from '../../ui/TapButton.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';
import { stampNow, useRejection, useVote } from '../typing.js';

type Play = Extract<NonNullable<NonNullable<RoomView['session']>['play']>, { gameId: 'twoTruths' }>;

const MAX = 60;

function Setup({ conn, view, play }: { conn: RoomConnection; view: RoomView; play: Play }) {
  const id = useId();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const rejection = useRejection(conn, sentAt);
  const setup = play.me.setup;
  if (!setup) return <DoThis>Sit this one out. Back in next round.</DoThis>;
  const pending = sentAt !== null && rejection === null && setup.truths === null;
  const send = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!a.trim() || !b.trim() || pending) return;
    setSentAt(Date.now());
    stampNow(view);
    conn.submit('setup', { truths: [a.trim(), b.trim()] });
  };

  if (setup.truths) {
    return (
      <>
        <section className="zone-content" aria-label="Your facts">
          <p className="label">Your three facts</p>
          <ul className="facts">
            {[...setup.truths, setup.fake].map((f, i) => (
              <li key={f} className={`fact paper${i === 2 ? ' is-fake' : ''}`}>
                {f}
                {i === 2 && <span className="tag">the app's fake</span>}
              </li>
            ))}
          </ul>
        </section>
        <div className="zone-action">
          <LockRow view={view} />
          <DoThis>Locked in. Practise your poker face.</DoThis>
        </div>
      </>
    );
  }

  return (
    <>
      <section className="zone-content" aria-label="Setup">
        <p className="label">The app will add this fake for you</p>
        <div className="fact paper is-fake">{setup.fake}</div>
        <TapButton
          className="btn-ghost btn-small"
          disabled={setup.rerollsLeft === 0 || pending}
          onClick={() => {
            setSentAt(Date.now());
            conn.submit('setup', { reroll: true });
          }}
        >
          {setup.rerollsLeft > 0
            ? `That's true for me! 🔀 (${String(setup.rerollsLeft)} left)`
            : 'No rerolls left'}
        </TapButton>
      </section>
      <form className="zone-action entry" onSubmit={send}>
        <label className="label" htmlFor={`${id}-a`}>
          Two true things about you
        </label>
        <input
          id={`${id}-a`}
          className="field entry-field"
          value={a}
          maxLength={MAX}
          placeholder="True thing #1"
          autoComplete="off"
          onChange={(e) => {
            setA(e.target.value);
          }}
        />
        <input
          id={`${id}-b`}
          aria-label="True thing #2"
          className="field entry-field"
          value={b}
          maxLength={MAX}
          placeholder="True thing #2"
          autoComplete="off"
          enterKeyHint="send"
          onChange={(e) => {
            setB(e.target.value);
          }}
        />
        <span className="entry-error" role="alert">
          {rejection}
        </span>
        <TapButton
          type="submit"
          className="btn-primary"
          disabled={!a.trim() || !b.trim() || pending}
        >
          {pending ? 'Sending…' : 'Lock it in'}
        </TapButton>
      </form>
    </>
  );
}

export function TruthsInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const me = view.you.id;
  const [guess, pick] = useVote(conn, view, 'guess', play.me.guess, (i: number) => ({ guess: i }));
  if (play.step === 'setup') {
    return <Setup key={String(view.session?.round)} conn={conn} view={view} play={play} />;
  }
  const spot = play.pub.spotlight;
  const sp = spot ? playerOf(view, spot) : undefined;
  const mine = spot === me;
  const inRound = view.session?.participants.includes(me) ?? false;
  return (
    <>
      <section className="zone-content" aria-label="Spot the fake">
        <div className="spotlight">
          {sp && <Cap avatar={sp.avatar} size={56} label={sp.name} live />}
          <p className="prompt">{mine ? 'Your facts!' : `${sp?.name ?? '?'}'s facts`}</p>
        </div>
        <ul className="facts">
          {(play.pub.cards ?? []).map((card, i) => (
            <li key={card}>
              <button
                type="button"
                className={`fact paper fact-btn${guess === i ? ' is-picked' : ''}${guess !== null && guess !== i ? ' is-other' : ''}`}
                aria-pressed={guess === i}
                disabled={mine || guess !== null || !inRound}
                onClick={() => {
                  pick(i);
                }}
              >
                {card}
                {guess === i && <span className="stamp stamp-small">FAKE?</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="zone-action">
        <LockRow view={view} />
        <DoThis>
          {mine
            ? 'Your round. Look innocent.'
            : guess !== null
              ? 'Locked in. No take-backs.'
              : 'Which one did the app make up? Tap it.'}
        </DoThis>
      </div>
    </>
  );
}

export function TruthsReveal({
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
  if (r.spotlight === null) {
    return (
      <section className="zone-content center grow">
        <p className="prompt">Nobody typed their facts. Next!</p>
      </section>
    );
  }
  const sp = playerOf(view, r.spotlight);
  return (
    <section className="zone-content" aria-label="The fake">
      <p className="label center">{sp?.name ?? '?'}'s fake was…</p>
      <ul className="facts">
        {r.cards.map((card, i) => {
          const pickers = Object.entries(r.guesses)
            .filter(([, g]) => g === i)
            .map(([id]) => id);
          const fake = i === r.fakeIndex;
          return (
            <li
              key={card}
              className={`fact paper${go && fake ? ' is-fake slap' : ''}${go && !fake ? ' is-true' : ''}`}
            >
              {card}
              {go && fake && <span className="stamp">FAKE</span>}
              <span className="fact-pickers">
                {go &&
                  pickers.map((id) => {
                    const p = playerOf(view, id);
                    return p ? <Cap key={id} avatar={p.avatar} size={28} label={p.name} /> : null;
                  })}
              </span>
            </li>
          );
        })}
      </ul>
      {go && (
        <p className="hint center">
          {r.fooled.length === 0
            ? 'Nobody fell for it.'
            : `Fooled: ${r.fooled.map((id) => playerOf(view, id)?.name ?? '?').join(', ')}`}
        </p>
      )}
    </section>
  );
}

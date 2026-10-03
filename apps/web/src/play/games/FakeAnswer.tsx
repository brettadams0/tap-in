/**
 * Fake Answer (DESIGN.md §2 Tangerine): write a believable fake to an obscure question, then
 * find the real answer among everyone's fakes. Cards deal in at the vote and the reveal.
 */
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';
import { Locked, TextEntry, useVote } from '../typing.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'fakeAnswer' }
>;

export function FakeInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const inRound = view.session?.participants.includes(view.you.id) ?? false;
  const [vote, pick] = useVote(conn, view, 'vote', play.me.vote, (i: number) => ({ vote: i }));
  const question = (
    <div className="question paper">
      <span className="label">Trivia</span>
      <p className="prompt">{play.pub.question}</p>
    </div>
  );

  if (play.step === 'write') {
    return (
      <>
        <section className="zone-content" aria-label="Question">
          {question}
          <p className="hint">Nobody knows this one. Make up an answer that sounds real.</p>
        </section>
        <div className="zone-action">
          {!inRound ? (
            <DoThis>Sit this one out. Back in next round.</DoThis>
          ) : play.me.fake !== null ? (
            <>
              <Locked label="Your fake">{play.me.fake}</Locked>
              <LockRow view={view} />
              <DoThis>Locked in. Waiting on the other liars…</DoThis>
            </>
          ) : (
            <TextEntry
              key={`fake:${String(view.session?.round)}`}
              conn={conn}
              view={view}
              step="write"
              label="Your fake answer"
              placeholder="Something believable"
              max={40}
              toData={(fake) => ({ fake })}
            />
          )}
        </div>
      </>
    );
  }

  const mine = new Set(play.me.mine);
  return (
    <>
      <section className="zone-content" aria-label="Pick the real answer">
        {question}
        <ul className="options">
          {(play.pub.options ?? []).map((o, i) => (
            <li key={o} className="deal-in" style={{ animationDelay: `${i * 90}ms` }}>
              <button
                type="button"
                className={`option${vote === i ? ' is-picked' : ''}${vote !== null && vote !== i ? ' is-other' : ''}`}
                aria-pressed={vote === i}
                disabled={vote !== null || mine.has(i) || !inRound}
                onClick={() => {
                  pick(i);
                }}
              >
                {o}
                {mine.has(i) && <span className="tag">yours</span>}
                {vote === i && <span className="stamp stamp-small">REAL?</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="zone-action">
        <LockRow view={view} />
        <DoThis>{vote !== null ? 'Locked in.' : 'Which one is real? Tap it.'}</DoThis>
      </div>
    </>
  );
}

export function FakeReveal({
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
  const names = (ids: string[]) => ids.map((id) => playerOf(view, id)?.name ?? '?').join(' & ');
  return (
    <section className="zone-content" aria-label="The real answer">
      <ul className="options">
        {r.options.map((o, i) => {
          const real = i === r.realIndex;
          const voters = Object.entries(r.votes)
            .filter(([, v]) => v === i)
            .map(([id]) => id);
          const authors = r.authors[i] ?? [];
          return (
            <li
              key={o}
              className={`option option-reveal${go ? ' deal-in' : ' is-hidden'}${real ? ' is-real' : ''}`}
              style={{ animationDelay: `${i * 160}ms` }}
            >
              <span className="option-text">{o}</span>
              <span className="option-who">
                {real ? <span className="stamp stamp-real">REAL</span> : `by ${names(authors)}`}
              </span>
              <span className="fact-pickers">
                {voters.map((id) => {
                  const p = playerOf(view, id);
                  return p ? <Cap key={id} avatar={p.avatar} size={28} label={p.name} /> : null;
                })}
              </span>
            </li>
          );
        })}
      </ul>
      {go && r.masterLiars.length > 0 && (
        <p className="sticker">🎭 Master Liar: {names(r.masterLiars)}</p>
      )}
    </section>
  );
}

/**
 * Fill in the Blank (DESIGN.md §2 Lemon): fill the blank, then vote for your favourite answer
 * (anonymous, never your own). Authors are revealed with their votes; the top answer is crowned.
 */
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';
import { Locked, TextEntry, useVote } from '../typing.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'fillInTheBlank' }
>;

/** The prompt with its blank drawn as a line (or filled with an answer). */
function Prompt({ text, fill }: { text: string; fill?: string | null }) {
  const [before, after] = text.split('___');
  return (
    <p className="prompt">
      {before}
      <span className={`blank${fill ? ' is-filled' : ''}`}>{fill ?? ' '.repeat(10)}</span>
      {after}
    </p>
  );
}

export function BlankInput({
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

  if (play.step === 'write') {
    return (
      <>
        <section className="zone-content" aria-label="Prompt">
          <div className="question paper">
            <Prompt text={play.pub.prompt} fill={play.me.answer} />
          </div>
        </section>
        <div className="zone-action">
          {!inRound ? (
            <DoThis>Sit this one out. Back in next round.</DoThis>
          ) : play.me.answer !== null ? (
            <>
              <Locked label="Your answer">{play.me.answer}</Locked>
              <LockRow view={view} />
              <DoThis>Locked in. Waiting on the others…</DoThis>
            </>
          ) : (
            <TextEntry
              key={`answer:${String(view.session?.round)}`}
              conn={conn}
              view={view}
              step="write"
              label="Fill the blank"
              placeholder="Make the room laugh"
              max={60}
              toData={(answer) => ({ answer })}
            />
          )}
        </div>
      </>
    );
  }

  const mine = new Set(play.me.mine);
  return (
    <>
      <section className="zone-content" aria-label="Vote for your favourite">
        <div className="question paper">
          <Prompt text={play.pub.prompt} />
        </div>
        <ul className="options">
          {(play.pub.options ?? []).map((o, i) => (
            <li key={o} className="deal-in" style={{ animationDelay: `${String(i * 90)}ms` }}>
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
                {vote === i && <span className="stamp stamp-small">FAVE!</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <div className="zone-action">
        <LockRow view={view} />
        <DoThis>{vote !== null ? 'Locked in.' : 'Tap your favourite. Fewest votes drinks.'}</DoThis>
      </div>
    </>
  );
}

export function BlankReveal({
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
  const top = new Set(r.top);
  return (
    <section className="zone-content" aria-label="Votes">
      <ul className="options">
        {r.options.map((o, i) => {
          const votes = Object.values(r.votes).filter((v) => v === i).length;
          const authors = r.authors[i] ?? [];
          return (
            <li
              key={o}
              className={`option option-reveal${go ? ' deal-in' : ' is-hidden'}${top.has(i) ? ' is-real' : ''}`}
              style={{ animationDelay: `${String(i * 160)}ms` }}
            >
              <span className="option-text">{o}</span>
              <span className="option-who">
                {authors.map((id) => {
                  const p = playerOf(view, id);
                  return p ? <Cap key={id} avatar={p.avatar} size={24} label={p.name} /> : null;
                })}{' '}
                {authors.map((id) => playerOf(view, id)?.name ?? '?').join(' & ')} · {votes}{' '}
                {votes === 1 ? 'vote' : 'votes'}
              </span>
              {top.has(i) && go && <span className="stamp stamp-real">👑 TOP</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

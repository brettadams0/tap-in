/**
 * Liar's Prompt (DESIGN.md §2 Mint): type an answer to your question, watch the answers land one
 * by one in sync, then see the real question and vote for the imposter.
 */
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached, useServerNow } from '../sync.js';
import { Bubbles, Locked, PlayerPick, TextEntry, useVote } from '../typing.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'liarsPrompt' }
>;

export function LiarInput({
  conn,
  view,
  play,
}: {
  conn: RoomConnection;
  view: RoomView;
  play: Play;
}) {
  const me = view.you.id;
  const inRound = view.session?.participants.includes(me) ?? false;
  const [vote, pick] = useVote(conn, view, 'vote', play.me.vote, (id: string) => ({ vote: id }));

  if (play.step === 'answer') {
    return (
      <>
        <section className="zone-content" aria-label="Your question">
          <p className="label">Your question</p>
          <p className="prompt">{play.me.question ?? 'Sit this one out.'}</p>
          <p className="hint">Someone got a slightly different question. Don't be obvious.</p>
        </section>
        <div className="zone-action">
          {!inRound ? (
            <DoThis>Sit this one out. Back in next round.</DoThis>
          ) : play.me.answer !== null ? (
            <>
              <Locked label="You said">{play.me.answer}</Locked>
              <LockRow view={view} />
              <DoThis>Locked in. Waiting on the slowpokes…</DoThis>
            </>
          ) : (
            <TextEntry
              key={`answer:${String(view.session?.round)}`}
              conn={conn}
              view={view}
              step="answer"
              label="Your answer"
              placeholder="Short and sweet"
              max={30}
              toData={(answer) => ({ answer })}
            />
          )}
        </div>
      </>
    );
  }

  if (play.step === 'show') return <LiarShow conn={conn} view={view} play={play} />;

  const others = (view.session?.participants ?? []).filter((id) => id !== me);
  const gotDifferent = play.me.question !== null && play.me.question !== play.pub.question;
  return (
    <>
      <section className="zone-content" aria-label="The real question">
        <p className="label">The real question was</p>
        <p className="prompt">{play.pub.question}</p>
        {gotDifferent && <p className="sticker">Psst. You got: “{play.me.question}”</p>}
        <Bubbles view={view} items={play.pub.answers ?? []} />
      </section>
      <div className="zone-action">
        {inRound ? (
          <>
            <PlayerPick
              view={view}
              ids={others}
              chosen={vote}
              onPick={pick}
              label="Who's the imposter?"
            />
            <LockRow view={view} />
            <DoThis>
              {vote ? 'Vote locked. Fingers crossed…' : "Who's the imposter? Tap them."}
            </DoThis>
          </>
        ) : (
          <DoThis>Sit this one out. Back in next round.</DoThis>
        )}
      </div>
    </>
  );
}

/** Answers land one by one, on every phone at the same moment. */
function LiarShow({ conn, view, play }: { conn: RoomConnection; view: RoomView; play: Play }) {
  const { showAt, showEach, answers } = play.pub;
  const now = useServerNow(conn, 100, showAt !== null);
  const shown = showAt === null ? 0 : Math.max(0, Math.floor((now - showAt) / showEach) + 1);
  return (
    <>
      <section className="zone-content" aria-label="Answers">
        <p className="label">The answers are in</p>
        <Bubbles view={view} items={answers ?? []} shown={shown} />
      </section>
      <div className="zone-action">
        <DoThis>Read them out loud. Who sounds off?</DoThis>
      </div>
    </>
  );
}

export function LiarReveal({
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
  const imp = playerOf(view, r.imposter);
  const counts = new Map<string, number>();
  for (const suspect of Object.values(r.votes)) counts.set(suspect, (counts.get(suspect) ?? 0) + 1);
  const suspects = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <section className="zone-content" aria-label="The imposter">
      <div className={`unmask paper${go ? ' slap' : ' is-hidden'}`}>
        <span className="label">The imposter was</span>
        {imp && (
          <Cap avatar={imp.avatar} size={84} label={imp.name} mood={r.caught ? 'drink' : 'win'} />
        )}
        <span className="unmask-name display">{imp?.name ?? '?'}</span>
        <span className={`stamp unmask-stamp${r.caught ? '' : ' is-escaped'}`}>
          {r.caught ? 'CAUGHT!' : 'GOT AWAY!'}
        </span>
      </div>
      <div className={`questions${go ? ' pop-in' : ' is-hidden'}`}>
        <p>
          <span className="label">Everyone got</span> {r.question}
        </p>
        <p>
          <span className="label">{imp?.name ?? 'They'} got</span> {r.imposterQuestion}
        </p>
      </div>
      <ul className={`tallies${go ? ' pop-in' : ' is-hidden'}`} aria-label="Votes">
        {suspects.map(([id, n]) => {
          const p = playerOf(view, id);
          if (!p) return null;
          return (
            <li key={id} className={id === r.imposter ? 'is-hit' : ''}>
              <Cap avatar={p.avatar} size={36} label={p.name} />
              <span className="tally-name">{p.name}</span>
              <span className="tally-n">
                {n} {n === 1 ? 'vote' : 'votes'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

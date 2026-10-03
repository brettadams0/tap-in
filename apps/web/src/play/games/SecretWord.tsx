/**
 * Secret Word (DESIGN.md §2 Lilac): everyone but the outsider sees the word. One-word hints go
 * round in turn order and show on every phone as they land, then everyone votes for the outsider.
 */
import type { RoomView } from '@tap-in/shared';
import type { RoomConnection } from '../../net/connection.js';
import { Cap } from '../../ui/Cap.js';
import { DoThis, LockRow, playerOf } from '../parts.js';
import { useReached } from '../sync.js';
import { Bubbles, Locked, PlayerPick, TextEntry, useVote } from '../typing.js';

type Play = Extract<
  NonNullable<NonNullable<RoomView['session']>['play']>,
  { gameId: 'secretWord' }
>;

/** Your secret: the word, or "you're the outsider". Always on screen during the round. */
function SecretCard({ play }: { play: Play }) {
  return play.me.outsider ? (
    <div className="secret paper is-outsider">
      <span className="label">You're the outsider</span>
      <span className="secret-word display">Blend in.</span>
      <span className="secret-cat">Category: {play.pub.category}</span>
    </div>
  ) : (
    <div className="secret paper">
      <span className="label">The secret word</span>
      <span className="secret-word display">{play.me.word ?? '…'}</span>
      <span className="secret-cat">Category: {play.pub.category}</span>
    </div>
  );
}

export function SecretInput({
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
  const { order, turn, hints } = play.pub;
  const current = order[turn] ?? null;
  // Every player in turn order: hints given so far, then who's still to come.
  const rows = order.map((id, i) => ({ id, text: hints[i]?.text ?? null }));

  if (play.step === 'hint') {
    const name = current ? (playerOf(view, current)?.name ?? '?') : '';
    return (
      <>
        <section className="zone-content" aria-label="Hints">
          <SecretCard play={play} />
          <Bubbles view={view} items={rows} shown={hints.length} current={current} empty="🤐" />
        </section>
        <div className="zone-action">
          {current === me ? (
            <TextEntry
              key={`hint:${String(view.session?.round)}`}
              conn={conn}
              view={view}
              step="hint"
              label="Your turn: one word"
              placeholder={play.me.outsider ? 'Bluff it…' : 'Not the word!'}
              max={20}
              toData={(hint) => ({ hint })}
            />
          ) : (
            <DoThis>{`${name} is thinking of a hint…`}</DoThis>
          )}
        </div>
      </>
    );
  }

  if (play.step === 'guess') {
    const caught = play.pub.caught;
    const isMe = caught === me;
    const name = caught ? (playerOf(view, caught)?.name ?? '?') : '?';
    return (
      <>
        <section className="zone-content" aria-label="Outsider caught">
          <SecretCard play={play} />
          <p className="prompt center">
            {isMe ? 'Busted! One guess at the word.' : `${name} got caught!`}
          </p>
          <p className="hint center">
            {isMe
              ? 'Get it right and everyone else drinks.'
              : 'One guess at the word to turn it around…'}
          </p>
        </section>
        <div className="zone-action">
          {isMe ? (
            play.me.guess === null ? (
              <TextEntry
                key={`guess:${String(view.session?.round)}`}
                conn={conn}
                view={view}
                step="guess"
                label="Your guess"
                placeholder="The word is…"
                max={30}
                submitLabel="Guess!"
                toData={(guess) => ({ guess })}
              />
            ) : (
              <Locked label="Your guess">{play.me.guess}</Locked>
            )
          ) : (
            <DoThis>Hold your breath…</DoThis>
          )}
        </div>
      </>
    );
  }

  const others = (view.session?.participants ?? []).filter((id) => id !== me);
  return (
    <>
      <section className="zone-content" aria-label="Vote">
        <SecretCard play={play} />
        <Bubbles view={view} items={rows} empty="🤐" />
      </section>
      <div className="zone-action">
        {inRound ? (
          <>
            <PlayerPick
              view={view}
              ids={others}
              chosen={vote}
              onPick={pick}
              label="Who's the outsider?"
            />
            <LockRow view={view} />
            <DoThis>{vote ? 'Vote locked.' : "Who's the outsider? Tap them."}</DoThis>
          </>
        ) : (
          <DoThis>Sit this one out. Back in next round.</DoThis>
        )}
      </div>
    </>
  );
}

export function SecretReveal({
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
  const out = playerOf(view, r.outsider);
  const counts = Object.values(r.votes).filter((id) => id === r.outsider).length;
  let verdict = 'BLENDED IN!';
  if (r.caught) verdict = r.guessedRight ? 'GUESSED IT!' : 'CAUGHT!';
  return (
    <section className="zone-content" aria-label="The outsider">
      <div className={`unmask paper${go ? ' slap' : ' is-hidden'}`}>
        <span className="label">The outsider was</span>
        {out && <Cap avatar={out.avatar} size={84} label={out.name} />}
        <span className="unmask-name display">{out?.name ?? '?'}</span>
        <span className={`stamp unmask-stamp${r.caught && !r.guessedRight ? '' : ' is-escaped'}`}>
          {verdict}
        </span>
      </div>
      <div className={`questions${go ? ' pop-in' : ' is-hidden'}`}>
        <p>
          <span className="label">The word</span> <strong className="reveal-word">{r.word}</strong>
        </p>
        <p>
          <span className="label">Votes for them</span> {counts}
        </p>
        {r.guess !== null && (
          <p>
            <span className="label">Their guess</span> {r.guess} {r.guessedRight ? '✅' : '❌'}
          </p>
        )}
      </div>
    </section>
  );
}

/** Between-phase moments: intro, title cards, Drink moments, outro, overlays (DESIGN.md §5–6). */
import { useMemo } from 'react';
import {
  colorHex,
  GAME_META,
  GAME_NAMES,
  MIN_PLAYERS,
  type DrinkReason,
  type DrinkView,
  type RoomView,
  type SpareReason,
} from '@tap-in/shared';
import type { RoomConnection } from '../net/connection.js';
import { Cap } from '../ui/Cap.js';
import { Capn } from '../ui/Capn.js';
import { TapButton } from '../ui/TapButton.js';
import { inkOf, playerOf } from './parts.js';
import { useReached, useServerNow } from './sync.js';

/** Synced intro: TAP slams, IN slams, every cap rolls in and lines up. */
export function Intro({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const go = useReached(conn, view.phaseAt);
  return (
    <main className="screen moment intro" data-testid="intro">
      <div className="zone-content center grow">
        {go ? (
          <h1 className="logo intro-logo" aria-label="Tap In">
            <span>TAP</span> <span>IN</span>
            <span className="bang">!</span>
          </h1>
        ) : (
          <p className="title">Get ready…</p>
        )}
        {go && (
          <ul className="intro-caps">
            {view.players.map((p, i) => (
              <li key={p.id} style={{ animationDelay: `${600 + i * 110}ms` }}>
                <Cap avatar={p.avatar} size={44} label={p.name} live />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

const GAGS = [
  'Stretch those thumbs',
  'Hydrate or die-drate',
  'No take-backs',
  'Phones up, eyes open',
  'Trust nobody',
  'Hold your drink. Not too tight.',
  'Bragging rights on the line',
];

/** 3 s title card: the game's own slam-in, its rule, and a sticker gag below the rule. */
export function TitleCard({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const s = view.session;
  const go = useReached(conn, view.phaseAt);
  const gag = useMemo(
    () => GAGS[(view.phaseAt / 1000) % GAGS.length | 0] ?? GAGS[0],
    [view.phaseAt],
  );
  if (!s?.gameId) return null;
  const meta = GAME_META[s.gameId];
  return (
    <main
      className={`screen moment title-card tc-${s.gameId}`}
      style={{ ['--accent' as string]: meta.ink }}
      data-testid="title-card"
    >
      <div className="zone-content center grow">
        <div className="label">Game {s.block}</div>
        {go && (
          <>
            <div className="tc-icon" aria-hidden="true">
              {meta.icon}
            </div>
            <h1 className="tc-name display">{GAME_NAMES[s.gameId]}</h1>
            <p className="tc-rule">{meta.rule}</p>
            <p className="tc-gag">{gag}</p>
          </>
        )}
      </div>
    </main>
  );
}

const REASON: Record<DrinkReason, string> = {
  smallerSide: 'Smaller side',
  noVote: 'No vote, no mercy',
  early: 'Too early!',
  slowest: 'Slowest thumbs',
  noTap: "Didn't tap",
  caught: 'Caught red-handed',
  wrongGuess: 'Caught, and guessed wrong',
  fooled: 'Fell for a fake',
  nobodyFooled: 'Nobody fell for it',
  furthest: 'Furthest from the group',
  fewestTaps: 'Fewest taps',
  fewestVotes: 'Fewest votes',
  collision: 'Collided!',
  choseDrink: 'Chose the Drink',
  dareFailed: 'The room said Nope',
  noAnswer: 'Sat it out',
  covering: 'Taking one for the team',
};

const SPARED: Record<SpareReason, { all: string; you: string }> = {
  imposterEscaped: { all: 'The imposter got away with it', you: 'Nobody clocked you' },
  outsiderEscaped: { all: 'The outsider blended right in', you: 'You blended right in' },
  outsiderGuessed: { all: 'The outsider guessed the word', you: 'You guessed the word' },
};

const NOBODY: Record<NonNullable<DrinkView['nobody']>, string> = {
  balanced: 'Perfectly balanced',
  unanimous: 'Great minds…',
  lucky: 'Lucky escape!',
  sharp: 'Nobody got fooled. Sharp crowd.',
  counted: 'You counted it! Teamwork.',
  dared: 'Dare done. Respect.',
};

/** The Drink moment. On the drinker's phone it's a full-screen takeover; elsewhere a coaster. */
export function DrinkMoment({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const s = view.session;
  const go = useReached(conn, view.phaseAt);
  const drink = s?.drink;
  if (!s || !drink) return null;
  const me = view.you.id;
  const mine = drink.drinkers.find((d) => d.id === me);
  const done = s.done.includes(me);

  const spared = drink.everyone ? drink.spared : null;
  if (spared?.ids.includes(me)) {
    const p = playerOf(view, me);
    return (
      <main className="screen moment spared" data-testid="drink-spared">
        <div className="zone-content center grow">
          {go && (
            <>
              {p && <Cap avatar={p.avatar} size={110} label={p.name} className="cap-popoff" />}
              <h1 className="title spared-word">GOT AWAY WITH IT</h1>
              <p className="drink-reason">{SPARED[spared.why].you}. Everyone else drinks.</p>
            </>
          )}
        </div>
        <div className="zone-action">
          <p className="do-this">Act natural. 😇</p>
        </div>
      </main>
    );
  }

  if (drink.everyone) {
    const except = spared?.ids.map((id) => playerOf(view, id)?.name ?? '?').join(' & ');
    return (
      <main className="screen moment everyone" data-testid="drink-everyone">
        {go && (
          <div className="stripes" aria-hidden="true">
            {view.players.map((p, i) => (
              <span
                key={p.id}
                style={{ background: colorHex(p.avatar.color), animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
        )}
        <div className="zone-content center grow drink-words">
          {go && (
            <h1 className="drink-word everyone-word">
              <span>EVERYONE</span>
              <span>DRINK</span>
            </h1>
          )}
          {go && spared && (
            <p className="sticker everyone-except">
              …except {except}. {SPARED[spared.why].all}!
            </p>
          )}
        </div>
        <DoneButton conn={conn} done={done} />
      </main>
    );
  }

  if (mine) {
    const p = playerOf(view, me);
    const saves = drink.saves.filter((x) => x.by === me);
    return (
      <main className={`screen moment drink-you${go ? ' shake' : ''}`} data-testid="drink-you">
        {go && (
          <div
            className="flood"
            style={{ background: p ? colorHex(p.avatar.color) : 'var(--tap)' }}
            aria-hidden="true"
          >
            <svg className="flood-crest" viewBox="0 0 400 40" preserveAspectRatio="none">
              <path d="M0 20 Q 25 0 50 20 T 100 20 T 150 20 T 200 20 T 250 20 T 300 20 T 350 20 T 400 20 V40 H0Z" />
            </svg>
          </div>
        )}
        <div className="zone-content center grow drink-words">
          {go && (
            <>
              <h1 className="drink-word">DRINK</h1>
              {p && (
                <Cap
                  avatar={p.avatar}
                  size={96}
                  label={p.name}
                  mood="drink"
                  className="cap-popoff"
                />
              )}
              <p className="drink-name">{p?.name}</p>
              <p className="drink-reason">{REASON[mine.reason]}</p>
              {saves.map((x) => (
                <p key={x.saved} className="sticker">
                  Covering for {playerOf(view, x.saved)?.name ?? 'someone'}. Legend.
                </p>
              ))}
            </>
          )}
        </div>
        <DoneButton conn={conn} done={done} />
      </main>
    );
  }

  const savedMe = drink.saves.find((x) => x.saved === me);
  return (
    <main
      className="screen moment drink-other"
      data-testid={drink.drinkers.length ? 'drink-other' : 'drink-nobody'}
    >
      <div className="zone-content center grow">
        {drink.drinkers.length === 0 ? (
          go && (
            <div className="nobody">
              <div className="seesaw" aria-hidden="true">
                <span className="seesaw-bar" />
              </div>
              <h1 className="title">Nobody drinks</h1>
              <p className="drink-reason">{drink.nobody ? NOBODY[drink.nobody] : ''}</p>
            </div>
          )
        ) : (
          <ul className="drinkers">
            {drink.drinkers.map((d, i) => {
              const p = playerOf(view, d.id);
              if (!p) return null;
              return (
                <li
                  key={d.id}
                  className="coaster drinker"
                  style={{ animationDelay: `${i * 140}ms` }}
                >
                  <div className="drinker-cap">
                    <Cap avatar={p.avatar} size={64} label={p.name} mood="drink" />
                    <span className="drink-sticker">DRINK</span>
                  </div>
                  <div>
                    <div className="drinker-name">{p.name}</div>
                    <div className="drink-reason">{REASON[d.reason]}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {savedMe && (
          <p className="sticker">
            Saved by the 2-in-a-row rule.
            {savedMe.by
              ? ` ${playerOf(view, savedMe.by)?.name ?? 'Someone'}'s drinking for you!`
              : ''}
          </p>
        )}
      </div>
    </main>
  );
}

function DoneButton({ conn, done }: { conn: RoomConnection; done: boolean }) {
  return (
    <div className="zone-action drink-action">
      {done ? (
        <p className="do-this">Cheers! 🍻</p>
      ) : (
        <TapButton
          className="btn-primary btn-big"
          onClick={() => {
            conn.ready();
          }}
        >
          Done 🍺
        </TapButton>
      )}
    </div>
  );
}

/** Between games: a quick look at the tally, then the next title card. */
export function Outro({ view }: { view: RoomView }) {
  const s = view.session;
  if (!s) return null;
  const top = [...view.players]
    .map((p) => ({ p, n: s.drinks[p.id] ?? 0 }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  return (
    <main className="screen moment outro" style={{ ['--accent' as string]: inkOf(s.gameId) }}>
      <div className="zone-content center grow">
        <Capn mood="happy" size={84} />
        <p className="label">That was</p>
        <h1 className="title">{s.gameId ? GAME_NAMES[s.gameId] : ''}</h1>
        <ul className="tally">
          {top.map(({ p, n }) => (
            <li key={p.id}>
              <Cap avatar={p.avatar} size={36} label={p.name} />
              <span className="tally-name">{p.name}</span>
              <span className="tally-n">{n}</span>
            </li>
          ))}
        </ul>
        <p className="hint">Next game coming up…</p>
      </div>
    </main>
  );
}

/** Pause, water break and "waiting for players" sit on top of the frozen phase. */
export function OverlayCard({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const overlay = view.session?.overlay;
  const now = useServerNow(conn, 250, !!overlay?.endsAt);
  if (!overlay) return null;
  const isHost = view.hostId === view.you.id;
  const secs =
    overlay.endsAt === null ? null : Math.max(0, Math.ceil((overlay.endsAt - now) / 1000));
  const active = view.players.filter((p) => p.presence !== 'gone').length;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={overlay.kind}>
      <div className="paper overlay-card">
        {overlay.kind === 'water' && (
          <>
            <div className="water" aria-hidden="true">
              <Capn mood="happy" size={80} />
              <span className="water-glass">🥛</span>
            </div>
            <h2 className="title">Water break?</h2>
            <p className="overlay-line">Next round in {secs}s</p>
          </>
        )}
        {overlay.kind === 'paused' && (
          <>
            <Capn mood="sleepy" size={80} />
            <h2 className="title">Paused</h2>
            <p className="overlay-line">Back in {secs}s</p>
            {isHost && (
              <TapButton
                className="btn-primary"
                onClick={() => {
                  conn.host({ kind: 'resume' });
                }}
              >
                Resume
              </TapButton>
            )}
          </>
        )}
        {overlay.kind === 'waiting' && (
          <>
            <Capn mood="shook" size={80} />
            <h2 className="title">Waiting for players…</h2>
            <p className="overlay-line">
              {active < MIN_PLAYERS
                ? `Need ${MIN_PLAYERS} to keep going. Get someone back in!`
                : 'Everyone dropped. Hang tight…'}
            </p>
            {isHost && (
              <TapButton
                className="btn-ghost"
                onClick={() => {
                  conn.host({ kind: 'end' });
                }}
              >
                End game → results
              </TapButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

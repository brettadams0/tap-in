/** Everything after Start: renders whatever phase the server says the room is in (lazy chunk). */
import type { RoomView } from '@tap-in/shared';
import { useCues } from '../audio/useCues.js';
import type { RoomConnection } from '../net/connection.js';
import { ClaimPrompt } from '../screens/Lobby.js';
import '../styles/play.css';
import { ShotgunInput, ShotgunReveal } from './games/ReactionShotgun.js';
import { WyrInput, WyrReveal } from './games/WouldYouRather.js';
import { DrinkMoment, Intro, OverlayCard, Outro, TitleCard } from './moments.js';
import { CornerMenu, HeaderStrip, inkOf, SoundChips } from './parts.js';
import { Results } from './Results.js';

export default function Play({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  useCues(conn, view);
  const isHost = view.hostId === view.you.id;
  return (
    <div className="play-root" data-testid="in-game" data-phase={view.phase}>
      {isHost &&
        view.claims.map((c) => (
          <ClaimPrompt key={c.claimId} conn={conn} claimId={c.claimId} name={c.name} />
        ))}
      <PhaseBody conn={conn} view={view} />
      <OverlayCard conn={conn} view={view} />
      <CornerMenu conn={conn} view={view} />
      <SoundChips />
    </div>
  );
}

function PhaseBody({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  const s = view.session;
  switch (view.phase) {
    case 'intro':
      return <Intro conn={conn} view={view} />;
    case 'gameIntro':
      return <TitleCard conn={conn} view={view} />;
    case 'roundInput':
    case 'roundReveal': {
      const play = s?.play;
      if (!play) return null;
      const reveal = view.phase === 'roundReveal';
      return (
        <main
          className={`screen play play-${play.gameId}${reveal ? ' is-reveal' : ''}`}
          style={{ ['--accent' as string]: inkOf(play.gameId) }}
          data-testid={`${play.gameId}-${reveal ? 'reveal' : 'input'}`}
        >
          <HeaderStrip conn={conn} view={view} timer={play.gameId !== 'reactionShotgun'} />
          {play.gameId === 'wouldYouRather' &&
            (reveal ? (
              <WyrReveal conn={conn} view={view} play={play} />
            ) : (
              <WyrInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'reactionShotgun' &&
            (reveal ? (
              <ShotgunReveal conn={conn} view={view} play={play} />
            ) : (
              <ShotgunInput conn={conn} view={view} play={play} />
            ))}
        </main>
      );
    }
    case 'drink':
      return <DrinkMoment conn={conn} view={view} />;
    case 'gameOutro':
      return <Outro view={view} />;
    case 'results':
      return <Results conn={conn} view={view} />;
    default:
      return null;
  }
}

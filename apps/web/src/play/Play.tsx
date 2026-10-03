/** Everything after Start: renders whatever phase the server says the room is in (lazy chunk). */
import type { RoomView } from '@tap-in/shared';
import { useCues } from '../audio/useCues.js';
import type { RoomConnection } from '../net/connection.js';
import { ClaimPrompt } from '../screens/Lobby.js';
import '../styles/play.css';
import { CountInput, CountReveal } from './games/Countdown.js';
import { FakeInput, FakeReveal } from './games/FakeAnswer.js';
import { BlankInput, BlankReveal } from './games/FillInTheBlank.js';
import { LiarInput, LiarReveal } from './games/LiarsPrompt.js';
import { RankInput, RankReveal } from './games/RankIt.js';
import { ShotgunInput, ShotgunReveal } from './games/ReactionShotgun.js';
import { SecretInput, SecretReveal } from './games/SecretWord.js';
import { SpinInput, SpinReveal } from './games/SpinTheBottle.js';
import { TapInput, TapReveal } from './games/TapRace.js';
import { TruthsInput, TruthsReveal } from './games/TwoTruths.js';
import { WyrInput, WyrReveal } from './games/WouldYouRather.js';
import { DrinkMoment, Intro, OverlayCard, Outro, TitleCard } from './moments.js';
import { CornerMenu, FlagChip, HeaderStrip, inkOf, SoundChips } from './parts.js';
import { ReactionLane } from './reactions.js';
import { Results } from './Results.js';

export default function Play({ conn, view }: { conn: RoomConnection; view: RoomView }) {
  useCues(conn, view);
  const isHost = view.hostId === view.you.id;
  return (
    <div className="play-root" data-testid="in-game" data-phase={view.phase}>
      <SoundChips />
      {isHost &&
        view.claims.map((c) => (
          <ClaimPrompt key={c.claimId} conn={conn} claimId={c.claimId} name={c.name} />
        ))}
      <PhaseBody conn={conn} view={view} />
      <ReactionLane conn={conn} view={view} />
      <OverlayCard conn={conn} view={view} />
      <CornerMenu conn={conn} view={view} />
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
          data-step={play.step}
        >
          <HeaderStrip
            conn={conn}
            view={view}
            timer={play.gameId !== 'reactionShotgun' && play.gameId !== 'tapRace'}
          />
          {!reveal && <FlagChip conn={conn} view={view} />}
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
          {play.gameId === 'liarsPrompt' &&
            (reveal ? (
              <LiarReveal conn={conn} view={view} play={play} />
            ) : (
              <LiarInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'secretWord' &&
            (reveal ? (
              <SecretReveal conn={conn} view={view} play={play} />
            ) : (
              <SecretInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'twoTruths' &&
            (reveal ? (
              <TruthsReveal conn={conn} view={view} play={play} />
            ) : (
              <TruthsInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'fakeAnswer' &&
            (reveal ? (
              <FakeReveal conn={conn} view={view} play={play} />
            ) : (
              <FakeInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'rankIt' &&
            (reveal ? (
              <RankReveal conn={conn} view={view} play={play} />
            ) : (
              <RankInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'tapRace' &&
            (reveal ? (
              <TapReveal conn={conn} view={view} play={play} />
            ) : (
              <TapInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'spinTheBottle' &&
            (reveal ? (
              <SpinReveal conn={conn} view={view} play={play} />
            ) : (
              <SpinInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'fillInTheBlank' &&
            (reveal ? (
              <BlankReveal conn={conn} view={view} play={play} />
            ) : (
              <BlankInput conn={conn} view={view} play={play} />
            ))}
          {play.gameId === 'countdown' &&
            (reveal ? (
              <CountReveal conn={conn} view={view} play={play} />
            ) : (
              <CountInput conn={conn} view={view} play={play} />
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

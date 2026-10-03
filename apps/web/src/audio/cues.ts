/**
 * Which synced sounds a view calls for, and when (server time). Pure, so it is unit-tested.
 * Every cue key embeds its timestamp, so a re-render never double-plays and a pause or an
 * early end (new timestamps) cancels the old ones.
 */
import type { GameId, RoomView } from '@tap-in/shared';

export type CueSound =
  | 'intro'
  | 'sting'
  | 'tick'
  /** An answer lands in Liar's Prompt's synced show. */
  | 'land'
  /** Countdown: a number lands, in the tapper's voice. */
  | 'ding'
  | 'buzzer'
  | 'whoosh'
  | 'clunk'
  | 'reveal'
  | 'drinkYou'
  | 'drinkOther'
  | 'everyone'
  | 'nobody'
  | 'flash'
  | 'fake'
  | 'cheer';

export interface Cue {
  key: string;
  at: number;
  sound: CueSound;
  /** Index into view.players whose signature voice to use. */
  seat?: number;
  game?: GameId;
  private?: boolean;
  vibrate?: number[];
}

/** Offsets before the deadline for the speeding-up tick (last 5 s). */
const TICKS = [5000, 4000, 3000, 2000, 1500, 1000, 600, 300];

export function cuesFor(view: RoomView): Cue[] {
  const s = view.session;
  if (!s) return [];
  const seatOf = (id: string) =>
    Math.max(
      0,
      view.players.findIndex((p) => p.id === id),
    );
  const me = view.you.id;
  const at = view.phaseAt;
  const cues: Cue[] = [];
  switch (view.phase) {
    case 'intro':
      cues.push({ key: `intro:${at}`, at, sound: 'intro' });
      break;
    case 'gameIntro':
      if (s.gameId) cues.push({ key: `sting:${at}`, at, sound: 'sting', game: s.gameId });
      break;
    case 'roundInput': {
      const play = s.play;
      if (play?.gameId === 'reactionShotgun') {
        if (play.pub.fakeAt !== null)
          cues.push({ key: `fake:${play.pub.fakeAt}`, at: play.pub.fakeAt, sound: 'fake' });
        if (play.pub.flashAt !== null)
          cues.push({
            key: `flash:${play.pub.flashAt}`,
            at: play.pub.flashAt,
            sound: 'flash',
            vibrate: [70],
          });
      } else if (play?.gameId === 'liarsPrompt' && play.step === 'show') {
        // Each answer lands in sync, in the answerer's own voice; no countdown ticks here.
        const { showAt, showEach, answers } = play.pub;
        if (showAt !== null && s.overlay === null) {
          (answers ?? []).forEach((a, i) => {
            const t = showAt + i * showEach;
            cues.push({ key: `land:${t}`, at: t, sound: 'land', seat: seatOf(a.id) });
          });
        }
      } else if (play?.gameId === 'tapRace') {
        // A synced 3-2-1, the GO, and the whistle at the end.
        const { goAt, tapMs } = play.pub;
        for (const before of [3000, 2000, 1000]) {
          cues.push({ key: `tick:${goAt - before}`, at: goAt - before, sound: 'tick' });
        }
        cues.push({ key: `go:${goAt}`, at: goAt, sound: 'flash', vibrate: [60] });
        cues.push({ key: `stop:${goAt + tapMs}`, at: goAt + tapMs, sound: 'buzzer' });
      } else if (play?.gameId === 'spinTheBottle' && play.step === 'spin') {
        cues.push({ key: `whoosh:${play.pub.spinAt}`, at: play.pub.spinAt, sound: 'whoosh' });
        cues.push({ key: `clunk:${play.pub.landAt}`, at: play.pub.landAt, sound: 'clunk' });
      } else if (view.phaseEndsAt !== null && s.overlay === null) {
        if (play?.gameId === 'countdown') {
          const { lastAt, lastBy, collisions } = play.pub;
          if (lastAt !== null && lastBy !== null) {
            cues.push({ key: `ding:${lastAt}`, at: lastAt, sound: 'ding', seat: seatOf(lastBy) });
          }
          for (const c of collisions) {
            cues.push({ key: `buzz:${c.at}`, at: c.at, sound: 'buzzer', vibrate: [120] });
          }
        }
        for (const before of TICKS) {
          const t = view.phaseEndsAt - before;
          cues.push({ key: `tick:${t}`, at: t, sound: 'tick' });
        }
      }
      break;
    }
    case 'roundReveal':
      cues.push({ key: `reveal:${at}`, at, sound: 'reveal' });
      // The top answer gets the crowd.
      if (s.play?.gameId === 'fillInTheBlank' && (s.play.reveal?.top.length ?? 0) > 0) {
        cues.push({ key: `cheer:${at}`, at: at + 1600, sound: 'cheer' });
      }
      break;
    case 'drink': {
      const d = s.drink;
      if (!d) break;
      if (d.everyone && d.spared?.ids.includes(me)) {
        // Got away with it: the room drinks, this phone cheers quietly.
        cues.push({ key: `spared:${at}`, at, sound: 'cheer', private: true });
      } else if (d.everyone) {
        cues.push({ key: `everyone:${at}`, at, sound: 'everyone', vibrate: [60, 40, 60, 40, 120] });
      } else if (d.drinkers.some((x) => x.id === me)) {
        cues.push({
          key: `drinkYou:${at}`,
          at,
          sound: 'drinkYou',
          seat: seatOf(me),
          private: true,
          vibrate: [60, 40, 120],
        });
      } else if (d.drinkers.length > 0) {
        cues.push({
          key: `drinkOther:${at}`,
          at,
          sound: 'drinkOther',
          seat: seatOf(d.drinkers[0]?.id ?? ''),
        });
      } else {
        cues.push({ key: `nobody:${at}`, at, sound: 'nobody' });
      }
      break;
    }
    case 'results':
      cues.push({ key: `cheer:${at}`, at, sound: 'cheer' });
      break;
    default:
      break;
  }
  return cues;
}

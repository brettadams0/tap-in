/**
 * The Drink system (SPEC "The Drink system", DECISIONS R6/R7). Pure functions.
 *
 * Fairness cap: nobody is *assigned* a drink more than 2 rounds in a row. A capped player is
 * excused; the other drinkers still drink. If that leaves nobody, the next-worst player in the
 * game's ranking covers; with no ranking it's a lucky escape. Self-inflicted and everyone-drinks
 * moments are never capped or redirected.
 */
import type { AwardView, DrinkView, GameId, PlayerId, ResultsView } from '@tap-in/shared';
import type { Drinker, RoundResult } from '@tap-in/games';

export const CAP_IN_A_ROW = 2;

export function applyFairnessCap(
  result: Omit<RoundResult<unknown>, 'reveal'>,
  participants: readonly PlayerId[],
  streak: Readonly<Record<PlayerId, number>>,
): { drink: DrinkView; streak: Record<PlayerId, number> } {
  const capped = (id: PlayerId) => (streak[id] ?? 0) >= CAP_IN_A_ROW;
  const assigned = result.assigned.filter((d) => !capped(d.id));
  const saved = result.assigned.filter((d) => capped(d.id)).map((d) => d.id);
  const saves: DrinkView['saves'] = saved.map((id) => ({ saved: id, by: null }));

  if (saved.length > 0 && assigned.length === 0) {
    const cover = result.ranking.find(
      (id) => !capped(id) && !result.selfInflicted.some((d) => d.id === id),
    );
    if (cover !== undefined) {
      assigned.push({ id: cover, reason: 'covering' });
      for (const s of saves) s.by = cover;
    }
  }

  const drinkers: Drinker[] = [];
  for (const d of [...assigned, ...result.selfInflicted]) {
    if (!drinkers.some((x) => x.id === d.id)) drinkers.push(d);
  }
  const next: Record<PlayerId, number> = {};
  for (const id of participants) {
    next[id] = assigned.some((d) => d.id === id) ? (streak[id] ?? 0) + 1 : 0;
  }
  const nobodyDrinks = drinkers.length === 0 && !result.everyone;
  return {
    drink: {
      drinkers: drinkers.map((d) => ({ id: d.id, reason: d.reason })),
      everyone: result.everyone,
      spared: result.everyone && result.spared ? result.spared : null,
      nobody: nobodyDrinks ? (result.nobody ?? 'lucky') : null,
      saves,
    },
    streak: next,
  };
}

/** Who gets +1 on the tally for this Drink moment. */
export function drinkersOf(drink: DrinkView, participants: readonly PlayerId[]): PlayerId[] {
  if (!drink.everyone) return drink.drinkers.map((d) => d.id);
  const spared = new Set(drink.spared?.ids ?? []);
  return participants.filter((id) => !spared.has(id));
}

/** Tap Race's window, for taps per second. */
const TAP_WINDOW_S = 5;

export interface SessionStats {
  reactionMs: Readonly<Record<PlayerId, number[]>>;
  liarPoints: Readonly<Record<PlayerId, number>>;
  chaos: Readonly<Record<PlayerId, number>>;
  /** Tap Race counts. */
  taps: Readonly<Record<PlayerId, number[]>>;
}

const average = (xs: readonly number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** The players tied for the best score, or nobody. */
function best(scores: Map<PlayerId, number>, higherWins: boolean): PlayerId[] {
  if (scores.size === 0) return [];
  const values = [...scores.values()];
  const top = higherWins ? Math.max(...values) : Math.min(...values);
  return [...scores].filter(([, v]) => v === top).map(([id]) => id);
}

/**
 * Fastest thumbs: average Reaction Shotgun time and Tap Race taps per second. With both, each
 * player's rank in the two is added up (missing one counts as last) and the lowest total wins.
 */
function fastestThumbs(players: readonly PlayerId[], stats: SessionStats): AwardView | null {
  const reaction = new Map<PlayerId, number>();
  const speed = new Map<PlayerId, number>();
  for (const id of players) {
    const r = average(stats.reactionMs[id] ?? []);
    if (r !== null) reaction.set(id, Math.round(r));
    const t = average(stats.taps[id] ?? []);
    if (t !== null && t > 0) speed.set(id, Math.round((t / TAP_WINDOW_S) * 10) / 10);
  }
  const ms = (id: PlayerId) => `${String(reaction.get(id))} ms average`;
  const tps = (id: PlayerId) => `${String(speed.get(id))} taps a second`;
  if (reaction.size === 0 && speed.size === 0) return null;
  if (speed.size === 0) {
    const winners = best(reaction, false);
    return { id: 'fastestThumbs', players: winners, detail: ms(winners[0] ?? '') };
  }
  if (reaction.size === 0) {
    const winners = best(speed, true);
    return { id: 'fastestThumbs', players: winners, detail: tps(winners[0] ?? '') };
  }
  const rank = (scores: Map<PlayerId, number>, higherWins: boolean) => {
    const sorted = [...scores.values()].sort((a, b) => (higherWins ? b - a : a - b));
    return (id: PlayerId) => {
      const v = scores.get(id);
      return v === undefined ? players.length : sorted.indexOf(v);
    };
  };
  const rReaction = rank(reaction, false);
  const rSpeed = rank(speed, true);
  const total = new Map(players.map((id) => [id, rReaction(id) + rSpeed(id)] as const));
  const winners = best(total, false);
  const first = winners[0] ?? '';
  const parts = [reaction.has(first) ? ms(first) : null, speed.has(first) ? tps(first) : null];
  return {
    id: 'fastestThumbs',
    players: winners,
    detail: parts.filter((p) => p !== null).join(' · '),
  };
}

export function buildResults(
  players: readonly PlayerId[],
  drinks: Readonly<Record<PlayerId, number>>,
  games: readonly GameId[],
  stats: SessionStats,
): ResultsView {
  const standings = players
    .map((id) => ({ id, drinks: drinks[id] ?? 0 }))
    .sort((a, b) => b.drinks - a.drinks);
  const awards: AwardView[] = [];
  const most = standings[0]?.drinks ?? 0;
  const least = standings.at(-1)?.drinks ?? 0;
  if (most > 0) {
    awards.push({
      id: 'mostDrinks',
      players: standings.filter((s) => s.drinks === most).map((s) => s.id),
      detail: most === 1 ? '1 drink' : `${most} drinks`,
    });
  }
  const thumbs = fastestThumbs(players, stats);
  if (thumbs) awards.push(thumbs);
  const points = (record: Readonly<Record<PlayerId, number>>) =>
    new Map(players.flatMap((id) => ((record[id] ?? 0) > 0 ? [[id, record[id] ?? 0]] : [])));
  const liars = best(points(stats.liarPoints), true);
  const lies = stats.liarPoints[liars[0] ?? ''] ?? 0;
  if (liars.length > 0) {
    awards.push({
      id: 'bestLiar',
      players: liars,
      detail: lies === 1 ? '1 lie landed' : `${String(lies)} lies landed`,
    });
  }
  const chaotic = best(points(stats.chaos), true);
  const chaos = stats.chaos[chaotic[0] ?? ''] ?? 0;
  if (chaotic.length > 0) {
    awards.push({
      id: 'mostChaotic',
      players: chaotic,
      detail: chaos === 1 ? '1 chaos point' : `${String(chaos)} chaos points`,
    });
  }
  if (least < most) {
    awards.push({
      id: 'cleanRecord',
      players: standings.filter((s) => s.drinks === least).map((s) => s.id),
      detail: least === 1 ? '1 drink' : `${least} drinks`,
    });
  }
  return { standings, awards, games: [...games] };
}

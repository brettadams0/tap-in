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
      nobody: nobodyDrinks ? (result.nobody ?? 'lucky') : null,
      saves,
    },
    streak: next,
  };
}

/** Who gets +1 on the tally for this Drink moment. */
export function drinkersOf(drink: DrinkView, participants: readonly PlayerId[]): PlayerId[] {
  return drink.everyone ? [...participants] : drink.drinkers.map((d) => d.id);
}

export function buildResults(
  players: readonly PlayerId[],
  drinks: Readonly<Record<PlayerId, number>>,
  reactionMs: Readonly<Record<PlayerId, number[]>>,
  games: readonly GameId[],
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
  const averages = players
    .map((id) => {
      const times = reactionMs[id] ?? [];
      const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
      return { id, avg };
    })
    .filter((x): x is { id: PlayerId; avg: number } => x.avg !== null);
  if (averages.length > 0) {
    const best = Math.min(...averages.map((a) => a.avg));
    awards.push({
      id: 'fastestThumbs',
      players: averages.filter((a) => a.avg === best).map((a) => a.id),
      detail: `${best} ms average`,
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

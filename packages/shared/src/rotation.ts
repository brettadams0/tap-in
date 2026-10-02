/**
 * Game rotation (SPEC "Game rotation rules", PLAN.md §3). Pure, seeded.
 *
 * Hard rule: no repeats until every enabled game has played once in this cycle.
 * Soft rules, relaxed in this order when they can't all hold:
 *   1. every 3rd block is a quick game
 *   2. no two speed games back to back
 *   3. no two typing-heavy games back to back
 */
import { GAME_META } from './games.js';
import type { Rng } from './rng.js';
import type { GameId } from './settings.js';

/** Games still unplayed in the current cycle. */
export function cyclePool(history: readonly GameId[], enabled: readonly GameId[]): GameId[] {
  const played = new Set<GameId>();
  for (const g of history) {
    if (!enabled.includes(g)) continue;
    played.add(g);
    if (enabled.every((e) => played.has(e))) played.clear();
  }
  return enabled.filter((g) => !played.has(g));
}

export function pickNextGame(
  history: readonly GameId[],
  enabled: readonly GameId[],
  rng: Rng,
): GameId {
  if (enabled.length === 0) throw new Error('no games enabled');
  let pool = cyclePool(history, enabled);
  const last = history.at(-1);
  // A new cycle must not open with the game that just closed the old one.
  if (pool.length > 1 && last !== undefined) pool = pool.filter((g) => g !== last);

  const block = history.length + 1;
  const lastEnergy = last === undefined ? null : GAME_META[last].energy;
  const quickSlot = (g: GameId) => block % 3 !== 0 || GAME_META[g].quick;
  const noSpeedPair = (g: GameId) => !(lastEnergy === 'speed' && GAME_META[g].energy === 'speed');
  const noTypingPair = (g: GameId) =>
    !(lastEnergy === 'typing' && GAME_META[g].energy === 'typing');

  // Look ahead: don't spend a quick game now if later quick slots in this cycle would run dry.
  const futureQuickSlots = Array.from({ length: pool.length - 1 }, (_, i) => block + 1 + i).filter(
    (b) => b % 3 === 0,
  ).length;
  const quickLeft = pool.filter((g) => GAME_META[g].quick).length;
  const saveQuick = (g: GameId) =>
    block % 3 === 0 || !GAME_META[g].quick || quickLeft - 1 >= futureQuickSlots;

  const tiers: ((g: GameId) => boolean)[][] = [
    [quickSlot, saveQuick, noSpeedPair, noTypingPair],
    [quickSlot, noSpeedPair, noTypingPair],
    [noSpeedPair, noTypingPair],
    [noTypingPair],
    [],
  ];
  for (const rules of tiers) {
    const ok = pool.filter((g) => rules.every((r) => r(g)));
    if (ok.length > 0) return rng.pick(ok);
  }
  return rng.pick(pool);
}

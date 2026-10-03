/** Voting helpers shared by the deception games. */
import type { PlayerId } from '@tap-in/shared';

/** Votes each suspect got, counting only voters and suspects in `players`. */
export function tally(
  votes: Readonly<Record<PlayerId, PlayerId>>,
  players: readonly PlayerId[],
): Map<PlayerId, number> {
  const counts = new Map<PlayerId, number>();
  for (const voter of players) {
    const suspect = votes[voter];
    if (suspect !== undefined && players.includes(suspect)) {
      counts.set(suspect, (counts.get(suspect) ?? 0) + 1);
    }
  }
  return counts;
}

/** Caught = more than half of the votes cast (DECISIONS R11). */
export function isCaught(
  votes: Readonly<Record<PlayerId, PlayerId>>,
  players: readonly PlayerId[],
  suspect: PlayerId,
): boolean {
  const cast = players.filter((p) => votes[p] !== undefined && players.includes(votes[p])).length;
  return (tally(votes, players).get(suspect) ?? 0) * 2 > cast;
}

/** A vote for someone else in the round. */
export function validSuspect(
  players: readonly PlayerId[],
  voter: PlayerId,
  suspect: PlayerId,
): boolean {
  return suspect !== voter && players.includes(suspect);
}

/** Connected players who should have acted but didn't (DECISIONS R5). */
export function idle(
  expected: readonly PlayerId[],
  acted: (id: PlayerId) => boolean,
  connected: readonly PlayerId[],
): PlayerId[] {
  return expected.filter((id) => !acted(id) && connected.includes(id));
}

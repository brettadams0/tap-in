/**
 * Prompt banks (content/*.json). Server-side only: banks never ship to the client,
 * only the current round's text does (PLAN.md §4).
 */
import { SPICE_LEVELS, type Rng, type Spice } from '@tap-in/shared';
import { z } from 'zod';
import wouldYouRatherJson from '../../../content/wouldYouRather.v1.json';

const spice = z.enum(SPICE_LEVELS);
const promptId = z.string().regex(/^[a-z0-9-]+$/);

export const wyrEntrySchema = z.strictObject({
  id: promptId,
  spice,
  a: z.string().min(3).max(90),
  b: z.string().min(3).max(90),
});
export type WyrEntry = z.infer<typeof wyrEntrySchema>;

export function bankSchema<T extends z.ZodType>(entry: T) {
  return z.strictObject({
    bank: z.string(),
    version: z.number().int().positive(),
    entries: z.array(entry),
  });
}

export const wyrBank = bankSchema(wyrEntrySchema).parse(wouldYouRatherJson).entries;

/** Higher spice levels include the lower ones (SPEC "Spice levels"). */
export function allowedAt(entrySpice: Spice, roomSpice: Spice): boolean {
  return SPICE_LEVELS.indexOf(entrySpice) <= SPICE_LEVELS.indexOf(roomSpice);
}

/**
 * A random unused entry at or below the room's spice. When the bank runs dry the session's
 * used-list for it is cleared and prompts start repeating.
 */
export function pickEntry<T extends { id: string; spice: Spice }>(
  bank: readonly T[],
  roomSpice: Spice,
  used: string[],
  rng: Rng,
): T {
  const allowed = bank.filter((e) => allowedAt(e.spice, roomSpice));
  if (allowed.length === 0) throw new Error('empty bank');
  let fresh = allowed.filter((e) => !used.includes(e.id));
  if (fresh.length === 0) {
    used.length = 0;
    fresh = allowed;
  }
  const entry = rng.pick(fresh);
  used.push(entry.id);
  return entry;
}

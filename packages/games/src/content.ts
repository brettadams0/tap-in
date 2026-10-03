/**
 * Prompt banks (content/*.json). Server-side only: banks never ship to the client,
 * only the current round's text does (PLAN.md §4).
 */
import { SPICE_LEVELS, type Rng, type Spice } from '@tap-in/shared';
import { z } from 'zod';
import fakeAnswerJson from '../../../content/fakeAnswer.v1.json';
import fillInTheBlankJson from '../../../content/fillInTheBlank.v1.json';
import rankItJson from '../../../content/rankIt.v1.json';
import spinTheBottleJson from '../../../content/spinTheBottle.v1.json';
import liarsPromptJson from '../../../content/liarsPrompt.v1.json';
import secretWordJson from '../../../content/secretWord.v1.json';
import twoTruthsJson from '../../../content/twoTruths.v1.json';
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

/** Liar's Prompt: everyone answers `main`, the imposter answers `imposter`. */
export const liarEntrySchema = z.strictObject({
  id: promptId,
  spice,
  main: z.string().min(5).max(80),
  imposter: z.string().min(5).max(80),
});

/** Secret Word: the word everyone but the outsider sees, and the category everyone sees. */
export const secretEntrySchema = z.strictObject({
  id: promptId,
  spice,
  word: z.string().min(2).max(24),
  category: z.string().min(2).max(32),
});

/** Two Truths: a first-person fake fact that could plausibly be true of anyone. */
export const fakeFactEntrySchema = z.strictObject({
  id: promptId,
  spice,
  fact: z.string().min(8).max(70),
});

/** Fake Answer: an obscure trivia question and its real answer. */
export const triviaEntrySchema = z.strictObject({
  id: promptId,
  spice,
  question: z.string().min(10).max(160),
  answer: z.string().min(1).max(40),
});

/** Rank It: a prompt and four items to rank, best first. */
export const rankEntrySchema = z.strictObject({
  id: promptId,
  spice,
  prompt: z.string().min(5).max(70),
  items: z.array(z.string().min(2).max(32)).length(4),
});

/** Spin the Bottle: a mild, stranger-safe dare (SPEC §9). */
export const dareEntrySchema = z.strictObject({
  id: promptId,
  spice,
  dare: z.string().min(10).max(110),
});

/** Fill in the Blank: a prompt with exactly one ___ blank. */
export const blankEntrySchema = z.strictObject({
  id: promptId,
  spice,
  prompt: z
    .string()
    .min(10)
    .max(120)
    .refine((p) => p.split('___').length === 2, 'needs exactly one ___'),
});

export function bankSchema<T extends z.ZodType>(entry: T) {
  return z.strictObject({
    bank: z.string(),
    version: z.number().int().positive(),
    entries: z.array(entry),
  });
}

export const wyrBank = bankSchema(wyrEntrySchema).parse(wouldYouRatherJson).entries;
export const liarBank = bankSchema(liarEntrySchema).parse(liarsPromptJson).entries;
export const secretBank = bankSchema(secretEntrySchema).parse(secretWordJson).entries;
export const fakeFactBank = bankSchema(fakeFactEntrySchema).parse(twoTruthsJson).entries;
export const triviaBank = bankSchema(triviaEntrySchema).parse(fakeAnswerJson).entries;
export const rankBank = bankSchema(rankEntrySchema).parse(rankItJson).entries;
export const dareBank = bankSchema(dareEntrySchema).parse(spinTheBottleJson).entries;
export const blankBank = bankSchema(blankEntrySchema).parse(fillInTheBlankJson).entries;

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

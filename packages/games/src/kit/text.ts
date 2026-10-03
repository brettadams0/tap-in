/**
 * Text kit for the typing games (PLAN.md §9 phase 3, DECISIONS R10/R12).
 * Normalisation, similarity, word containment and the profanity tiers for typed answers.
 */
import { graphemes, type Spice } from '@tap-in/shared';
import { hasSlur, maskProfanity } from '@tap-in/shared/server';

/** Words that don't make two answers different ("the Eiffel Tower" = "Eiffel Tower"). */
const FILLER = new Set(['a', 'an', 'the', 'of', 'and', 'my', 'your', 'some', 'its', 'it']);

/** Lowercase, strip accents and punctuation, drop filler words. Words joined by single spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0 && !FILLER.has(w))
    .join(' ');
}

/** Normalised with the spaces taken out ("Pizza Hut" = "pizzahut"). */
export function compact(text: string): string {
  return normalize(text).replace(/ /g, '');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
    }
    prev = row;
  }
  return prev[b.length] ?? 0;
}

/** 1 = identical, 0 = nothing alike. Compared on compact normalised text. */
export function similarity(a: string, b: string): number {
  const x = compact(a);
  const y = compact(b);
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(x, y) / longest;
}

/** Every word of the shorter answer appears in the longer one. */
function wordsContained(a: string, b: string): boolean {
  const wa = normalize(a).split(' ').filter(Boolean);
  const wb = normalize(b).split(' ').filter(Boolean);
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (short.length === 0) return false;
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

export const TOO_CLOSE = 0.75;

/** Fake Answer: a fake that is basically the real answer (R12). */
export function tooClose(fake: string, real: string): boolean {
  if (wordsContained(fake, real)) return true;
  // A year or a count is a fine fake one digit away from the real one.
  if (/\d/.test(compact(fake)) || /\d/.test(compact(real))) return sameAnswer(fake, real);
  return similarity(fake, real) >= TOO_CLOSE;
}

/** Two typed answers say the same thing (merged into one card). */
export function sameAnswer(a: string, b: string): boolean {
  return compact(a) === compact(b);
}

/**
 * Secret Word: does the hint give the word away? It contains the word (plurals, "pizzaria"),
 * is a near-typo of it, or is a big chunk of it ("melon" for "watermelon").
 */
export function givesAway(hint: string, word: string): boolean {
  const h = compact(hint);
  const w = compact(word);
  if (h.length === 0 || w.length === 0) return false;
  if (h.includes(w)) return true;
  if (h.length >= 4 && w.includes(h)) return true;
  return similarity(h, w) >= 0.8;
}

/** Secret Word: the outsider's guess counts if it's the word, give or take a typo or plural. */
export function guessMatches(guess: string, word: string): boolean {
  return compact(guess).length > 0 && (sameAnswer(guess, word) || similarity(guess, word) >= 0.8);
}

export type Cleaned = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Tidy a typed answer: trim, collapse whitespace, enforce a length, block slurs at every level
 * and mask mild swearing at Chill (R10).
 */
export function cleanText(raw: string, spice: Spice, max: number): Cleaned {
  const text = raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
  if (normalize(text).length === 0) return { ok: false, reason: 'Type something first.' };
  if (graphemes(text).length > max) return { ok: false, reason: `${max} characters max.` };
  if (hasSlur(text)) return { ok: false, reason: 'Not that. Keep it friendly.' };
  return { ok: true, text: spice === 'chill' ? maskProfanity(text) : text };
}

/** A single word: no spaces inside. */
export function isOneWord(text: string): boolean {
  return /^\S+$/.test(text.trim());
}

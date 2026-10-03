import { describe, expect, it } from 'vitest';
import {
  cleanText,
  compact,
  givesAway,
  guessMatches,
  isOneWord,
  levenshtein,
  normalize,
  sameAnswer,
  similarity,
  tooClose,
} from './text.js';

describe('text kit', () => {
  it('normalises case, accents, punctuation and filler words', () => {
    expect(normalize('  The Café  —  "Crème Brûlée"! ')).toBe('cafe creme brulee');
    expect(normalize('Salt & Pepper')).toBe('salt pepper');
    expect(compact('Pizza Hut')).toBe('pizzahut');
    expect(normalize('!!!')).toBe('');
  });

  it('measures edit distance and similarity', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
    expect(similarity('', '')).toBe(1);
    expect(similarity('Eiffel Tower', 'the eiffel tower')).toBe(1);
    expect(similarity('cat', 'dog')).toBe(0);
  });

  it('rejects fakes that are too close to the real answer (R12)', () => {
    expect(tooClose('Wooden ducks', 'Wooden duck')).toBe(true);
    expect(tooClose('a wooden duck toy', 'Wooden duck')).toBe(true);
    expect(tooClose('Hot sauce', 'Wooden duck')).toBe(false);
    expect(tooClose('Fire', 'Ice')).toBe(false);
    // Numbers only clash when they're the same number: 1933 is a fine fake for 1932.
    expect(tooClose('1933', '1932')).toBe(false);
    expect(tooClose('In 1932', '1932')).toBe(true);
    expect(tooClose('!!!', 'Ice')).toBe(false);
  });

  it('merges answers that say the same thing', () => {
    expect(sameAnswer('The Moon!', 'moon')).toBe(true);
    expect(sameAnswer('Moon', 'Mars')).toBe(false);
  });

  it('blocks hints that give the secret word away', () => {
    expect(givesAway('pizzas', 'pizza')).toBe(true);
    expect(givesAway('Piza', 'pizza')).toBe(true);
    expect(givesAway('melon', 'watermelon')).toBe(true);
    expect(givesAway('cheese', 'pizza')).toBe(false);
    expect(givesAway('ice', 'nice')).toBe(false);
    expect(givesAway('', 'pizza')).toBe(false);
  });

  it('accepts an outsider guess with a typo or plural', () => {
    expect(guessMatches('Pizzas', 'pizza')).toBe(true);
    expect(guessMatches('pizza', 'Pizza')).toBe(true);
    expect(guessMatches('taco', 'pizza')).toBe(false);
    expect(guessMatches('...', 'pizza')).toBe(false);
  });

  it('cleans typed answers by spice level (R10)', () => {
    expect(cleanText('  hello   there ', 'chill', 30)).toEqual({ ok: true, text: 'hello there' });
    expect(cleanText('   ', 'chill', 30)).toMatchObject({ ok: false });
    expect(cleanText('x'.repeat(31), 'chill', 30)).toMatchObject({ ok: false });
    expect(cleanText('holy shit', 'chill', 30)).toEqual({ ok: true, text: 'holy ****' });
    expect(cleanText('holy shit', 'spicy', 30)).toEqual({ ok: true, text: 'holy shit' });
    expect(cleanText('you f4ggot', 'unhinged', 30)).toMatchObject({ ok: false });
  });

  it('knows a single word', () => {
    expect(isOneWord(' cheese ')).toBe(true);
    expect(isOneWord('two words')).toBe(false);
  });
});

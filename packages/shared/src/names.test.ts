import { describe, expect, it } from 'vitest';
import { cleanName, dedupeName, graphemes, NAME_MAX } from './names.js';
import { isProfane } from './profanity.js';

describe('names', () => {
  it('cleans whitespace and control characters', () => {
    expect(cleanName('  Sam   the\tMan ')).toBe('Sam the Man');
    expect(cleanName('Pri​ya')).toBe('Priya');
  });

  it('caps length in graphemes, not code units', () => {
    expect(graphemes(cleanName('abcdefghijklmnop'))).toHaveLength(NAME_MAX);
    const emojiName = cleanName('👩‍🎤'.repeat(20));
    expect(graphemes(emojiName)).toHaveLength(NAME_MAX);
  });

  it('suffixes duplicates case-insensitively', () => {
    expect(dedupeName('Sam', ['Priya'])).toBe('Sam');
    expect(dedupeName('sam', ['Sam'])).toBe('sam 2');
    expect(dedupeName('Sam', ['Sam', 'Sam 2'])).toBe('Sam 3');
    const long = 'Bartholomew1';
    const out = dedupeName(long, [long]);
    expect(graphemes(out).length).toBeLessThanOrEqual(NAME_MAX);
    expect(out.endsWith(' 2')).toBe(true);
  });

  it('flags profanity including leetspeak', () => {
    expect(isProfane('Sam')).toBe(false);
    expect(isProfane('Scunthorpe')).toBe(false);
    expect(isProfane('fuck')).toBe(true);
    expect(isProfane('sh1t')).toBe(true);
  });
});

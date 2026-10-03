import { describe, expect, it } from 'vitest';
import { hasSlur, isProfane, maskProfanity } from './profanity.js';

describe('profanity tiers', () => {
  it('flags swearing and slurs, but only slurs are always blocked', () => {
    expect(isProfane('what the fuck')).toBe(true);
    expect(hasSlur('what the fuck')).toBe(false);
    expect(hasSlur('you f4ggot')).toBe(true);
    expect(hasSlur('n1gger')).toBe(true);
    expect(isProfane('a lovely day')).toBe(false);
    expect(hasSlur('Scunthorpe pancakes')).toBe(false);
  });

  it('masks swearing and leaves clean text alone', () => {
    expect(maskProfanity('holy shit balls')).toBe('holy **** balls');
    expect(maskProfanity('a lovely day')).toBe('a lovely day');
  });
});

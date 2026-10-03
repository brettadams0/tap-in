import { describe, expect, it } from 'vitest';
import { FLOOD_VARIANTS, floodVariant } from './moments.js';

describe('Drink flood variants', () => {
  it('holds still for one Drink moment and rotates through all four', () => {
    expect(floodVariant(12_345_678, 2)).toBe(floodVariant(12_345_678, 2));
    const seen = new Set([0, 1, 2, 3].map((n) => floodVariant(10_000, n)));
    expect([...seen].sort()).toEqual([...FLOOD_VARIANTS].sort());
  });
});

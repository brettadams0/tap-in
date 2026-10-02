import { describe, expect, it } from 'vitest';
import { CAP_COLORS, CAP_COLOR_IDS, colorHex, firstFreeColor, randomAvatar } from './avatar.js';
import { createRng } from './rng.js';
import { avatarSchema } from './schemas.js';

describe('avatar', () => {
  it('offers 16 distinct colours', () => {
    expect(new Set(CAP_COLORS.map((c) => c.hex)).size).toBe(16);
    expect(colorHex('red')).toBe('#FF4D3D');
  });

  it('random caps are valid and avoid taken colours', () => {
    const rng = createRng('caps');
    const taken = CAP_COLOR_IDS.slice(0, 15);
    for (let i = 0; i < 50; i++) {
      const a = randomAvatar(rng.next, taken);
      expect(avatarSchema.safeParse(a).success).toBe(true);
      expect(a.color).toBe(CAP_COLOR_IDS[15]);
    }
    expect(CAP_COLOR_IDS).toContain(randomAvatar(rng.next, CAP_COLOR_IDS).color);
  });

  it('finds the first free colour', () => {
    expect(firstFreeColor([])).toBe('red');
    expect(firstFreeColor(['red', 'tangerine'])).toBe('peach');
    expect(firstFreeColor(CAP_COLOR_IDS)).toBeNull();
  });
});

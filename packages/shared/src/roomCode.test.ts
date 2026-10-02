import { describe, expect, it } from 'vitest';
import { createRng } from './rng.js';
import { CODE_ALPHABET, generateRoomCode, isBlockedCode, isValidCode, normalizeCode } from './roomCode.js';

describe('room codes', () => {
  it('never contains ambiguous characters', () => {
    expect(CODE_ALPHABET).not.toMatch(/[IO01]/);
    const rng = createRng('codes');
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode(rng.next);
      expect(isValidCode(code)).toBe(true);
      expect(isBlockedCode(code)).toBe(false);
    }
  });

  it('skips blocked words', () => {
    // Feed the letters of a blocked word first, then a clean one.
    const seq = [...'DAMN', ...'TAPS'].map((ch) => (CODE_ALPHABET.indexOf(ch) + 0.5) / CODE_ALPHABET.length);
    let i = 0;
    expect(generateRoomCode(() => seq[i++] ?? 0)).toBe('TAPS');
  });

  it('normalizes user input', () => {
    expect(normalizeCode(' kz-rp ')).toBe('KZRP');
    expect(normalizeCode('abcdef')).toBe('ABCD');
    expect(isValidCode('KZR')).toBe(false);
    expect(isValidCode('KZRO')).toBe(false);
  });
});

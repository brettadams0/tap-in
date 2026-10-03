import type { RoomView } from '@tap-in/shared';
import { describe, expect, it } from 'vitest';
import { CAPN_LINES, capnLine } from './capn.js';

const view = (phase: RoomView['phase'], round = 1): RoomView =>
  ({ code: 'KZRP', phase, session: { block: 1, round } }) as unknown as RoomView;

describe("Capn's commentary", () => {
  it('has a handful of short lines for every moment, with no drink amounts', () => {
    for (const lines of Object.values(CAPN_LINES)) {
      expect(lines.length).toBeGreaterThanOrEqual(6);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(48);
        expect(line).not.toMatch(/\b(sips?|shots?|chug\w*|drink)\b/i);
      }
    }
  });

  it('holds the same line for a moment and changes it between rounds', () => {
    expect(capnLine(view('roundReveal'))).toBe(capnLine(view('roundReveal')));
    expect(CAPN_LINES.reveal).toContain(capnLine(view('roundReveal')));
    const lines = new Set([1, 2, 3, 4, 5, 6].map((r) => capnLine(view('drink', r))));
    expect(lines.size).toBeGreaterThan(1);
    expect(capnLine(view('gameIntro'))).toBeNull();
    expect(capnLine(view('roundInput'))).toBeNull();
  });
});

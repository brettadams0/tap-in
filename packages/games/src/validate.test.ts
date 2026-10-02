import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BANKS, BANNED, validateBank } from './validate.js';

const wyr = BANKS[0];
if (!wyr) throw new Error('no banks');
const entry = (id: string, a = `Option ${id}`, spice = 'chill') => ({
  id,
  spice,
  a,
  b: 'Other one',
});

describe('content validator', () => {
  it('passes the real banks with no errors', () => {
    for (const rule of BANKS) {
      const json: unknown = JSON.parse(
        readFileSync(new URL(`../../../content/${rule.file}`, import.meta.url), 'utf8'),
      );
      expect(validateBank(rule, json).errors).toEqual([]);
    }
  });

  it('catches schema errors, duplicates, banned wording and short banks', () => {
    expect(
      validateBank(wyr, { bank: 'x', version: 1, entries: [{ id: 'a' }] }).errors,
    ).toHaveLength(1);
    const report = validateBank(wyr, {
      bank: 'wouldYouRather',
      version: 1,
      entries: [
        entry('a-1'),
        entry('a-1', 'Something else'),
        entry('a-2'),
        entry('a-3', 'Take two shots'),
      ],
    });
    expect(report.errors.join('\n')).toMatch(/duplicate id a-1/);
    expect(report.errors.join('\n')).toMatch(/banned drink wording/);
    expect(report.short).toHaveLength(3);
  });

  it('flags duplicate prompt text', () => {
    const report = validateBank(wyr, {
      bank: 'wouldYouRather',
      version: 1,
      entries: [entry('b-1', 'Same thing'), entry('b-2', 'same thing!')],
    });
    expect(report.errors.join()).toMatch(/duplicate prompt b-2/);
  });

  it('bans drink amounts but not ordinary words', () => {
    expect(BANNED.test('have a sip')).toBe(true);
    expect(BANNED.test('2 drinks each')).toBe(true);
    expect(BANNED.test('shooting star')).toBe(false);
    expect(BANNED.test('Drink!')).toBe(false);
  });
});

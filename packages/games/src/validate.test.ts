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
      const report = validateBank(rule, json);
      expect(report.errors).toEqual([]);
      // Phase 5: every bank is at its minimum (the build runs with --strict).
      expect(report.short).toEqual([]);
    }
  });

  it('counts reaction lines per tab, tagged and available at each spice', () => {
    const rule = BANKS.find((b) => b.file === 'reactions.v1.json');
    if (!rule) throw new Error('no reactions rule');
    const line = (id: string, tab: string, spice: string) => ({
      id,
      spice,
      tab,
      line: `Line ${id}`,
    });
    const entries = [
      ...Array.from({ length: 40 }, (_, i) => line(`k-c-${i}`, 'kind', 'chill')),
      ...Array.from({ length: 10 }, (_, i) => line(`k-s-${i}`, 'kind', 'spicy')),
      ...Array.from({ length: 10 }, (_, i) => line(`k-u-${i}`, 'kind', 'unhinged')),
      ...Array.from({ length: 30 }, (_, i) => line(`f-c-${i}`, 'funny', 'chill')),
      ...Array.from({ length: 10 }, (_, i) => line(`f-s-${i}`, 'funny', 'spicy')),
    ];
    const report = validateBank(rule, { bank: 'reactions', version: 1, entries });
    expect(report.errors).toEqual([]);
    expect(report.short).toEqual([
      'reactions.v1.json: funny at chill offers 30/40',
      'reactions.v1.json: funny unhinged has 0/10',
    ]);
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

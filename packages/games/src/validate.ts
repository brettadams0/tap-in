/**
 * Build-time content checks (SPEC "Validation"): schema, duplicate ids and text, length limits,
 * banned drink wording and minimum counts per spice level (DECISIONS R2).
 */
import { SPICE_LEVELS, type Spice } from '@tap-in/shared';
import type { z } from 'zod';
import {
  bankSchema,
  blankEntrySchema,
  dareEntrySchema,
  rankEntrySchema,
  fakeFactEntrySchema,
  liarEntrySchema,
  secretEntrySchema,
  triviaEntrySchema,
  wyrEntrySchema,
} from './content.js';

/** The Drink instruction is only ever "Drink": no amounts or drink-size words in prompts. */
export const BANNED = /\b(sips?|shots?|chug(s|ging)?|finish (your|the) drink|\d+\s+drinks?)\b/i;

/**
 * Dares never involve touching anyone, contact info, filming or leaving the area (SPEC §9),
 * and nothing about bodies or clothes coming off.
 */
export const UNSAFE_DARE =
  /\b(touch\w*|kiss\w*|hug\w*|lick\w*|sit on|lap|undress\w*|strip\w*|naked|shirt off|number|instagram|snapchat|tiktok|socials?|text (your|an?)|call (your|an?)|dm|film\w*|record\w*|video|photo|selfie|outside|leave the|go to the)\b/i;

export interface BankRule {
  file: string;
  schema: z.ZodType<{ entries: ({ id: string; spice: Spice } & Record<string, unknown>)[] }>;
  /** Text fields checked for duplicates and banned words. */
  textFields: string[];
  /** Extra wording that may never appear in this bank. */
  unsafe?: RegExp;
  minimumPerSpice: number;
}

export const BANKS: BankRule[] = [
  {
    file: 'wouldYouRather.v1.json',
    schema: bankSchema(wyrEntrySchema),
    textFields: ['a', 'b'],
    minimumPerSpice: 60,
  },
  {
    file: 'liarsPrompt.v1.json',
    schema: bankSchema(liarEntrySchema),
    textFields: ['main', 'imposter'],
    minimumPerSpice: 40,
  },
  {
    file: 'secretWord.v1.json',
    schema: bankSchema(secretEntrySchema),
    textFields: ['word'],
    minimumPerSpice: 80,
  },
  {
    file: 'twoTruths.v1.json',
    schema: bankSchema(fakeFactEntrySchema),
    textFields: ['fact'],
    minimumPerSpice: 80,
  },
  {
    file: 'fakeAnswer.v1.json',
    schema: bankSchema(triviaEntrySchema),
    textFields: ['question'],
    minimumPerSpice: 50,
  },
  {
    file: 'rankIt.v1.json',
    schema: bankSchema(rankEntrySchema),
    textFields: ['prompt'],
    minimumPerSpice: 30,
  },
  {
    file: 'spinTheBottle.v1.json',
    schema: bankSchema(dareEntrySchema),
    textFields: ['dare'],
    minimumPerSpice: 40,
    unsafe: UNSAFE_DARE,
  },
  {
    file: 'fillInTheBlank.v1.json',
    schema: bankSchema(blankEntrySchema),
    textFields: ['prompt'],
    minimumPerSpice: 60,
  },
];

export interface Report {
  errors: string[];
  /** Minimum-count shortfalls (errors in strict mode). */
  short: string[];
}

function field(entry: Record<string, unknown>, f: string): string {
  const v = entry[f];
  return typeof v === 'string' ? v : '';
}

export function validateBank(rule: BankRule, json: unknown): Report {
  const errors: string[] = [];
  const short: string[] = [];
  const parsed = rule.schema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      errors: [`${rule.file}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`],
      short,
    };
  }
  const ids = new Set<string>();
  const texts = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (ids.has(entry.id)) errors.push(`${rule.file}: duplicate id ${entry.id}`);
    ids.add(entry.id);
    const text = rule.textFields
      .map((f) => field(entry, f).toLowerCase().replace(/\W+/g, ' ').trim())
      .join(' | ');
    if (texts.has(text)) errors.push(`${rule.file}: duplicate prompt ${entry.id}`);
    texts.add(text);
    for (const f of rule.textFields) {
      if (BANNED.test(field(entry, f)))
        errors.push(`${rule.file}: ${entry.id}.${f} uses banned drink wording`);
      if (rule.unsafe?.test(field(entry, f)))
        errors.push(`${rule.file}: ${entry.id}.${f} breaks the stranger-safety rules`);
    }
  }
  for (const level of SPICE_LEVELS) {
    const count = parsed.data.entries.filter((e) => e.spice === level).length;
    if (count < rule.minimumPerSpice)
      short.push(`${rule.file}: ${level} has ${count}/${rule.minimumPerSpice}`);
  }
  return { errors, short };
}

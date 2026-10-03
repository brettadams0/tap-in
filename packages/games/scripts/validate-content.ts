/**
 * Validates every prompt bank. Exits non-zero on any error.
 * Short banks are warnings unless `--strict`, which the build uses (phase 5 filled every bank).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANKS, validateBank } from '../src/validate.js';

const contentDir = join(dirname(fileURLToPath(import.meta.url)), '../../../content');
const strict = process.argv.includes('--strict');
let failed = false;
for (const rule of BANKS) {
  const json: unknown = JSON.parse(readFileSync(join(contentDir, rule.file), 'utf8'));
  const { errors, short } = validateBank(rule, json);
  for (const e of errors) console.error(`✗ ${e}`);
  for (const s of short) console[strict ? 'error' : 'warn'](`${strict ? '✗' : '!'} short: ${s}`);
  if (errors.length > 0 || (strict && short.length > 0)) failed = true;
  else console.log(`✓ ${rule.file}`);
}
if (failed) process.exit(1);

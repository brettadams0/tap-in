/**
 * Bundle gate (SPEC "Performance and quality budgets"): the JS the first page loads must stay
 * under 200 KB gzipped. Reads the built index.html, follows its module scripts and preloads, and
 * gzips each one. Lazy chunks (game screens, reactions) are reported but don't count.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = 200 * 1024;
const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = [
  ...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="\/(assets\/[^"]+\.js)"/g),
].map((m) => m[1]);
const size = (file) => gzipSync(readFileSync(join(dist, file))).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let total = 0;
for (const file of initial) {
  total += size(file);
  console.log(`initial  ${file}  ${kb(size(file))}`);
}
for (const file of readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))) {
  if (!initial.includes(`assets/${file}`))
    console.log(`lazy     assets/${file}  ${kb(size(`assets/${file}`))}`);
}
console.log(`initial JS: ${kb(total)} gzipped (budget ${kb(BUDGET)})`);
if (initial.length === 0 || total > BUDGET) {
  console.error(initial.length === 0 ? '✗ no initial script found' : '✗ over budget');
  process.exit(1);
}

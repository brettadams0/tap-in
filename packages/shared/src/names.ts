export const NAME_MAX = 12;

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function graphemes(text: string): string[] {
  return [...segmenter.segment(text)].map((s) => s.segment);
}

/** Trim, collapse whitespace, strip control chars, cap at NAME_MAX graphemes. */
export function cleanName(raw: string): string {
  const collapsed = raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim();
  return graphemes(collapsed).slice(0, NAME_MAX).join('').trim();
}

/** "Sam" → "Sam 2" → "Sam 3"…, staying within NAME_MAX graphemes. */
export function dedupeName(name: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((t) => t.toLocaleLowerCase()));
  if (!lower.has(name.toLocaleLowerCase())) return name;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const base = graphemes(name).slice(0, NAME_MAX - suffix.length).join('').trimEnd();
    const candidate = `${base}${suffix}`;
    if (!lower.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

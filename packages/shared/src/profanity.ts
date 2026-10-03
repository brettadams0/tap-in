import {
  DataSet,
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Words blocked at every spice level (DECISIONS R10): slurs and hate terms, plus "rape".
 * Everything else in the dataset is mild swearing or innuendo: masked at Chill, allowed above.
 */
const ALWAYS_BLOCKED = new Set([
  'abo',
  'abeed',
  'africoon',
  'arabush',
  'boonga',
  'chingchong',
  'chink',
  'dyke',
  'fag',
  'kike',
  'negro',
  'nigger',
  'rape',
  'retard',
  'spastic',
  'tranny',
]);

const slurMatcher = new RegExpMatcher({
  ...new DataSet<{ originalWord: string }>()
    .addAll(englishDataset)
    .removePhrasesIf((p) => !ALWAYS_BLOCKED.has(p.metadata?.originalWord ?? ''))
    .build(),
  ...englishRecommendedTransformers,
});

const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

/** True if the text contains profanity or slurs (handles leetspeak and lookalikes). */
export function isProfane(text: string): boolean {
  return matcher.hasMatch(text);
}

/** True if the text contains a slur or hate term: blocked at every spice level. */
export function hasSlur(text: string): boolean {
  return slurMatcher.hasMatch(text);
}

/** Replaces every profane word with asterisks (Chill answers). */
export function maskProfanity(text: string): string {
  return censor.applyTo(text, matcher.getAllMatches(text));
}

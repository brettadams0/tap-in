import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** True if the text contains profanity or slurs (handles leetspeak and lookalikes). */
export function isProfane(text: string): boolean {
  return matcher.hasMatch(text);
}

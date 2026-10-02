/** Cap avatar model (DESIGN.md §11). Rendering lives in the web app; this is the data contract. */

export const CAP_COLORS = [
  { id: 'red', name: 'Red', hex: '#FF4D3D' },
  { id: 'tangerine', name: 'Tangerine', hex: '#FF8A3D' },
  { id: 'peach', name: 'Peach', hex: '#FFB38A' },
  { id: 'sunflower', name: 'Sunflower', hex: '#FFB81C' },
  { id: 'lemon', name: 'Lemon', hex: '#FFEE55' },
  { id: 'volt', name: 'Volt', hex: '#D4FF3A' },
  { id: 'green', name: 'Green', hex: '#4BD866' },
  { id: 'mint', name: 'Mint', hex: '#5FE0B7' },
  { id: 'aqua', name: 'Aqua', hex: '#3ED6E0' },
  { id: 'sky', name: 'Sky', hex: '#6EC3FF' },
  { id: 'periwinkle', name: 'Periwinkle', hex: '#8FA2FF' },
  { id: 'lilac', name: 'Lilac', hex: '#C49BFF' },
  { id: 'orchid', name: 'Orchid', hex: '#E07CFF' },
  { id: 'pink', name: 'Pink', hex: '#FF5FA8' },
  { id: 'bubblegum', name: 'Bubblegum', hex: '#FFA6D2' },
  { id: 'foam', name: 'Foam', hex: '#F7ECD8' },
] as const;

export const CAP_PATTERNS = [
  'solid',
  'stripes',
  'polka',
  'checker',
  'starburst',
  'swirl',
  'split',
  'sunrays',
] as const;

export const CAP_EYES = [
  'dots',
  'hearts',
  'stars',
  'wink',
  'sleepy',
  'shades',
  'spiral',
  'side',
  'sparkle',
  'anime',
] as const;

export const CAP_MOUTHS = [
  'grin',
  'smirk',
  'tongue',
  'o',
  'fangs',
  'whistle',
  'wobbly',
  'toothy',
  'cat',
  'kiss',
] as const;

export const CAP_TOPPERS = [
  'none',
  'party',
  'crown',
  'cowboy',
  'beanie',
  'flower',
  'horns',
  'halo',
  'headphones',
  'bow',
  'chef',
  'umbrella',
] as const;

export type CapColor = (typeof CAP_COLORS)[number]['id'];
export type CapPattern = (typeof CAP_PATTERNS)[number];
export type CapEyes = (typeof CAP_EYES)[number];
export type CapMouth = (typeof CAP_MOUTHS)[number];
export type CapTopper = (typeof CAP_TOPPERS)[number];

export interface Avatar {
  color: CapColor;
  pattern: CapPattern;
  eyes: CapEyes;
  mouth: CapMouth;
  topper: CapTopper;
}

export const CAP_COLOR_IDS: readonly CapColor[] = CAP_COLORS.map((c) => c.id);

export function colorHex(id: CapColor): string {
  return CAP_COLORS.find((c) => c.id === id)?.hex ?? '#F7ECD8';
}

function pick<T>(list: readonly T[], random: () => number): T {
  const item = list[Math.floor(random() * list.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}

/** A random cap, avoiding any colours already taken in the room when possible. */
export function randomAvatar(random: () => number, takenColors: readonly CapColor[] = []): Avatar {
  const free = CAP_COLOR_IDS.filter((c) => !takenColors.includes(c));
  return {
    color: pick(free.length > 0 ? free : CAP_COLOR_IDS, random),
    pattern: pick(CAP_PATTERNS, random),
    eyes: pick(CAP_EYES, random),
    mouth: pick(CAP_MOUTHS, random),
    topper: pick(CAP_TOPPERS, random),
  };
}

/** First free colour, used when two players race for the same one. */
export function firstFreeColor(taken: readonly CapColor[]): CapColor | null {
  return CAP_COLOR_IDS.find((c) => !taken.includes(c)) ?? null;
}

/** 4-letter room codes without ambiguous letters (no I or O; no digits at all). */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

const BLOCKED = new Set([
  'ANAL',
  'ANUS',
  'ARSE',
  'CLIT',
  'COCK',
  'COON',
  'CRAP',
  'CUNT',
  'DAMN',
  'DICK',
  'DYKE',
  'FAGS',
  'FUCK',
  'FUCX',
  'FUKK',
  'GOOK',
  'HELL',
  'JERK',
  'JIZZ',
  'KIKE',
  'KUNT',
  'NAZI',
  'NUDE',
  'PAKI',
  'PISS',
  'PORN',
  'PUSS',
  'RAPE',
  'SCUM',
  'SEXY',
  'SHAT',
  'SHIT',
  'SLAG',
  'SLUT',
  'SPAZ',
  'SPIC',
  'SUCK',
  'TITS',
  'TWAT',
  'WANK',
  'WHORE',
  'XXXX',
]);

export function isValidCode(code: string): boolean {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code);
}

export function normalizeCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, CODE_LENGTH);
}

export function isBlockedCode(code: string): boolean {
  return BLOCKED.has(code);
}

/** `random` returns a float in [0, 1). Retries until the code is clean. */
export function generateRoomCode(random: () => number): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET.charAt(Math.floor(random() * CODE_ALPHABET.length));
    }
    if (!isBlockedCode(code)) return code;
  }
}

/** Runtime validation for every client → server message (server only). */
import { z } from 'zod';
import { CAP_COLOR_IDS, CAP_EYES, CAP_MOUTHS, CAP_PATTERNS, CAP_TOPPERS } from './avatar.js';
import { GAME_IDS, SESSION_LENGTHS, SPICE_LEVELS } from './settings.js';
import type { ClientMessage } from './protocol.js';

export const MAX_MESSAGE_BYTES = 4096;

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const avatarSchema = z.strictObject({
  color: z.enum(CAP_COLOR_IDS as [string, ...string[]]),
  pattern: z.enum(CAP_PATTERNS),
  eyes: z.enum(CAP_EYES),
  mouth: z.enum(CAP_MOUTHS),
  topper: z.enum(CAP_TOPPERS),
});

export const settingsPatchSchema = z
  .strictObject({
    spice: z.enum(SPICE_LEVELS),
    length: z.enum(SESSION_LENGTHS),
    games: z.array(z.enum(GAME_IDS)).max(GAME_IDS.length),
    reactions: z.boolean(),
  })
  .partial();

const hostActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('settings'), settings: settingsPatchSchema }),
  z.strictObject({ kind: z.literal('start') }),
  z.strictObject({ kind: z.literal('remove'), playerId: id }),
  z.strictObject({ kind: z.literal('resolveClaim'), claimId: id, approve: z.boolean() }),
]);

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('join'), name: z.string().max(64), avatar: avatarSchema }),
  z.strictObject({ type: z.literal('rejoin'), playerId: id, token: z.string().min(16).max(128) }),
  z.strictObject({ type: z.literal('claim'), playerId: id }),
  z.strictObject({ type: z.literal('avatar'), avatar: avatarSchema }),
  z.strictObject({ type: z.literal('hostAction'), action: hostActionSchema }),
  z.strictObject({ type: z.literal('ping'), t0: z.number().finite() }),
  z.strictObject({ type: z.literal('resync') }),
  z.strictObject({ type: z.literal('leave') }),
]);

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; reason: string };

/** Parse a raw socket frame. Never throws. */
export function parseClientMessage(raw: unknown): ParseResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'binary frames are not supported' };
  if (raw.length > MAX_MESSAGE_BYTES) return { ok: false, reason: 'message too large' };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid JSON' };
  }
  const result = clientMessageSchema.safeParse(json);
  if (!result.success) return { ok: false, reason: result.error.issues[0]?.message ?? 'invalid' };
  return { ok: true, message: result.data as ClientMessage };
}

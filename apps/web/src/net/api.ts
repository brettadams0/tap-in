import type { RoomStatus } from '@tap-in/shared';
import { SERVER_URL } from './config.js';

export async function createRoom(): Promise<string> {
  const res = await fetch(`${SERVER_URL}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`Could not create a room (${res.status})`);
  return ((await res.json()) as { code: string }).code;
}

export async function roomStatus(code: string): Promise<RoomStatus> {
  const res = await fetch(`${SERVER_URL}/rooms/${code}`);
  if (!res.ok) throw new Error(`Status failed (${res.status})`);
  return (await res.json()) as RoomStatus;
}

import type { RoomStatus } from '@tap-in/shared';
import { SERVER_URL } from './config.js';

export async function createRoom(): Promise<string> {
  // e2e only: the Node test server honours ?roundsPerGame= and ?timeScale= (the Worker ignores them).
  const page = new URLSearchParams(location.search);
  const hooks = new URLSearchParams();
  for (const key of ['roundsPerGame', 'timeScale']) {
    const value = page.get(key);
    if (value) hooks.set(key, value);
  }
  const query = hooks.toString() ? `?${hooks.toString()}` : '';
  const res = await fetch(`${SERVER_URL}/rooms${query}`, { method: 'POST' });
  if (!res.ok) throw new Error(`Could not create a room (${res.status})`);
  return ((await res.json()) as { code: string }).code;
}

export async function roomStatus(code: string): Promise<RoomStatus> {
  const res = await fetch(`${SERVER_URL}/rooms/${code}`);
  if (!res.ok) throw new Error(`Status failed (${res.status})`);
  return (await res.json()) as RoomStatus;
}

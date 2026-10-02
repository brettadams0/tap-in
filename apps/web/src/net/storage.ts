/** localStorage can throw (private mode, blocked storage): every access is guarded. */
import type { Avatar } from '@tap-in/shared';

export interface Session {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface Profile {
  name: string;
  avatar: Avatar | null;
}

const SESSION_KEY = 'tapin:session';
const PROFILE_KEY = 'tapin:profile';

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the game still works, rejoin just won't be automatic
  }
}

export const loadSession = (): Session | null => read(SESSION_KEY) as Session | null;
export const saveSession = (s: Session | null): void => {
  write(SESSION_KEY, s);
};
export const loadProfile = (): Profile =>
  (read(PROFILE_KEY) as Profile | null) ?? { name: '', avatar: null };
export const saveProfile = (p: Profile): void => {
  write(PROFILE_KEY, p);
};

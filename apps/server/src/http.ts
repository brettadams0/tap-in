/** Routing + CORS shared by the Worker and the Node adapter. */
import { isValidCode } from '@tap-in/shared';

export type Route =
  | { kind: 'health' }
  | { kind: 'create' }
  | { kind: 'status'; code: string }
  | { kind: 'socket'; code: string }
  | { kind: 'preflight' }
  | { kind: 'notFound' };

export function route(method: string, pathname: string): Route {
  if (method === 'OPTIONS') return { kind: 'preflight' };
  if (pathname === '/healthz') return { kind: 'health' };
  if (pathname === '/rooms' && method === 'POST') return { kind: 'create' };
  const m = /^\/rooms\/([A-Za-z]{4})(\/ws)?$/.exec(pathname);
  if (m?.[1] && method === 'GET') {
    const code = m[1].toUpperCase();
    if (!isValidCode(code)) return { kind: 'notFound' };
    return m[2] ? { kind: 'socket', code } : { kind: 'status', code };
  }
  return { kind: 'notFound' };
}

/** `allowed` is a comma-separated list; "*" allows any origin (dev only). */
export function corsHeaders(origin: string | null, allowed: string): Record<string, string> {
  const list = allowed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const ok =
    origin !== null &&
    (list.includes('*') || list.includes(origin) || isPreviewOrigin(origin, list));
  return ok
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };
}

/** Vercel preview deploys: allow https://tap-in-*.vercel.app when https://tap-in.vercel.app is allowed. */
function isPreviewOrigin(origin: string, list: string[]): boolean {
  return (
    list.includes('https://tap-in.vercel.app') &&
    /^https:\/\/tap-in-[a-z0-9-]+\.vercel\.app$/.test(origin)
  );
}

export function isOriginAllowed(origin: string | null, allowed: string): boolean {
  // Non-browser clients (tests, curl) send no Origin; browsers always do.
  if (origin === null) return true;
  return 'Access-Control-Allow-Origin' in corsHeaders(origin, allowed);
}

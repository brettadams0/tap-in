/** Room server base URL. Set VITE_SERVER_URL in Vercel (see README). */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') ??
  `${location.protocol}//${location.hostname}:8787`;

export function socketUrl(code: string): string {
  return `${SERVER_URL.replace(/^http/, 'ws')}/rooms/${code}/ws`;
}

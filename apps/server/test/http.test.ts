import { describe, expect, it } from 'vitest';
import { corsHeaders, isOriginAllowed, route } from '../src/http.js';

describe('routing', () => {
  it('maps paths to routes', () => {
    expect(route('GET', '/healthz')).toEqual({ kind: 'health' });
    expect(route('POST', '/rooms')).toEqual({ kind: 'create' });
    expect(route('GET', '/rooms/kzrp')).toEqual({ kind: 'status', code: 'KZRP' });
    expect(route('GET', '/rooms/KZRP/ws')).toEqual({ kind: 'socket', code: 'KZRP' });
    expect(route('GET', '/rooms/KZRO')).toEqual({ kind: 'notFound' });
    expect(route('DELETE', '/rooms/KZRP')).toEqual({ kind: 'notFound' });
    expect(route('OPTIONS', '/anything')).toEqual({ kind: 'preflight' });
  });
});

describe('cors', () => {
  const allowed = 'https://tap-in.vercel.app,http://localhost:5173';
  it('allows listed origins and Vercel previews only', () => {
    expect(corsHeaders('https://tap-in.vercel.app', allowed)['Access-Control-Allow-Origin']).toBe(
      'https://tap-in.vercel.app',
    );
    expect(isOriginAllowed('https://tap-in-git-feature-brett.vercel.app', allowed)).toBe(true);
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
    expect(isOriginAllowed('https://tap-in.vercel.app.evil.example', allowed)).toBe(false);
    expect(isOriginAllowed(null, allowed)).toBe(true);
    expect(isOriginAllowed('https://anything.example', '*')).toBe(true);
  });
});

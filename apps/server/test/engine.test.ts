import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '@tap-in/shared';
import { CLAIM_TIMEOUT_MS, GONE_AFTER_MS, HOST_TRANSFER_MS, ROOM_EXPIRY_MS } from '../src/engine/state.js';
import { avatar, Harness, type FakeClient } from './harness.js';

function lobbyOf(n: number): { h: Harness; players: FakeClient[] } {
  const h = new Harness();
  const colors = ['red', 'sky', 'green', 'pink', 'lemon', 'mint', 'aqua', 'lilac', 'peach'] as const;
  const players = Array.from({ length: n }, (_, i) => h.join(`P${i + 1}`, colors[i]));
  return { h, players };
}

describe('lobby join', () => {
  it('welcomes a new socket with joinable room info', () => {
    const h = new Harness();
    const c = h.connect();
    const w = c.last('welcome');
    expect(w?.info).toMatchObject({ code: 'KZRP', phase: 'lobby', joinable: true, full: false, takenColors: [] });
  });

  it('first joiner becomes host and everyone sees everyone', () => {
    const { players } = lobbyOf(3);
    const [a, b, c] = players as [FakeClient, FakeClient, FakeClient];
    expect(a.view?.hostId).toBe(a.playerId);
    for (const p of players) {
      expect(p.view?.players.map((x) => x.name)).toEqual(['P1', 'P2', 'P3']);
      expect(p.view?.you.id).toBe(p.playerId);
    }
    expect(b.view?.players.every((p) => p.presence === 'connected')).toBe(true);
    expect(c.token).toBeTruthy();
  });

  it('cleans, de-duplicates and filters names', () => {
    const h = new Harness();
    h.join('  Sam  ');
    const two = h.join('sam', 'sky');
    expect(two.view?.players.map((p) => p.name)).toEqual(['Sam', 'sam 2']);
    const rude = h.join('fuck', 'green');
    expect(rude.errors()).toContain('NAME_REJECTED');
    const empty = h.join('   ', 'green');
    expect(empty.errors()).toContain('NAME_REJECTED');
  });

  it('gives a free colour when two players race for the same one', () => {
    const h = new Harness();
    h.join('A', 'red');
    const b = h.join('B', 'red');
    const colors = b.view?.players.map((p) => p.avatar.color);
    expect(new Set(colors).size).toBe(2);
    expect(h.connect().last('welcome')?.info.takenColors).toHaveLength(2);
  });

  it('caps the room at 8 players', () => {
    const { h } = lobbyOf(8);
    const ninth = h.join('Nine', 'peach');
    expect(ninth.errors()).toContain('ROOM_FULL');
    expect(h.connect().last('welcome')?.info.full).toBe(true);
  });

  it('rejects a second join from the same socket', () => {
    const h = new Harness();
    const a = h.join('A');
    a.send({ type: 'join', name: 'Again', avatar: avatar('sky') });
    expect(a.errors()).toContain('ALREADY_JOINED');
  });
});

describe('validation and limits', () => {
  it('rejects malformed messages and identity-less actions', () => {
    const h = new Harness();
    const c = h.connect();
    c.send('{nope');
    c.send({ type: 'hostAction', action: { kind: 'start' } });
    expect(c.errors()).toEqual(['BAD_MESSAGE', 'NOT_JOINED']);
  });

  it('answers pings with server time', () => {
    const h = new Harness();
    const c = h.connect();
    c.send({ type: 'ping', t0: 42 });
    expect(c.last('pong')).toEqual({ type: 'pong', t0: 42, serverTime: h.time });
  });

  it('rate-limits floods without crashing', () => {
    const h = new Harness();
    const c = h.connect();
    for (let i = 0; i < 100; i++) c.send({ type: 'ping', t0: i });
    expect(c.errors()).toContain('RATE_LIMITED');
    expect(c.inbox.filter((m) => m.type === 'pong').length).toBeLessThanOrEqual(40);
    h.advance(5_000);
    c.send({ type: 'ping', t0: 1 });
    expect(c.last('pong')?.t0).toBe(1);
  });
});

describe('host controls', () => {
  it('only the host changes settings; settings stay valid', () => {
    const { players } = lobbyOf(2);
    const [host, guest] = players as [FakeClient, FakeClient];
    guest.send({ type: 'hostAction', action: { kind: 'settings', settings: { spice: 'unhinged' } } });
    expect(guest.errors()).toContain('NOT_HOST');
    host.send({ type: 'hostAction', action: { kind: 'settings', settings: { spice: 'spicy', games: ['tapRace', 'tapRace', 'countdown'] } } });
    expect(guest.view?.settings).toMatchObject({ spice: 'spicy', games: ['tapRace', 'countdown'] });
    host.send({ type: 'hostAction', action: { kind: 'settings', settings: { games: ['tapRace'] } } });
    expect(host.errors()).toContain('NOT_ALLOWED');
  });

  it('start needs 3 connected players, then locks the lobby', () => {
    const { h, players } = lobbyOf(2);
    const host = players[0] as FakeClient;
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    expect(host.errors()).toContain('NOT_ENOUGH_PLAYERS');
    h.join('P3', 'green');
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    expect(host.view?.phase).toBe('intro');
    const late = h.join('Late', 'lemon');
    expect(late.errors()).toContain('LOBBY_LOCKED');
    expect(late.inbox.find((m) => m.type === 'welcome')).toMatchObject({ info: { joinable: false } });
    host.send({ type: 'hostAction', action: { kind: 'settings', settings: { spice: 'spicy' } } });
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    expect(host.errors().filter((e) => e === 'NOT_ALLOWED')).toHaveLength(2);
  });

  it('removes a player: lobby frees the seat, mid-game ends their session', () => {
    const { h, players } = lobbyOf(4);
    const [host, b, c] = players as [FakeClient, FakeClient, FakeClient];
    host.send({ type: 'hostAction', action: { kind: 'remove', playerId: host.playerId ?? '' } });
    expect(host.errors()).toContain('NOT_ALLOWED');
    host.send({ type: 'hostAction', action: { kind: 'remove', playerId: 'p_nobody' } });
    expect(host.errors()).toContain('UNKNOWN_PLAYER');
    host.send({ type: 'hostAction', action: { kind: 'remove', playerId: b.playerId ?? '' } });
    expect(b.last('sessionEnded')?.reason).toBe('removed');
    expect(b.closed).not.toBeNull();
    expect(host.view?.players).toHaveLength(3);
    expect(h.engine.snapshot.players).toHaveLength(3);
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    host.send({ type: 'hostAction', action: { kind: 'remove', playerId: c.playerId ?? '' } });
    expect(c.last('sessionEnded')?.reason).toBe('removed');
    expect(host.view?.players.map((p) => p.name)).toEqual(['P1', 'P4']);
    // A removed player can never come back with their old token.
    const back = h.connect();
    back.send({ type: 'rejoin', playerId: c.playerId ?? '', token: c.token ?? '' });
    expect(back.errors()).toContain('BAD_TOKEN');
  });

  it('only shows pending claims to the host', () => {
    const { h, players } = lobbyOf(3);
    const [host, b, c] = players as [FakeClient, FakeClient, FakeClient];
    c.disconnect();
    h.connect().send({ type: 'claim', playerId: c.playerId ?? '' });
    expect(host.view?.claims).toHaveLength(1);
    expect(b.view?.claims).toHaveLength(0);
  });
});

describe('rejoin and presence', () => {
  it('rejoins with a token into the same seat and view', () => {
    const { h, players } = lobbyOf(3);
    const b = players[1] as FakeClient;
    b.disconnect();
    expect(players[0]?.view?.players[1]?.presence).toBe('reconnecting');
    const again = h.connect();
    again.send({ type: 'rejoin', playerId: b.playerId ?? '', token: b.token ?? '' });
    expect(again.view?.you.id).toBe(b.playerId);
    expect(players[0]?.view?.players[1]?.presence).toBe('connected');
  });

  it('rejects a wrong token', () => {
    const { h, players } = lobbyOf(1);
    const c = h.connect();
    c.send({ type: 'rejoin', playerId: players[0]?.playerId ?? '', token: 'x'.repeat(32) });
    expect(c.errors()).toEqual(['BAD_TOKEN']);
  });

  it('a newer tab replaces an older one for the same player', () => {
    const { h, players } = lobbyOf(1);
    const a = players[0] as FakeClient;
    const tab2 = h.connect();
    tab2.send({ type: 'rejoin', playerId: a.playerId ?? '', token: a.token ?? '' });
    expect(a.closed?.reason).toBe('replaced');
    expect(tab2.view?.players[0]?.presence).toBe('connected');
  });

  it('marks players gone after 3 minutes and back when they return', () => {
    const { h, players } = lobbyOf(3);
    const c = players[2] as FakeClient;
    c.disconnect();
    h.advance(GONE_AFTER_MS - 1);
    expect(players[0]?.view?.players[2]?.presence).toBe('reconnecting');
    h.advance(1);
    expect(players[0]?.view?.players[2]?.presence).toBe('gone');
    const back = h.connect();
    back.send({ type: 'rejoin', playerId: c.playerId ?? '', token: c.token ?? '' });
    expect(players[0]?.view?.players[2]?.presence).toBe('connected');
  });

  it('passes host to the longest-connected player after 30 s', () => {
    const { h, players } = lobbyOf(4);
    const [host, b, c] = players as [FakeClient, FakeClient, FakeClient];
    // c reconnects, so b has been connected the longest.
    c.disconnect();
    h.advance(1000);
    h.connect().send({ type: 'rejoin', playerId: c.playerId ?? '', token: c.token ?? '' });
    host.disconnect();
    h.advance(HOST_TRANSFER_MS - 1);
    expect(b.view?.hostId).toBe(host.playerId);
    h.advance(1);
    expect(b.view?.hostId).toBe(b.playerId);
    expect(b.view?.players.find((p) => p.id === b.playerId)?.isHost).toBe(true);
  });

  it('hands host over on reconnect if the host has been gone past 30 s', () => {
    const { h, players } = lobbyOf(3);
    const [host, b, c] = players as [FakeClient, FakeClient, FakeClient];
    b.disconnect();
    c.disconnect();
    host.disconnect();
    h.advance(HOST_TRANSFER_MS + 5_000);
    const back = h.connect();
    back.send({ type: 'rejoin', playerId: c.playerId ?? '', token: c.token ?? '' });
    expect(back.view?.hostId).toBe(c.playerId);
  });

  it('host leaving hands over immediately', () => {
    const { players } = lobbyOf(3);
    const [host, b] = players as [FakeClient, FakeClient];
    host.send({ type: 'leave' });
    expect(host.last('sessionEnded')?.reason).toBe('left');
    expect(b.view?.hostId).toBe(b.playerId);
    expect(b.view?.players).toHaveLength(2);
  });
});

describe('claiming a seat', () => {
  function startedRoom() {
    const { h, players } = lobbyOf(4);
    (players[0] as FakeClient).send({ type: 'hostAction', action: { kind: 'start' } });
    return { h, players: players as [FakeClient, FakeClient, FakeClient, FakeClient] };
  }

  it('lists disconnected seats and lets the host approve a claim', () => {
    const { h, players } = startedRoom();
    const [host, lost] = players;
    lost.disconnect();
    const phone = h.connect();
    expect(phone.last('welcome')?.info.claimable.map((s) => s.name)).toEqual(['P2']);
    phone.send({ type: 'claim', playerId: lost.playerId ?? '' });
    expect(phone.last('claimPending')).toBeTruthy();
    const claimId = host.view?.claims[0]?.claimId ?? '';
    host.send({ type: 'hostAction', action: { kind: 'resolveClaim', claimId, approve: true } });
    expect(phone.playerId).toBe(lost.playerId);
    expect(phone.token).not.toBe(lost.token);
    expect(phone.view?.phase).toBe('intro');
    expect(host.view?.claims).toHaveLength(0);
    // The lost device's old token is dead.
    const old = h.connect();
    old.send({ type: 'rejoin', playerId: lost.playerId ?? '', token: lost.token ?? '' });
    expect(old.errors()).toContain('BAD_TOKEN');
  });

  it('denies, replaces and times out claims', () => {
    const { h, players } = startedRoom();
    const [host, , lost] = players;
    lost.disconnect();
    const first = h.connect();
    first.send({ type: 'claim', playerId: lost.playerId ?? '' });
    const second = h.connect();
    second.send({ type: 'claim', playerId: lost.playerId ?? '' });
    expect(first.last('claimDenied')).toBeTruthy();
    host.send({ type: 'hostAction', action: { kind: 'resolveClaim', claimId: host.view?.claims[0]?.claimId ?? '', approve: false } });
    expect(second.last('claimDenied')).toBeTruthy();
    const third = h.connect();
    third.send({ type: 'claim', playerId: lost.playerId ?? '' });
    h.advance(CLAIM_TIMEOUT_MS);
    expect(third.last('claimDenied')).toBeTruthy();
    expect(host.view?.claims).toHaveLength(0);
  });

  it('cannot claim someone who is still connected, or an unknown seat', () => {
    const { h, players } = startedRoom();
    const c = h.connect();
    c.send({ type: 'claim', playerId: players[1].playerId ?? '' });
    c.send({ type: 'claim', playerId: 'p_ghost' });
    expect(c.errors()).toEqual(['NOT_ALLOWED', 'UNKNOWN_PLAYER']);
  });

  it('auto-approves when nobody is around to approve', () => {
    const { h, players } = startedRoom();
    for (const p of players) p.disconnect();
    const c = h.connect();
    c.send({ type: 'claim', playerId: players[2].playerId ?? '' });
    expect(c.playerId).toBe(players[2].playerId);
    h.advance(HOST_TRANSFER_MS);
    expect(c.view?.hostId).toBe(players[2].playerId);
  });

  it('drops a claim if the claimant disconnects', () => {
    const { h, players } = startedRoom();
    players[3].disconnect();
    const c = h.connect();
    c.send({ type: 'claim', playerId: players[3].playerId ?? '' });
    expect(players[0].view?.claims).toHaveLength(1);
    c.disconnect();
    expect(players[0].view?.claims).toHaveLength(0);
  });
});

describe('avatars', () => {
  it('can change cap in the lobby but not to a taken colour, and not mid-game', () => {
    const { players } = lobbyOf(3);
    const [a, b] = players as [FakeClient, FakeClient];
    a.send({ type: 'avatar', avatar: { ...avatar('sky'), topper: 'crown' } });
    expect(a.errors()).toContain('COLOR_TAKEN');
    a.send({ type: 'avatar', avatar: { ...avatar('orchid'), topper: 'crown' } });
    expect(b.view?.players[0]?.avatar).toMatchObject({ color: 'orchid', topper: 'crown' });
    a.send({ type: 'hostAction', action: { kind: 'start' } });
    a.send({ type: 'avatar', avatar: avatar('volt') });
    expect(a.errors()).toContain('NOT_ALLOWED');
  });
});

describe('expiry and persistence', () => {
  it('persists state and expires 30 min after everyone leaves', () => {
    const { h, players } = lobbyOf(2);
    expect(h.saved?.players).toHaveLength(2);
    for (const p of players) p.disconnect();
    h.advance(ROOM_EXPIRY_MS - 1);
    expect(h.destroyed).toBe(false);
    h.advance(1);
    expect(h.destroyed).toBe(true);
    const late = h.connect();
    expect(late.errors()).toEqual(['ROOM_ENDED']);
  });

  it('an untouched new room expires too', () => {
    const h = new Harness();
    h.connect().send({ type: 'ping', t0: 0 });
    // No commit happened yet, so arm the alarm the way the adapter does on create.
    h.alarmAt = h.time + ROOM_EXPIRY_MS;
    h.advance(ROOM_EXPIRY_MS);
    expect(h.destroyed).toBe(true);
  });

  it('a reconnect cancels the expiry', () => {
    const { h, players } = lobbyOf(1);
    const a = players[0] as FakeClient;
    a.disconnect();
    h.advance(ROOM_EXPIRY_MS / 2);
    h.connect().send({ type: 'rejoin', playerId: a.playerId ?? '', token: a.token ?? '' });
    h.advance(ROOM_EXPIRY_MS);
    expect(h.destroyed).toBe(false);
  });
});

describe('views and patches', () => {
  it('patched client views always equal the server view', () => {
    const { h, players } = lobbyOf(5);
    const host = players[0] as FakeClient;
    host.send({ type: 'hostAction', action: { kind: 'settings', settings: { games: [...GAME_IDS].slice(0, 4) } } });
    players[3]?.disconnect();
    h.advance(GONE_AFTER_MS);
    host.send({ type: 'hostAction', action: { kind: 'start' } });
    for (const p of players.filter((x) => x !== players[3])) {
      expect(p.view).toEqual(h.engine.viewFor(p.playerId ?? ''));
    }
  });

  it('resync sends a fresh full state', () => {
    const { players } = lobbyOf(1);
    const a = players[0] as FakeClient;
    const before = a.inbox.filter((m) => m.type === 'state').length;
    a.send({ type: 'resync' });
    expect(a.inbox.filter((m) => m.type === 'state').length).toBe(before + 1);
  });
});

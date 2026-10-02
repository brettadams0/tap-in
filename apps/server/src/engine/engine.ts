/**
 * RoomEngine: the single authority for one room (PLAN.md §3).
 * Host-agnostic: the Durable Object and the Node adapter both drive it through
 * connect / message / disconnect / alarm, and it talks back through EngineDeps.
 */
import {
  cleanName,
  dedupeName,
  diff,
  firstFreeColor,
  MAX_PLAYERS,
  MIN_ENABLED_GAMES,
  MIN_PLAYERS,
  PROTOCOL_VERSION,
  type Avatar,
  type ClientMessage,
  type EndReason,
  type ErrorCode,
  type HostAction,
  type PlayerId,
  type PlayerView,
  type RoomView,
  type ServerMessage,
  type WelcomeInfo,
} from '@tap-in/shared';
import { isProfane, parseClientMessage } from '@tap-in/shared/server';
import { TokenBucket } from './rateLimit.js';
import {
  CLAIM_TIMEOUT_MS,
  GONE_AFTER_MS,
  HOST_TRANSFER_MS,
  ROOM_EXPIRY_MS,
  type PlayerRecord,
  type RoomState,
} from './state.js';

export interface EngineDeps {
  now(): number;
  /** Cryptographically random id, URL-safe. */
  randomId(bytes: number): string;
  send(connId: string, msg: ServerMessage): void;
  close(connId: string, code: number, reason: string): void;
  /** Point the single wake-up alarm at `at` (or clear it). */
  setAlarm(at: number | null): void;
  save(state: RoomState): void;
  /** The room expired: wipe persisted state (typed answers must not outlive the room). */
  destroy(): void;
}

interface Conn {
  playerId: PlayerId | null;
  bucket: TokenBucket;
  last: { version: number; view: RoomView } | null;
  lastRateError: number;
}

export const CLOSE_ENDED = 4000;

export class RoomEngine {
  private readonly conns = new Map<string, Conn>();
  private dirty = false;

  constructor(
    private state: RoomState,
    private readonly deps: EngineDeps,
  ) {}

  get snapshot(): Readonly<RoomState> {
    return this.state;
  }

  /** Which player a socket speaks for (adapters persist this across hibernation). */
  playerOf(connId: string): PlayerId | null {
    return this.conns.get(connId)?.playerId ?? null;
  }

  // ---------------------------------------------------------------- transport events

  connect(connId: string): void {
    if (this.state.ended) {
      this.deps.send(connId, { type: 'error', code: 'ROOM_ENDED', message: 'This room has ended.' });
      this.deps.close(connId, CLOSE_ENDED, 'ended');
      return;
    }
    this.conns.set(connId, this.newConn(null));
    this.deps.send(connId, { type: 'welcome', info: this.welcomeInfo(), serverTime: this.deps.now() });
  }

  /** Re-attach a socket that survived hibernation. */
  restore(connId: string, playerId: PlayerId | null): void {
    this.conns.set(connId, this.newConn(playerId));
  }

  disconnect(connId: string): void {
    const conn = this.conns.get(connId);
    if (!conn) return;
    this.conns.delete(connId);
    const before = this.state.claims.length;
    this.state.claims = this.state.claims.filter((c) => c.connId !== connId);
    if (this.state.claims.length !== before) this.touch();
    if (conn.playerId) this.markDisconnected(conn.playerId);
    this.commit();
  }

  message(connId: string, raw: unknown): void {
    const conn = this.conns.get(connId);
    if (!conn) return;
    const now = this.deps.now();
    if (!conn.bucket.take(now)) {
      if (now - conn.lastRateError > 1000) {
        conn.lastRateError = now;
        this.error(connId, 'RATE_LIMITED', 'Slow down!');
      }
      return;
    }
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.error(connId, 'BAD_MESSAGE', parsed.reason);
      return;
    }
    this.handle(connId, conn, parsed.message);
    this.commit();
  }

  alarm(): void {
    const now = this.deps.now();
    for (const p of this.state.players) {
      if (p.status === 'active' && !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= GONE_AFTER_MS) {
        p.status = 'gone';
        this.touch();
      }
    }
    const host = this.player(this.state.hostId);
    if (host && !host.connected && host.disconnectedAt !== null && now - host.disconnectedAt >= HOST_TRANSFER_MS) {
      this.transferHost();
    }
    for (const claim of this.state.claims.filter((c) => now - c.at >= CLAIM_TIMEOUT_MS)) {
      this.resolveClaim(claim.claimId, false);
    }
    if (this.state.emptySince !== null && now - this.state.emptySince >= ROOM_EXPIRY_MS) {
      this.expire();
      return;
    }
    if (!this.dirty) this.deps.setAlarm(this.nextAlarm());
    this.commit();
  }

  // ---------------------------------------------------------------- message handling

  private handle(connId: string, conn: Conn, msg: ClientMessage): void {
    switch (msg.type) {
      case 'ping':
        this.deps.send(connId, { type: 'pong', t0: msg.t0, serverTime: this.deps.now() });
        return;
      case 'join':
        this.join(connId, conn, msg.name, msg.avatar);
        return;
      case 'rejoin':
        this.rejoin(connId, conn, msg.playerId, msg.token);
        return;
      case 'claim':
        this.claim(connId, conn, msg.playerId);
        return;
      case 'resync':
        conn.last = null;
        this.sendView(connId, conn);
        return;
    }
    // Everything below needs an identity.
    const me = this.player(conn.playerId);
    if (!me) {
      this.error(connId, 'NOT_JOINED', 'Join the room first.');
      return;
    }
    switch (msg.type) {
      case 'avatar':
        this.setAvatar(connId, me, msg.avatar);
        return;
      case 'hostAction':
        if (this.state.hostId !== me.id) {
          this.error(connId, 'NOT_HOST', 'Only the host can do that.');
          return;
        }
        this.hostAction(connId, me, msg.action);
        return;
      case 'leave':
        this.removePlayer(me.id, 'left');
        return;
    }
  }

  private join(connId: string, conn: Conn, rawName: string, avatar: Avatar): void {
    if (conn.playerId) return this.error(connId, 'ALREADY_JOINED', 'You are already in.');
    if (this.state.phase !== 'lobby') {
      return this.error(connId, 'LOBBY_LOCKED', 'This game already started. Only existing players can get back in.');
    }
    const seated = this.seated();
    if (seated.length >= MAX_PLAYERS) return this.error(connId, 'ROOM_FULL', 'This room is full (8 players).');
    const cleaned = cleanName(rawName);
    if (cleaned.length === 0) return this.error(connId, 'NAME_REJECTED', 'Enter a name.');
    if (isProfane(cleaned)) return this.error(connId, 'NAME_REJECTED', 'Pick a different name.');
    const name = dedupeName(cleaned, seated.map((p) => p.name));
    const taken = seated.map((p) => p.avatar.color);
    const color = taken.includes(avatar.color) ? firstFreeColor(taken) : avatar.color;
    const now = this.deps.now();
    const player: PlayerRecord = {
      id: `p_${this.deps.randomId(9)}`,
      name,
      avatar: { ...avatar, color: color ?? avatar.color },
      token: this.deps.randomId(24),
      seat: this.state.nextSeat++,
      joinedAt: now,
      connected: true,
      connectedSince: now,
      disconnectedAt: null,
      status: 'active',
    };
    this.state.players.push(player);
    this.state.hostId ??= player.id;
    this.state.emptySince = null;
    conn.playerId = player.id;
    this.deps.send(connId, { type: 'credentials', code: this.state.code, playerId: player.id, token: player.token });
    this.touch();
  }

  private rejoin(connId: string, conn: Conn, playerId: PlayerId, token: string): void {
    const player = this.player(playerId);
    if (!player || player.status === 'removed' || !safeEqual(player.token, token)) {
      return this.error(connId, 'BAD_TOKEN', 'That seat is no longer yours.');
    }
    // A newer tab wins: retire any older socket bound to the same player.
    for (const [otherId, other] of this.conns) {
      if (otherId !== connId && other.playerId === playerId) {
        this.conns.delete(otherId);
        this.deps.close(otherId, CLOSE_ENDED, 'replaced');
      }
    }
    conn.playerId = playerId;
    conn.last = null;
    this.markConnected(player);
    this.touch();
  }

  private claim(connId: string, conn: Conn, playerId: PlayerId): void {
    if (conn.playerId) return this.error(connId, 'ALREADY_JOINED', 'You are already in.');
    const player = this.player(playerId);
    if (!player || player.status === 'removed') return this.error(connId, 'UNKNOWN_PLAYER', 'No such player.');
    if (player.connected) return this.error(connId, 'NOT_ALLOWED', `${player.name} is still connected.`);
    // One pending claim per seat: a newer claim replaces the older one.
    for (const old of this.state.claims.filter((c) => c.playerId === playerId)) {
      this.deps.send(old.connId, { type: 'claimDenied', playerId });
    }
    this.state.claims = this.state.claims.filter((c) => c.playerId !== playerId);
    const claim = { claimId: `c_${this.deps.randomId(6)}`, playerId, connId, at: this.deps.now() };
    this.state.claims.push(claim);
    this.deps.send(connId, { type: 'claimPending', playerId });
    // Nobody is around to approve: let them straight back in.
    if (!this.state.players.some((p) => p.connected)) {
      this.resolveClaim(claim.claimId, true);
      return;
    }
    this.touch();
  }

  private resolveClaim(claimId: string, approve: boolean): void {
    const claim = this.state.claims.find((c) => c.claimId === claimId);
    if (!claim) return;
    this.state.claims = this.state.claims.filter((c) => c.claimId !== claimId);
    this.touch();
    const player = this.player(claim.playerId);
    const conn = this.conns.get(claim.connId);
    if (!approve || !player || player.status === 'removed' || !conn || conn.playerId) {
      this.deps.send(claim.connId, { type: 'claimDenied', playerId: claim.playerId });
      return;
    }
    // Rotate the token so the lost device can never come back as this player.
    player.token = this.deps.randomId(24);
    for (const [otherId, other] of this.conns) {
      if (other.playerId === player.id) {
        this.conns.delete(otherId);
        this.endSession(otherId, 'claimed');
      }
    }
    conn.playerId = player.id;
    conn.last = null;
    this.deps.send(claim.connId, { type: 'credentials', code: this.state.code, playerId: player.id, token: player.token });
    this.markConnected(player);
  }

  private setAvatar(connId: string, me: PlayerRecord, avatar: Avatar): void {
    if (this.state.phase !== 'lobby' && this.state.phase !== 'results') {
      return this.error(connId, 'NOT_ALLOWED', 'You can change your cap in the lobby.');
    }
    const takenByOther = this.seated().some((p) => p.id !== me.id && p.avatar.color === avatar.color);
    if (takenByOther) return this.error(connId, 'COLOR_TAKEN', 'Someone already has that colour.');
    me.avatar = avatar;
    this.touch();
  }

  private hostAction(connId: string, me: PlayerRecord, action: HostAction): void {
    switch (action.kind) {
      case 'settings': {
        if (this.state.phase !== 'lobby') return this.error(connId, 'NOT_ALLOWED', 'Settings are locked once the game starts.');
        const next = { ...this.state.settings, ...action.settings };
        next.games = [...new Set(next.games)];
        if (next.games.length < MIN_ENABLED_GAMES) {
          return this.error(connId, 'NOT_ALLOWED', `Keep at least ${MIN_ENABLED_GAMES} games on.`);
        }
        this.state.settings = next;
        this.touch();
        return;
      }
      case 'start': {
        if (this.state.phase !== 'lobby') return this.error(connId, 'NOT_ALLOWED', 'Already started.');
        const ready = this.seated().filter((p) => p.connected).length;
        if (ready < MIN_PLAYERS) return this.error(connId, 'NOT_ENOUGH_PLAYERS', `Need ${MIN_PLAYERS}+ players to start.`);
        // Phase 2 replaces this with the synced intro and the game rotation.
        this.state.phase = 'intro';
        this.state.phaseEndsAt = null;
        this.touch();
        return;
      }
      case 'remove': {
        if (action.playerId === me.id) return this.error(connId, 'NOT_ALLOWED', "You can't remove yourself.");
        if (!this.player(action.playerId)) return this.error(connId, 'UNKNOWN_PLAYER', 'No such player.');
        this.removePlayer(action.playerId, 'removed');
        return;
      }
      case 'resolveClaim':
        this.resolveClaim(action.claimId, action.approve);
        return;
    }
  }

  // ---------------------------------------------------------------- state helpers

  private removePlayer(playerId: PlayerId, reason: EndReason): void {
    const player = this.player(playerId);
    if (!player) return;
    for (const [connId, conn] of this.conns) {
      if (conn.playerId === playerId) {
        this.conns.delete(connId);
        this.endSession(connId, reason);
      }
    }
    if (this.state.phase === 'lobby') {
      // Nothing to remember yet: free the name and colour.
      this.state.players = this.state.players.filter((p) => p.id !== playerId);
    } else {
      player.status = 'removed';
      player.connected = false;
    }
    this.state.claims = this.state.claims.filter((c) => c.playerId !== playerId);
    if (this.state.hostId === playerId) this.transferHost();
    this.updateEmpty();
    this.touch();
  }

  private markConnected(player: PlayerRecord): void {
    if (!player.connected) {
      player.connected = true;
      player.connectedSince = this.deps.now();
    }
    player.disconnectedAt = null;
    if (player.status === 'gone') player.status = 'active';
    this.state.emptySince = null;
    // No host, or the host has been gone past the handover window: hand over now.
    const host = this.player(this.state.hostId);
    if (!host) this.state.hostId = player.id;
    else if (!host.connected && host.disconnectedAt !== null && this.deps.now() - host.disconnectedAt >= HOST_TRANSFER_MS) {
      this.transferHost();
    }
    this.touch();
  }

  private markDisconnected(playerId: PlayerId): void {
    const stillOpen = [...this.conns.values()].some((c) => c.playerId === playerId);
    const player = this.player(playerId);
    if (!player || stillOpen || !player.connected) return;
    player.connected = false;
    player.connectedSince = null;
    player.disconnectedAt = this.deps.now();
    this.updateEmpty();
    this.touch();
  }

  /** Host passes to the longest-connected player still here. */
  private transferHost(): void {
    const candidates = this.seated()
      .filter((p) => p.connected && p.status === 'active' && p.id !== this.state.hostId)
      .sort((a, b) => (a.connectedSince ?? Infinity) - (b.connectedSince ?? Infinity) || a.seat - b.seat);
    const next = candidates[0];
    if (next) {
      this.state.hostId = next.id;
      this.touch();
    } else if (!this.player(this.state.hostId)) {
      this.state.hostId = null;
      this.touch();
    }
  }

  private updateEmpty(): void {
    const anyone = this.state.players.some((p) => p.connected);
    if (anyone) this.state.emptySince = null;
    else this.state.emptySince ??= this.deps.now();
  }

  private expire(): void {
    this.state.ended = true;
    for (const connId of [...this.conns.keys()]) this.endSession(connId, 'expired');
    this.conns.clear();
    this.deps.setAlarm(null);
    this.deps.destroy();
  }

  private endSession(connId: string, reason: EndReason): void {
    this.deps.send(connId, { type: 'sessionEnded', reason });
    this.deps.close(connId, CLOSE_ENDED, reason);
  }

  private nextAlarm(): number | null {
    const s = this.state;
    const times: number[] = [];
    for (const p of s.players) {
      if (p.status === 'active' && !p.connected && p.disconnectedAt !== null) {
        times.push(p.disconnectedAt + GONE_AFTER_MS);
        if (p.id === s.hostId) times.push(p.disconnectedAt + HOST_TRANSFER_MS);
      }
    }
    for (const c of s.claims) times.push(c.at + CLAIM_TIMEOUT_MS);
    if (s.emptySince !== null) times.push(s.emptySince + ROOM_EXPIRY_MS);
    if (s.phaseEndsAt !== null) times.push(s.phaseEndsAt);
    // Only future deadlines: a passed one with nothing to do must not re-fire forever.
    const now = this.deps.now();
    const future = times.filter((t) => t > now);
    return future.length > 0 ? Math.min(...future) : null;
  }

  private touch(): void {
    this.dirty = true;
  }

  /** Persist, re-arm the alarm and push views if anything changed. */
  private commit(): void {
    if (!this.dirty || this.state.ended) return;
    this.dirty = false;
    this.state.version++;
    this.deps.save(this.state);
    this.deps.setAlarm(this.nextAlarm());
    this.broadcast();
  }

  private broadcast(): void {
    for (const [connId, conn] of this.conns) {
      if (conn.playerId) this.sendView(connId, conn);
      else this.deps.send(connId, { type: 'welcome', info: this.welcomeInfo(), serverTime: this.deps.now() });
    }
  }

  private sendView(connId: string, conn: Conn): void {
    if (!conn.playerId) {
      this.deps.send(connId, { type: 'welcome', info: this.welcomeInfo(), serverTime: this.deps.now() });
      return;
    }
    const view = this.viewFor(conn.playerId);
    const version = this.state.version;
    if (conn.last) {
      const ops = diff(conn.last.view, view);
      if (ops.length === 0) return;
      this.deps.send(connId, { type: 'patch', base: conn.last.version, version, ops });
    } else {
      this.deps.send(connId, { type: 'state', version, view });
    }
    conn.last = { version, view };
  }

  // ---------------------------------------------------------------- views

  viewFor(playerId: PlayerId): RoomView {
    const s = this.state;
    return {
      protocol: PROTOCOL_VERSION,
      code: s.code,
      phase: s.phase,
      phaseEndsAt: s.phaseEndsAt,
      hostId: s.hostId,
      players: this.seated().map((p) => this.playerView(p)),
      settings: { ...s.settings, games: [...s.settings.games] },
      you: { id: playerId },
      claims:
        s.hostId === playerId
          ? s.claims.map((c) => ({ claimId: c.claimId, playerId: c.playerId, name: this.player(c.playerId)?.name ?? '?' }))
          : [],
    };
  }

  welcomeInfo(): WelcomeInfo {
    const seated = this.seated();
    return {
      code: this.state.code,
      phase: this.state.phase,
      joinable: this.state.phase === 'lobby' && seated.length < MAX_PLAYERS,
      full: seated.length >= MAX_PLAYERS,
      takenColors: seated.map((p) => p.avatar.color),
      claimable: seated.filter((p) => !p.connected).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
    };
  }

  private playerView(p: PlayerRecord): PlayerView {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      presence: p.connected ? 'connected' : p.status === 'gone' ? 'gone' : 'reconnecting',
      isHost: p.id === this.state.hostId,
    };
  }

  private seated(): PlayerRecord[] {
    return this.state.players.filter((p) => p.status !== 'removed').sort((a, b) => a.seat - b.seat);
  }

  private player(id: PlayerId | null): PlayerRecord | undefined {
    return id === null ? undefined : this.state.players.find((p) => p.id === id && p.status !== 'removed');
  }

  private newConn(playerId: PlayerId | null): Conn {
    return { playerId, bucket: new TokenBucket(40, 20, this.deps.now()), last: null, lastRateError: 0 };
  }

  private error(connId: string, code: ErrorCode, message: string): void {
    this.deps.send(connId, { type: 'error', code, message });
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diffBits = 0;
  for (let i = 0; i < a.length; i++) diffBits |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diffBits === 0;
}

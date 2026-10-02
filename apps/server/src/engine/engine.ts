/**
 * RoomEngine: the single authority for one room (PLAN.md §3).
 * Host-agnostic: the Durable Object and the Node adapter both drive it through
 * connect / message / disconnect / alarm, and it talks back through EngineDeps.
 */
import {
  cleanName,
  createRng,
  dedupeName,
  diff,
  firstFreeColor,
  pickNextGame,
  SESSION_MINUTES,
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
  type PlayView,
  type Rng,
  type RoomPhase,
  type RoomView,
  type ServerMessage,
  type SessionView,
  type WelcomeInfo,
} from '@tap-in/shared';
import { GAMES, isReject, playableGames, type AnyGame, type GameCtx } from '@tap-in/games';
import { applyFairnessCap, buildResults, drinkersOf } from './drinks.js';
import { isProfane, parseClientMessage } from '@tap-in/shared/server';
import { TokenBucket } from './rateLimit.js';
import {
  CLAIM_TIMEOUT_MS,
  DRINK_MIN_MS,
  DRINK_MS,
  GONE_AFTER_MS,
  HOST_TRANSFER_MS,
  INTRO_MS,
  LEAD_MS,
  NOBODY_MS,
  OUTRO_MS,
  PAUSE_MS,
  ROOM_EXPIRY_MS,
  TITLE_MS,
  WATER_EVERY_MS,
  WATER_MS,
  type OverlayState,
  type PlayerRecord,
  type RoomState,
  type SessionState,
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
  /** Multiplies every game and phase duration (e2e and dev run faster). Default 1. */
  timeScale?: number;
}

/** Phases where the session is running (pause, end and presence rules apply). */
const PLAY_PHASES: ReadonlySet<RoomPhase> = new Set([
  'intro',
  'gameIntro',
  'roundInput',
  'roundReveal',
  'drink',
  'gameOutro',
]);

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
      this.deps.send(connId, {
        type: 'error',
        code: 'ROOM_ENDED',
        message: 'This room has ended.',
      });
      this.deps.close(connId, CLOSE_ENDED, 'ended');
      return;
    }
    this.conns.set(connId, this.newConn(null));
    this.deps.send(connId, {
      type: 'welcome',
      info: this.welcomeInfo(),
      serverTime: this.deps.now(),
    });
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
      if (
        p.status === 'active' &&
        !p.connected &&
        p.disconnectedAt !== null &&
        now - p.disconnectedAt >= GONE_AFTER_MS
      ) {
        p.status = 'gone';
        this.touch();
      }
    }
    const host = this.player(this.state.hostId);
    if (
      host &&
      !host.connected &&
      host.disconnectedAt !== null &&
      now - host.disconnectedAt >= HOST_TRANSFER_MS
    ) {
      this.transferHost();
    }
    for (const claim of this.state.claims.filter((c) => now - c.at >= CLAIM_TIMEOUT_MS)) {
      this.resolveClaim(claim.claimId, false);
    }
    if (this.state.emptySince !== null && now - this.state.emptySince >= ROOM_EXPIRY_MS) {
      this.expire();
      return;
    }
    this.presenceChanged();
    this.runTimers();
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
      case 'submit':
        this.submit(connId, me, msg.step, msg.data);
        return;
      case 'ready':
        this.drinkDone(me);
        return;
    }
  }

  private join(connId: string, conn: Conn, rawName: string, avatar: Avatar): void {
    if (conn.playerId) {
      this.error(connId, 'ALREADY_JOINED', 'You are already in.');
      return;
    }
    if (this.state.phase !== 'lobby') {
      this.error(
        connId,
        'LOBBY_LOCKED',
        'This game already started. Only existing players can get back in.',
      );
      return;
    }
    const seated = this.seated();
    if (seated.length >= MAX_PLAYERS) {
      this.error(connId, 'ROOM_FULL', 'This room is full (8 players).');
      return;
    }
    const cleaned = cleanName(rawName);
    if (cleaned.length === 0) {
      this.error(connId, 'NAME_REJECTED', 'Enter a name.');
      return;
    }
    if (isProfane(cleaned)) {
      this.error(connId, 'NAME_REJECTED', 'Pick a different name.');
      return;
    }
    const name = dedupeName(
      cleaned,
      seated.map((p) => p.name),
    );
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
    this.deps.send(connId, {
      type: 'credentials',
      code: this.state.code,
      playerId: player.id,
      token: player.token,
    });
    this.touch();
  }

  private rejoin(connId: string, conn: Conn, playerId: PlayerId, token: string): void {
    const player = this.player(playerId);
    if (!player || player.status === 'removed' || !safeEqual(player.token, token)) {
      this.error(connId, 'BAD_TOKEN', 'That seat is no longer yours.');
      return;
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
    if (conn.playerId) {
      this.error(connId, 'ALREADY_JOINED', 'You are already in.');
      return;
    }
    const player = this.player(playerId);
    if (!player || player.status === 'removed') {
      this.error(connId, 'UNKNOWN_PLAYER', 'No such player.');
      return;
    }
    if (player.connected) {
      this.error(connId, 'NOT_ALLOWED', `${player.name} is still connected.`);
      return;
    }
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
    this.deps.send(claim.connId, {
      type: 'credentials',
      code: this.state.code,
      playerId: player.id,
      token: player.token,
    });
    this.markConnected(player);
  }

  private setAvatar(connId: string, me: PlayerRecord, avatar: Avatar): void {
    if (this.state.phase !== 'lobby' && this.state.phase !== 'results') {
      this.error(connId, 'NOT_ALLOWED', 'You can change your cap in the lobby.');
      return;
    }
    const takenByOther = this.seated().some(
      (p) => p.id !== me.id && p.avatar.color === avatar.color,
    );
    if (takenByOther) {
      this.error(connId, 'COLOR_TAKEN', 'Someone already has that colour.');
      return;
    }
    me.avatar = avatar;
    this.touch();
  }

  private hostAction(connId: string, me: PlayerRecord, action: HostAction): void {
    switch (action.kind) {
      case 'settings': {
        if (this.state.phase !== 'lobby') {
          this.error(connId, 'NOT_ALLOWED', 'Settings are locked once the game starts.');
          return;
        }
        const next = { ...this.state.settings, ...action.settings };
        next.games = [...new Set(next.games)];
        if (next.games.length < MIN_ENABLED_GAMES) {
          this.error(connId, 'NOT_ALLOWED', `Keep at least ${MIN_ENABLED_GAMES} games on.`);
          return;
        }
        this.state.settings = next;
        this.touch();
        return;
      }
      case 'start': {
        if (this.state.phase !== 'lobby') {
          this.error(connId, 'NOT_ALLOWED', 'Already started.');
          return;
        }
        const ready = this.seated().filter((p) => p.connected).length;
        if (ready < MIN_PLAYERS) {
          this.error(connId, 'NOT_ENOUGH_PLAYERS', `Need ${MIN_PLAYERS}+ players to start.`);
          return;
        }
        if (playableGames(this.state.settings.games).length === 0) {
          this.error(connId, 'NOT_ALLOWED', 'None of the games you picked are ready yet.');
          return;
        }
        this.startSession();
        return;
      }
      case 'pause':
        if (!PLAY_PHASES.has(this.state.phase) || this.state.session?.overlay) {
          this.error(connId, 'NOT_ALLOWED', "Can't pause right now.");
          return;
        }
        this.openOverlay('paused', this.ms(PAUSE_MS));
        return;
      case 'resume':
        if (this.state.session?.overlay?.kind === 'paused') this.closeOverlay();
        return;
      case 'end':
        if (!PLAY_PHASES.has(this.state.phase)) {
          this.error(connId, 'NOT_ALLOWED', 'Nothing to end.');
          return;
        }
        this.showResults();
        return;
      case 'rematch':
        if (this.state.phase !== 'results') {
          this.error(connId, 'NOT_ALLOWED', 'Finish this session first.');
          return;
        }
        this.startSession();
        return;
      case 'lobby':
        if (this.state.phase !== 'results') {
          this.error(connId, 'NOT_ALLOWED', 'Finish this session first.');
          return;
        }
        this.state.session = null;
        this.setPhase('lobby', this.deps.now(), null);
        return;
      case 'remove': {
        if (action.playerId === me.id) {
          this.error(connId, 'NOT_ALLOWED', "You can't remove yourself.");
          return;
        }
        if (!this.player(action.playerId)) {
          this.error(connId, 'UNKNOWN_PLAYER', 'No such player.');
          return;
        }
        this.removePlayer(action.playerId, 'removed');
        return;
      }
      case 'resolveClaim':
        this.resolveClaim(action.claimId, action.approve);
        return;
    }
  }

  // ---------------------------------------------------------------- session flow (PLAN.md §3)

  private ms(duration: number): number {
    return Math.round(duration * (this.deps.timeScale ?? 1));
  }

  private setPhase(phase: RoomPhase, at: number, endsAt: number | null): void {
    this.state.phase = phase;
    this.state.phaseAt = at;
    this.state.phaseEndsAt = endsAt;
    this.touch();
  }

  /** Runs `fn` with the room's seeded rng and persists the advanced rng state. */
  private withRng<T>(fn: (rng: Rng) => T): T {
    const rng = createRng(this.state.rng);
    const out = fn(rng);
    this.state.rng = rng.state();
    return out;
  }

  private activeIds(): PlayerId[] {
    return this.seated()
      .filter((p) => p.status === 'active')
      .map((p) => p.id);
  }

  private connectedIds(): PlayerId[] {
    return this.seated()
      .filter((p) => p.connected)
      .map((p) => p.id);
  }

  private currentGame(): AnyGame | undefined {
    const id = this.state.session?.gameId;
    return id ? GAMES[id] : undefined;
  }

  private gameCtx(session: SessionState, rng: Rng): GameCtx {
    const gameId = session.gameId;
    const used = gameId ? (session.used[gameId] ??= []) : [];
    return {
      now: this.deps.now(),
      rng,
      players: session.participants,
      connected: this.connectedIds(),
      spice: this.state.settings.spice,
      used,
      ms: (d) => this.ms(d),
      lead: LEAD_MS,
    };
  }

  private startSession(): void {
    const now = this.deps.now();
    const drinks: Record<PlayerId, number> = {};
    for (const p of this.seated()) drinks[p.id] = 0;
    this.state.session = {
      startedAt: now,
      budgetMs: this.ms(SESSION_MINUTES[this.state.settings.length] * 60_000),
      history: [],
      gameId: null,
      game: null,
      round: 0,
      rounds: 0,
      participants: this.activeIds(),
      used: {},
      reveal: null,
      drink: null,
      done: [],
      drinks,
      streak: {},
      reactionMs: {},
      lastBreakAt: now,
      overlay: null,
      results: null,
    };
    const at = now + LEAD_MS;
    this.setPhase('intro', at, at + this.ms(INTRO_MS));
  }

  /** Fire every phase deadline that has passed (several can be due at once). */
  private runTimers(): void {
    for (let i = 0; i < 20; i++) {
      const session = this.state.session;
      const now = this.deps.now();
      if (session?.overlay) {
        if (session.overlay.endsAt === null || now < session.overlay.endsAt) return;
        this.closeOverlay();
        continue;
      }
      if (this.state.phaseEndsAt === null || now < this.state.phaseEndsAt) return;
      this.advance();
    }
  }

  private advance(): void {
    switch (this.state.phase) {
      case 'intro':
      case 'gameOutro':
        this.nextGame();
        return;
      case 'gameIntro':
        this.startRound();
        return;
      case 'roundInput':
        this.gameTimer();
        return;
      case 'roundReveal':
        this.enterDrink();
        return;
      case 'drink':
        this.afterDrink();
        return;
      default:
        this.state.phaseEndsAt = null;
        this.touch();
    }
  }

  private nextGame(): void {
    const session = this.state.session;
    if (!session) return;
    const now = this.deps.now();
    const enabled = playableGames(this.state.settings.games);
    const gameId = this.withRng((rng) => pickNextGame(session.history, enabled, rng));
    const game = GAMES[gameId];
    const n = this.activeIds().length;
    const elapsed = now - session.startedAt;
    // Never start a block that would overshoot the budget by more than half its length.
    if (
      !game ||
      (session.history.length > 0 && elapsed + this.ms(game.estimateMs(n)) / 2 > session.budgetMs)
    ) {
      this.showResults();
      return;
    }
    session.history.push(gameId);
    session.gameId = gameId;
    session.round = 0;
    session.rounds = game.rounds(n);
    session.participants = this.activeIds();
    session.reveal = null;
    session.drink = null;
    session.game = this.withRng((rng) => game.init(this.gameCtx(session, rng)));
    const at = now + LEAD_MS;
    this.setPhase('gameIntro', at, at + this.ms(TITLE_MS));
  }

  private startRound(): void {
    const session = this.state.session;
    const game = this.currentGame();
    if (!session || !game) return;
    session.round++;
    session.participants = this.activeIds();
    session.reveal = null;
    session.drink = null;
    session.done = [];
    session.game = this.withRng((rng) => game.startRound(session.game, this.gameCtx(session, rng)));
    this.setPhase('roundInput', this.deps.now(), game.deadline(session.game));
    this.checkRound();
  }

  private gameTimer(): void {
    const session = this.state.session;
    const game = this.currentGame();
    if (!session || !game) return;
    session.game = this.withRng((rng) => game.onTimer(session.game, this.gameCtx(session, rng)));
    this.state.phaseEndsAt = game.deadline(session.game);
    this.touch();
    this.checkRound();
  }

  /** End the step early when nobody connected is still awaited; reveal once the round is over. */
  private checkRound(): void {
    const session = this.state.session;
    const game = this.currentGame();
    if (!session || !game || this.state.phase !== 'roundInput' || session.overlay) return;
    for (let i = 0; i < 10; i++) {
      if (game.roundOver(session.game)) {
        this.enterReveal();
        return;
      }
      const connected = new Set(this.connectedIds());
      const waitingOn = game.awaiting(session.game).filter((p) => connected.has(p));
      if (waitingOn.length > 0 || !game.endsEarly(session.game)) return;
      session.game = this.withRng((rng) => game.onTimer(session.game, this.gameCtx(session, rng)));
      this.state.phaseEndsAt = game.deadline(session.game);
      this.touch();
    }
  }

  private enterReveal(): void {
    const session = this.state.session;
    const game = this.currentGame();
    if (!session || !game) return;
    const result = this.withRng((rng) => game.result(session.game, this.gameCtx(session, rng)));
    const { drink, streak } = applyFairnessCap(result, session.participants, session.streak);
    session.reveal = result.reveal;
    session.drink = drink;
    session.streak = streak;
    for (const [id, stat] of Object.entries(result.stats ?? {})) {
      if (stat.reactionMs !== undefined) (session.reactionMs[id] ??= []).push(stat.reactionMs);
    }
    const at = this.deps.now() + LEAD_MS;
    this.setPhase('roundReveal', at, at + this.ms(game.revealMs(session.participants.length)));
  }

  private enterDrink(): void {
    const session = this.state.session;
    if (!session?.drink) return;
    for (const id of drinkersOf(session.drink, session.participants)) {
      session.drinks[id] = (session.drinks[id] ?? 0) + 1;
    }
    session.done = [];
    const at = this.deps.now() + LEAD_MS;
    const hold = session.drink.nobody ? NOBODY_MS : DRINK_MS;
    this.setPhase('drink', at, at + this.ms(hold));
  }

  /** A drinker tapped Done: once every connected drinker has, move on (after a short hold). */
  private drinkDone(me: PlayerRecord): void {
    const session = this.state.session;
    if (this.state.phase !== 'drink' || !session?.drink || session.overlay) return;
    const drinkers = drinkersOf(session.drink, session.participants);
    if (!drinkers.includes(me.id) || session.done.includes(me.id)) return;
    session.done.push(me.id);
    this.touch();
    const connected = new Set(this.connectedIds());
    if (drinkers.every((id) => session.done.includes(id) || !connected.has(id))) {
      const earliest = Math.max(this.deps.now() + 400, this.state.phaseAt + this.ms(DRINK_MIN_MS));
      this.state.phaseEndsAt = Math.min(this.state.phaseEndsAt ?? earliest, earliest);
    }
  }

  private afterDrink(): void {
    const session = this.state.session;
    if (!session) return;
    const now = this.deps.now();
    if (now - session.lastBreakAt >= this.ms(WATER_EVERY_MS)) {
      session.lastBreakAt = now;
      this.state.phaseEndsAt = null;
      this.openOverlay('water', this.ms(WATER_MS));
      return;
    }
    this.nextRoundOrOutro();
  }

  private nextRoundOrOutro(): void {
    const session = this.state.session;
    if (!session) return;
    if (session.round < session.rounds) {
      this.startRound();
      return;
    }
    const now = this.deps.now();
    this.setPhase('gameOutro', now, now + this.ms(OUTRO_MS));
  }

  private showResults(): void {
    const session = this.state.session;
    if (!session) return;
    session.overlay = null;
    session.results = buildResults(
      this.seated().map((p) => p.id),
      session.drinks,
      session.reactionMs,
      session.history,
    );
    this.setPhase('results', this.deps.now() + LEAD_MS, null);
  }

  /** Freeze the current phase (pause, water break, waiting for players). */
  private openOverlay(kind: OverlayState['kind'], duration: number | null): void {
    const session = this.state.session;
    if (!session) return;
    const now = this.deps.now();
    session.overlay = {
      kind,
      startedAt: now,
      endsAt: duration === null ? null : now + duration,
      remaining: this.state.phaseEndsAt === null ? null : Math.max(0, this.state.phaseEndsAt - now),
    };
    this.state.phaseEndsAt = null;
    this.touch();
  }

  /** Resume with every deadline shifted by the time spent frozen. */
  private closeOverlay(): void {
    const session = this.state.session;
    const overlay = session?.overlay;
    if (!session || !overlay) return;
    const now = this.deps.now();
    session.overlay = null;
    this.touch();
    if (overlay.remaining === null) {
      // Frozen between phases (water break after a Drink): carry on to the next round.
      if (this.state.phase === 'drink') this.nextRoundOrOutro();
      return;
    }
    const delta = now - overlay.startedAt;
    const game = this.currentGame();
    if (this.state.phase === 'roundInput' && game) session.game = game.shift(session.game, delta);
    this.state.phaseAt += delta;
    this.state.phaseEndsAt = now + overlay.remaining;
    this.checkRound();
  }

  /** Presence moved: wait for players below the minimum, resume above it, end steps early. */
  private presenceChanged(): void {
    const session = this.state.session;
    if (!session || !PLAY_PHASES.has(this.state.phase)) return;
    // Below the minimum, or nobody connected at all (the room's Wi-Fi dropped): freeze.
    const enough = this.activeIds().length >= MIN_PLAYERS && this.connectedIds().length > 0;
    if (!enough && !session.overlay) this.openOverlay('waiting', null);
    else if (!enough && session.overlay && session.overlay.kind !== 'waiting') {
      // Swap a pause or water break for "waiting", keeping the frozen timer.
      session.overlay = { ...session.overlay, kind: 'waiting', endsAt: null };
      this.touch();
    } else if (enough && session.overlay?.kind === 'waiting') this.closeOverlay();
    this.checkRound();
  }

  private submit(connId: string, me: PlayerRecord, step: string, data: unknown): void {
    const session = this.state.session;
    const game = this.currentGame();
    if (this.state.phase !== 'roundInput' || !session || !game || session.overlay) {
      this.error(connId, 'WRONG_STEP', 'Not now.');
      return;
    }
    if (game.step(session.game) !== step || !session.participants.includes(me.id)) {
      this.error(connId, 'WRONG_STEP', 'Not now.');
      return;
    }
    const parsed = game.inputSchema.safeParse(data);
    if (!parsed.success) {
      this.error(connId, 'BAD_MESSAGE', 'Invalid input.');
      return;
    }
    const next = this.withRng((rng) =>
      game.onInput(session.game, me.id, parsed.data, this.gameCtx(session, rng)),
    );
    if (isReject(next)) {
      this.error(connId, 'REJECTED', next.reject);
      return;
    }
    session.game = next;
    this.touch();
    this.checkRound();
  }

  private sessionView(session: SessionState, playerId: PlayerId): SessionView {
    const phase = this.state.phase;
    const game = this.currentGame();
    const inGame =
      game !== undefined &&
      (phase === 'gameIntro' ||
        phase === 'roundInput' ||
        phase === 'roundReveal' ||
        phase === 'drink' ||
        phase === 'gameOutro');
    const showReveal = phase === 'roundReveal' || phase === 'drink';
    const play = inGame
      ? ({
          gameId: game.id,
          step: game.step(session.game),
          pub: game.publicView(session.game),
          me: game.privateView(session.game, playerId),
          reveal: showReveal ? session.reveal : null,
        } as PlayView)
      : null;
    const awaiting = phase === 'roundInput' && game ? game.awaiting(session.game) : null;
    return {
      block: session.history.length,
      gameId: inGame ? game.id : null,
      round: session.round,
      rounds: session.rounds,
      play,
      participants: [...session.participants],
      locked: awaiting ? session.participants.filter((p) => !awaiting.includes(p)) : [],
      drink: phase === 'drink' ? session.drink : null,
      done: [...session.done],
      overlay: session.overlay
        ? { kind: session.overlay.kind, endsAt: session.overlay.endsAt }
        : null,
      drinks: { ...session.drinks },
      results: phase === 'results' ? session.results : null,
    };
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
    this.presenceChanged();
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
    else if (
      !host.connected &&
      host.disconnectedAt !== null &&
      this.deps.now() - host.disconnectedAt >= HOST_TRANSFER_MS
    ) {
      this.transferHost();
    }
    this.presenceChanged();
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
    this.presenceChanged();
    this.touch();
  }

  /** Host passes to the longest-connected player still here. */
  private transferHost(): void {
    const candidates = this.seated()
      .filter((p) => p.connected && p.status === 'active' && p.id !== this.state.hostId)
      .sort(
        (a, b) =>
          (a.connectedSince ?? Infinity) - (b.connectedSince ?? Infinity) || a.seat - b.seat,
      );
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
    if (s.session?.overlay?.endsAt != null) times.push(s.session.overlay.endsAt);
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
      else
        this.deps.send(connId, {
          type: 'welcome',
          info: this.welcomeInfo(),
          serverTime: this.deps.now(),
        });
    }
  }

  private sendView(connId: string, conn: Conn): void {
    if (!conn.playerId) {
      this.deps.send(connId, {
        type: 'welcome',
        info: this.welcomeInfo(),
        serverTime: this.deps.now(),
      });
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
          ? s.claims.map((c) => ({
              claimId: c.claimId,
              playerId: c.playerId,
              name: this.player(c.playerId)?.name ?? '?',
            }))
          : [],
      phaseAt: s.phaseAt,
      session: s.session ? this.sessionView(s.session, playerId) : null,
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
      claimable: seated
        .filter((p) => !p.connected)
        .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar })),
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
    return id === null
      ? undefined
      : this.state.players.find((p) => p.id === id && p.status !== 'removed');
  }

  private newConn(playerId: PlayerId | null): Conn {
    return {
      playerId,
      bucket: new TokenBucket(40, 20, this.deps.now()),
      last: null,
      lastRateError: 0,
    };
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

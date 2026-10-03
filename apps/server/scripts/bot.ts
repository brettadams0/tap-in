/**
 * A bot phone for live testing: joins a room and auto-plays every game like a person would
 * (Tap Race and Reaction Shotgun on the server clock), taps Done when it has to Drink, and
 * rejoins after a dropped socket. Never shipped; the Origin header must be an allowed origin.
 *
 *   pnpm --filter @tap-in/server bot <CODE> [--name Claude] [--server wss://host]
 *
 * Defaults to the production room server. Use `--server ws://localhost:8787` for the Node server.
 */
import WebSocket from 'ws';
import { applyPatch, createRng, type RoomView, type ServerMessage } from '@tap-in/shared';
import { randomInput } from '../test/autoplay.js';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const code = (args.find((a) => /^[A-Za-z]{4}$/.test(a)) ?? '').toUpperCase();
if (!code) {
  console.error('usage: bot <CODE> [--name Claude] [--server wss://host]');
  process.exit(1);
}
const name = flag('name', 'Claude');
const server = flag('server', 'wss://tap-in-server.brettdev.workers.dev');
const url = `${server}/rooms/${code}/ws`;
const rng = createRng(`bot-${Date.now()}`);
let view: RoomView | null = null;
let version = 0;
let creds: { playerId: string; token: string } | null = null;
let lastKey = '';
/** serverTime - Date.now(), from the welcome message (good enough for a bot). */
let offset = 0;
const serverNow = () => Date.now() + offset;
const log = (...a: unknown[]) => {
  console.log(new Date().toISOString().slice(11, 19), ...a);
};

function connect(): void {
  const ws = new WebSocket(url, { headers: { Origin: 'https://tap-in-omega.vercel.app' } });
  const send = (m: unknown): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };
  ws.on('message', (raw: Buffer) => {
    const msg = JSON.parse(raw.toString('utf8')) as ServerMessage;
    if (msg.type === 'welcome') {
      offset = msg.serverTime - Date.now();
      if (creds) send({ type: 'rejoin', ...creds });
      else {
        const colors = ['sky', 'mint', 'orchid', 'sunflower', 'tangerine', 'pink', 'aqua', 'lilac'];
        const color = colors.find((c) => !msg.info.takenColors.includes(c as never)) ?? 'sky';
        send({
          type: 'join',
          name,
          avatar: { color, pattern: 'sunrays', eyes: 'anime', mouth: 'grin', topper: 'crown' },
        });
      }
    } else if (msg.type === 'credentials') {
      creds = { playerId: msg.playerId, token: msg.token };
      log('joined as', msg.playerId);
    } else if (msg.type === 'state') {
      view = msg.view;
      version = msg.version;
    } else if (msg.type === 'patch') {
      if (!view || msg.base !== version) {
        send({ type: 'resync' });
        return;
      }
      view = applyPatch(view, msg.ops);
      version = msg.version;
    } else if (msg.type === 'error') {
      if (msg.code !== 'WRONG_STEP' && msg.code !== 'REJECTED') log('error', msg.code, msg.message);
    } else if (msg.type === 'sessionEnded') {
      log('session ended:', msg.reason);
      process.exit(0);
    }
    if (msg.type === 'state' || msg.type === 'patch') act(send);
  });
  ws.on('close', () => {
    log('socket closed, reconnecting');
    setTimeout(connect, 1500);
  });
  ws.on('error', (e) => {
    log('ws error', e.message);
  });
}

function act(send: (m: unknown) => void): void {
  const v = view;
  if (!v) return;
  const s = v.session;
  const key = `${v.phase}:${s?.round ?? 0}:${s?.play?.step ?? ''}:${s?.play && 'turn' in (s.play.pub as object) ? String((s.play.pub as { turn: number }).turn) : ''}`;
  if (key === lastKey) return;
  lastKey = key;
  if (v.phase !== 'roundInput' && v.phase !== 'drink') log('phase', v.phase, s?.gameId ?? '');
  if (v.phase === 'drink') {
    const mine =
      s?.drink?.drinkers.some((d) => d.id === v.you.id) ||
      (s?.drink?.everyone && !s.drink.spared?.ids.includes(v.you.id));
    if (mine) {
      log('🍺 I have to Drink');
      setTimeout(() => {
        send({ type: 'ready' });
      }, 2500);
    }
    return;
  }
  if (v.phase !== 'roundInput' || !s?.play) return;
  const gameId = s.play.gameId;
  const pub = s.play.pub as unknown as Record<string, unknown>;
  if (gameId === 'tapRace' && typeof pub.goAt === 'number' && typeof pub.tapMs === 'number') {
    const count = 35 + rng.int(40);
    setTimeout(
      () => {
        send({ type: 'submit', step: 'tap', data: { count } });
        log('played tapRace', count, 'taps');
      },
      pub.goAt + pub.tapMs - serverNow() + 400,
    );
    return;
  }
  if (gameId === 'reactionShotgun') {
    // Wait for the real flash time to appear, then "tap" a human-ish 250-450 ms after it.
    const poll = setInterval(() => {
      const p = view?.session?.play;
      if (view?.phase !== 'roundInput' || p?.gameId !== 'reactionShotgun') {
        clearInterval(poll);
        return;
      }
      const flashAt = (p.pub as { flashAt: number | null }).flashAt;
      if (flashAt === null) return;
      clearInterval(poll);
      const ms = 250 + rng.int(200);
      setTimeout(
        () => {
          send({ type: 'submit', step: p.step, data: { ms } });
          log('played reactionShotgun', ms, 'ms');
        },
        flashAt - serverNow() + ms,
      );
    }, 50);
    return;
  }
  const delay = 1500 + rng.int(4000);
  setTimeout(() => {
    const now = view;
    if (!now || now.phase !== 'roundInput') return;
    const input = randomInput(now, rng);
    if (input) {
      send({ type: 'submit', step: input.step, data: input.data });
      log('played', gameId, input.step, JSON.stringify(input.data));
    }
  }, delay);
}

connect();

/** A real WebSocket client that applies patches like the web app does. */
import WebSocket from 'ws';
import { applyPatch, type ClientMessage, type RoomView, type ServerMessage } from '@tap-in/shared';

export class Phone {
  ws!: WebSocket;
  inbox: ServerMessage[] = [];
  view: RoomView | null = null;
  /** Every view this phone ever rendered, for leak checks. */
  views: RoomView[] = [];
  version = 0;
  playerId: string | null = null;
  token: string | null = null;
  private waiters: (() => void)[] = [];

  static async open(url: string): Promise<Phone> {
    const p = new Phone();
    p.ws = new WebSocket(url);
    p.ws.on('message', (data) => {
      const msg = JSON.parse((data as Buffer).toString('utf8')) as ServerMessage;
      p.inbox.push(msg);
      if (msg.type === 'credentials') {
        p.playerId = msg.playerId;
        p.token = msg.token;
      } else if (msg.type === 'state') {
        p.view = msg.view;
        p.version = msg.version;
        p.views.push(msg.view);
      } else if (msg.type === 'patch') {
        if (msg.base !== p.version || !p.view) throw new Error('version gap');
        p.view = applyPatch(p.view, msg.ops);
        p.version = msg.version;
        p.views.push(p.view);
      }
      for (const w of p.waiters.splice(0)) w();
    });
    await new Promise<void>((resolve, reject) => {
      p.ws.once('open', () => {
        resolve();
      });
      p.ws.once('error', reject);
    });
    return p;
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  async until(check: (p: Phone) => boolean, ms = 3000): Promise<void> {
    const deadline = Date.now() + ms;
    while (!check(this)) {
      if (Date.now() > deadline) throw new Error('timed out waiting for condition');
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('close', () => {
        resolve();
      });
      this.ws.close();
    });
  }
}

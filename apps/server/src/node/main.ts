import { NodeRoomServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const server = new NodeRoomServer({
  port,
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? '*',
  // Dev/e2e only: TIME_SCALE=0.25 runs every game timer 4x faster. Production is always 1.
  timeScale: Number(process.env.TIME_SCALE ?? 1),
});
const bound = await server.listen(port);
console.log(`Tap In room server (node) listening on http://localhost:${bound}`);

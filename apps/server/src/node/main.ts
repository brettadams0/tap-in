import { NodeRoomServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const testHooks = process.env.TAPIN_TEST_MODE === '1';
if (testHooks && process.env.NODE_ENV === 'production') {
  throw new Error('TAPIN_TEST_MODE is never allowed in production');
}
const server = new NodeRoomServer({
  port,
  allowedOrigins: process.env.ALLOWED_ORIGINS ?? '*',
  // Dev/e2e only: TIME_SCALE=0.25 runs every game timer 4x faster. Production is always 1.
  timeScale: Number(process.env.TIME_SCALE ?? 1),
  testHooks,
});
const bound = await server.listen(port);
console.log(`Tap In room server (node) listening on http://localhost:${bound}`);

import { NodeRoomServer } from './server.js';

const port = Number(process.env.PORT ?? 8787);
const server = new NodeRoomServer({ port, allowedOrigins: process.env.ALLOWED_ORIGINS ?? '*' });
const bound = await server.listen(port);
console.log(`Tap In room server (node) listening on http://localhost:${bound}`);

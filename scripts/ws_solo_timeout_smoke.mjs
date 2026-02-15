import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { EVENT } from '../shared/protocol.js';

const PORT = 3301;
const HTTP_URL = `http://127.0.0.1:${PORT}/health`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(HTTP_URL);
      if (res.ok) return;
    } catch {
      // retry
    }
    await sleep(100);
  }
  throw new Error('server health timeout');
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitFor(ws, matcher, timeoutMs = 3800) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('timeout'));
    }, timeoutMs);

    function onMessage(raw) {
      const msg = JSON.parse(String(raw));
      if (matcher(msg)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    }

    ws.on('message', onMessage);
  });
}

const server = spawn('node', ['server/index.mjs'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(PORT),
    RECONNECT_GRACE_MS: '1200',
    ROOM_SWEEP_MS: '300'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stderr.on('data', () => {});
server.stdout.on('data', () => {});

try {
  await waitForHealth();

  const host = await connect();
  await waitFor(host, (m) => m.type === 'server:hello');
  send(host, EVENT.ROOM_CREATE, { nickname: 'Hoster' });
  const created = await waitFor(host, (m) => m.type === EVENT.ROOM_STATE);
  const roomCode = created.payload.roomCode;

  const guest = await connect();
  await waitFor(guest, (m) => m.type === 'server:hello');
  send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
  await waitFor(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty'));

  send(host, EVENT.PLAYER_READY, { ready: true });
  await waitFor(
    host,
    (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready === true)
  );
  send(guest, EVENT.PLAYER_READY, { ready: true });
  await waitFor(
    guest,
    (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready === true)
  );
  send(host, EVENT.GAME_START, {});
  await waitFor(host, (m) => m.type === EVENT.GAME_STATE);
  await waitFor(guest, (m) => m.type === EVENT.GAME_STATE);

  guest.close();

  const timeoutRoomState = await waitFor(
    host,
    (m) => m.type === EVENT.ROOM_STATE && !m.payload.players?.some((p) => p.name === 'Guesty'),
    4500
  );

  send(host, EVENT.CELL_FLAG, { x: 2, y: 2, flagged: true });
  const postTimeoutPatch = await waitFor(host, (m) => m.type === EVENT.GAME_PATCH, 2200);
  const cellPatch = postTimeoutPatch.payload.changes.find((c) => c.type === 'cell' && c.x === 2 && c.y === 2);
  if (!cellPatch || cellPatch.flagged !== true) {
    throw new Error('solo continue patch missing after teammate timeout');
  }

  host.close();
  console.log(`ws_solo_timeout_smoke:ok room=${roomCode}`);
} finally {
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), sleep(1000)]);
}

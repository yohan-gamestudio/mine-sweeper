import { WebSocket } from 'ws';
import { EVENT } from '../shared/protocol.js';

const URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws';

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitFor(ws, matcher, timeoutMs = 2500) {
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

const host = await connect();
await waitFor(host, (m) => m.type === 'server:hello');
send(host, EVENT.ROOM_CREATE, { nickname: 'Hoster' });
const created = await waitFor(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = created.payload.roomCode;

let guest = await connect();
await waitFor(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
await waitFor(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.guest?.name === 'Guesty');

send(host, EVENT.PLAYER_READY, { ready: true });
await waitFor(host, (m) => m.type === EVENT.ROOM_STATE && m.payload.host?.ready === true);
send(guest, EVENT.PLAYER_READY, { ready: true });
await waitFor(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.guest?.ready === true);
send(host, EVENT.GAME_START, {});
await waitFor(host, (m) => m.type === EVENT.GAME_STATE);
await waitFor(guest, (m) => m.type === EVENT.GAME_STATE);

guest.close();
await new Promise((resolve) => setTimeout(resolve, 150));

guest = await connect();
await waitFor(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
const roomState = await waitFor(
  guest,
  (m) => m.type === EVENT.ROOM_STATE && m.payload.guest?.connected === true,
  4500
);
if (roomState.payload.guest?.name !== 'Guesty') {
  throw new Error('reconnect guest slot restore failed');
}
const resumedState = await waitFor(guest, (m) => m.type === EVENT.GAME_STATE, 4500);
if (resumedState.payload.phase !== 'playing') {
  throw new Error('reconnected guest did not receive active game state');
}

send(guest, EVENT.CELL_FLAG, { x: 1, y: 1, flagged: true });
const patch = await waitFor(host, (m) => m.type === EVENT.GAME_PATCH);
const cellPatch = patch.payload.changes.find((c) => c.type === 'cell' && c.x === 1 && c.y === 1);
if (!cellPatch || cellPatch.flagged !== true) {
  throw new Error('reconnected guest action did not propagate');
}

host.close();
guest.close();
console.log(`ws_reconnect_smoke:ok room=${roomCode}`);

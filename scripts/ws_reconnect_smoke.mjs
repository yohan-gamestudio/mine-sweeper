import { WebSocket } from 'ws';
import { EVENT } from '../shared/protocol.js';

const URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws';

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once('open', () => {
      ws.__queue = [];
      ws.on('message', (raw) => {
        ws.__queue.push(JSON.parse(String(raw)));
      });
      resolve(ws);
    });
    ws.once('error', reject);
  });
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, payload }));
}

function nextMsg(ws, matcher, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      for (let i = 0; i < ws.__queue.length; i += 1) {
        const m = ws.__queue[i];
        if (matcher(m)) {
          ws.__queue.splice(i, 1);
          resolve(m);
          return;
        }
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('timeout'));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

const host = await connect();
await nextMsg(host, (m) => m.type === 'server:hello');
send(host, EVENT.ROOM_CREATE, { nickname: 'Hoster' });
const created = await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = created.payload.roomCode;

let guest = await connect();
await nextMsg(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
const joinedRoom = await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty'));
const guestToken = joinedRoom.payload.youToken;
if (!guestToken) {
  throw new Error('missing reconnect token');
}

send(host, EVENT.PLAYER_READY, { ready: true });
await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready === true));
send(guest, EVENT.PLAYER_READY, { ready: true });
await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready === true));
send(host, EVENT.GAME_START, {});
await nextMsg(host, (m) => m.type === EVENT.GAME_STATE);
await nextMsg(guest, (m) => m.type === EVENT.GAME_STATE);

guest.close();
await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty' && p.connected === false));

guest = await connect();
await nextMsg(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode, reconnectToken: guestToken });
const roomState = await nextMsg(
  guest,
  (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty' && p.connected === true)
);
if (!roomState.payload.players?.some((p) => p.name === 'Guesty')) {
  throw new Error('reconnect guest slot restore failed');
}
const resumedState = await nextMsg(guest, (m) => m.type === EVENT.GAME_STATE, 7000);
if (resumedState.payload.phase !== 'playing') {
  throw new Error('reconnected guest did not receive active game state');
}

send(guest, EVENT.CELL_FLAG, { x: 1, y: 1, flagged: true });
const patch = await nextMsg(host, (m) => m.type === EVENT.GAME_PATCH);
const cellPatch = patch.payload.changes.find((c) => c.type === 'cell' && c.x === 1 && c.y === 1);
if (!cellPatch || cellPatch.flagged !== true) {
  throw new Error('reconnected guest action did not propagate');
}

host.close();
guest.close();
console.log(`ws_reconnect_smoke:ok room=${roomCode}`);

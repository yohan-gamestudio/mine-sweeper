import { WebSocket } from 'ws';
import { EVENT } from '../shared/protocol.js';

const URL = process.env.WS_URL || 'ws://127.0.0.1:3000/ws';

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once('open', () => {
      ws.__queue = [];
      ws.on('message', (raw) => ws.__queue.push(JSON.parse(String(raw))));
      resolve(ws);
    });
    ws.once('error', reject);
  });
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify({ type, payload }));
}

function nextMsg(ws, matcher, timeoutMs = 6000) {
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
const roomState = await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = roomState.payload.roomCode;

const guest = await connect();
await nextMsg(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty'));

send(host, EVENT.PLAYER_READY, { ready: true });
await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready));
send(guest, EVENT.PLAYER_READY, { ready: true });
await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready));

send(host, EVENT.GAME_START, {});
await nextMsg(host, (m) => m.type === EVENT.GAME_STATE);
await nextMsg(guest, (m) => m.type === EVENT.GAME_STATE);

send(host, EVENT.CELL_FLAG, { x: 2, y: 2, flagged: true });
const hostPatch = await nextMsg(host, (m) => m.type === EVENT.GAME_PATCH);
const guestPatch = await nextMsg(guest, (m) => m.type === EVENT.GAME_PATCH);

const hostCellPatch = hostPatch.payload.changes.find((c) => c.type === 'cell');
const guestCellPatch = guestPatch.payload.changes.find((c) => c.type === 'cell');
if (!hostCellPatch || !guestCellPatch) {
  throw new Error('missing cell patch');
}
if (hostCellPatch.x !== guestCellPatch.x || hostCellPatch.y !== guestCellPatch.y || hostCellPatch.flagged !== guestCellPatch.flagged) {
  throw new Error('host/guest patch mismatch');
}
if (hostPatch.payload.lives !== guestPatch.payload.lives) {
  throw new Error('host/guest lives mismatch');
}

host.close();
guest.close();
console.log(`ws_patch_consistency_smoke:ok room=${roomCode}`);

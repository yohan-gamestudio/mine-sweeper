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

function waitFor(ws, matcher, timeoutMs = 2200) {
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
const roomState = await waitFor(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = roomState.payload.roomCode;

const guest = await connect();
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

send(host, EVENT.CELL_FLAG, { x: 2, y: 2, flagged: true });
const hostPatch = await waitFor(host, (m) => m.type === EVENT.GAME_PATCH);
const guestPatch = await waitFor(guest, (m) => m.type === EVENT.GAME_PATCH);

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

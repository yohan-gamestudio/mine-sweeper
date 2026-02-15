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

function waitFor(ws, matcher, timeoutMs = 1800) {
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
const hostRoom = await waitFor(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = hostRoom.payload.roomCode;

const guest = await connect();
await waitFor(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
await waitFor(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.guest?.name === 'Guesty');

send(host, EVENT.PLAYER_READY, { ready: true });
await waitFor(host, (m) => m.type === EVENT.ROOM_STATE && m.payload.host?.ready === true);

send(guest, EVENT.PLAYER_READY, { ready: true });
await waitFor(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.guest?.ready === true);

send(host, EVENT.GAME_START, {});
const hostGameState = await waitFor(host, (m) => m.type === EVENT.GAME_STATE);
const guestGameState = await waitFor(guest, (m) => m.type === EVENT.GAME_STATE);

if (hostGameState.payload.phase !== 'playing' || guestGameState.payload.phase !== 'playing') {
  throw new Error('game did not enter playing phase');
}

host.close();
guest.close();
console.log(`ws_ready_start_smoke:ok room=${roomCode}`);

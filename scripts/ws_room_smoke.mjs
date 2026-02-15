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

function waitForEvent(ws, type, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`timeout waiting for ${type}`));
    }, timeoutMs);

    function onMessage(raw) {
      const msg = JSON.parse(String(raw));
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg.payload);
      }
    }

    ws.on('message', onMessage);
  });
}

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

const host = await connect();
await waitForEvent(host, 'server:hello');

send(host, EVENT.ROOM_CREATE, { nickname: 'Hoster' });
const hostRoomState = await waitForEvent(host, EVENT.ROOM_STATE);
const roomCode = hostRoomState.roomCode;
if (!roomCode || hostRoomState.host.name !== 'Hoster') {
  throw new Error('host room state invalid');
}

const guest = await connect();
await waitForEvent(guest, 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
const guestRoomState = await waitForEvent(guest, EVENT.ROOM_STATE);
if (guestRoomState.guest.name !== 'Guesty') {
  throw new Error('guest room state invalid');
}

host.close();
guest.close();

console.log(`ws_room_smoke:ok room=${roomCode}`);

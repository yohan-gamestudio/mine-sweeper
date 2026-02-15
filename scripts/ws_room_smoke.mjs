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
const hostRoomState = await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = hostRoomState.payload.roomCode;
const hostSlot = hostRoomState.payload.hostSlot || 'p1';
if (!roomCode || hostRoomState.payload.players.find((p) => p.slot === hostSlot)?.name !== 'Hoster') {
  throw new Error('host room state invalid');
}

const guest = await connect();
await nextMsg(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
const guestRoomState = await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE);
if (!guestRoomState.payload.players.find((p) => p.name === 'Guesty')) {
  throw new Error('guest room state invalid');
}

host.close();
guest.close();

console.log(`ws_room_smoke:ok room=${roomCode}`);

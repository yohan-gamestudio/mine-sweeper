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
const created = await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = created.payload.roomCode;

const guest = await connect();
await nextMsg(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty'));

send(guest, EVENT.PLAYER_MOVE, { x: 1.25, y: 2.35, z: -3.1, yaw: 0.7, pitch: -0.45 });
const pos = await nextMsg(host, (m) => m.type === EVENT.PLAYER_POS);

if (Math.abs(pos.payload.y - 2.35) > 0.01) throw new Error('y sync mismatch');
if (Math.abs(pos.payload.pitch - -0.45) > 0.01) throw new Error('pitch sync mismatch');

host.close();
guest.close();
console.log(`ws_pitch_sync_smoke:ok room=${roomCode}`);

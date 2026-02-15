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

function nextMsg(ws, matcher, timeoutMs = 7000) {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const host = await connect();
await nextMsg(host, (m) => m.type === 'server:hello');
send(host, EVENT.ROOM_CREATE, { nickname: 'Hoster' });
const hostRoom = await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = hostRoom.payload.roomCode;

const guest = await connect();
await nextMsg(guest, (m) => m.type === 'server:hello');
send(guest, EVENT.ROOM_JOIN, { nickname: 'Guesty', roomCode });
await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === 'Guesty'));

send(host, EVENT.PLAYER_READY, { ready: true });
await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready));
send(guest, EVENT.PLAYER_READY, { ready: true });
await nextMsg(guest, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.slot === m.payload.youSlot && p.ready));

send(host, EVENT.GAME_START, {});
await nextMsg(host, (m) => m.type === EVENT.GAME_STATE && m.payload.phase === 'playing');

let lives = 5;
let exploded = false;
for (let y = 0; y < 16 && !exploded; y += 1) {
  for (let x = 0; x < 16 && !exploded; x += 1) {
    send(host, EVENT.CELL_OPEN, { x, y });
    const msg = await nextMsg(host, (m) => m.type === EVENT.GAME_PATCH || m.type === EVENT.GAME_RESULT || m.type === EVENT.ERROR, 5000);
    if (msg.type === EVENT.GAME_PATCH) {
      lives = msg.payload.lives;
      if (lives < 5) {
        exploded = true;
      }
    }
    if (msg.type === EVENT.GAME_RESULT) {
      throw new Error('unexpected game end before respawn test');
    }
  }
}

if (!exploded) {
  throw new Error('failed to trigger mine explosion for respawn test');
}

send(host, EVENT.CELL_OPEN, { x: 0, y: 0 });
const deadLock = await nextMsg(host, (m) => m.type === EVENT.ERROR || m.type === EVENT.GAME_PATCH, 3000);
if (deadLock.type !== EVENT.ERROR || deadLock.payload.code !== 'DEAD_LOCK') {
  throw new Error('expected DEAD_LOCK immediately after explosion');
}

await sleep(3200);
send(host, EVENT.CELL_OPEN, { x: 1, y: 1 });
const afterRespawn = await nextMsg(host, (m) => m.type === EVENT.ERROR || m.type === EVENT.GAME_PATCH || m.type === EVENT.GAME_RESULT, 5000);
if (afterRespawn.type === EVENT.ERROR && afterRespawn.payload.code === 'DEAD_LOCK') {
  throw new Error('respawn lock did not expire');
}

host.close();
guest.close();
console.log(`ws_life_respawn_smoke:ok room=${roomCode} lives=${lives}`);

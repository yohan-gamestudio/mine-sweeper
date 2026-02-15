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

const nick = 'SameNick';

const p1 = await connect();
await nextMsg(p1, (m) => m.type === 'server:hello');
send(p1, EVENT.ROOM_CREATE, { nickname: nick });
const room1 = await nextMsg(p1, (m) => m.type === EVENT.ROOM_STATE);
const roomCode = room1.payload.roomCode;

const p2 = await connect();
await nextMsg(p2, (m) => m.type === 'server:hello');
send(p2, EVENT.ROOM_JOIN, { nickname: nick, roomCode });
const p2state = await nextMsg(p2, (m) => m.type === EVENT.ROOM_STATE && m.payload.youSlot !== m.payload.hostSlot);
const token2 = p2state.payload.youToken;

const p3 = await connect();
await nextMsg(p3, (m) => m.type === 'server:hello');
send(p3, EVENT.ROOM_JOIN, { nickname: nick, roomCode });
const p3state = await nextMsg(p3, (m) => m.type === EVENT.ROOM_STATE && m.payload.youSlot !== p2state.payload.youSlot && m.payload.youSlot !== m.payload.hostSlot);
const token3 = p3state.payload.youToken;

if (!token2 || !token3 || token2 === token3) {
  throw new Error('expected distinct reconnect tokens for duplicate nicknames');
}

p2.close();
p3.close();
await nextMsg(p1, (m) => m.type === EVENT.ROOM_STATE && m.payload.players.filter((p) => p.name === nick && !p.connected).length >= 2);

const amb = await connect();
await nextMsg(amb, (m) => m.type === 'server:hello');
send(amb, EVENT.ROOM_JOIN, { nickname: nick, roomCode });
const ambErr = await nextMsg(amb, (m) => m.type === EVENT.ERROR);
if (ambErr.payload.code !== 'RECONNECT_TOKEN_REQUIRED') {
  throw new Error('expected RECONNECT_TOKEN_REQUIRED for ambiguous reconnect');
}
amb.close();

const reclaim = await connect();
await nextMsg(reclaim, (m) => m.type === 'server:hello');
send(reclaim, EVENT.ROOM_JOIN, { nickname: nick, roomCode, reconnectToken: token2 });
const reclaimState = await nextMsg(reclaim, (m) => m.type === EVENT.ROOM_STATE && m.payload.youToken === token2);
if (!reclaimState.payload.players.some((p) => p.name === nick && p.connected)) {
  throw new Error('token reconnect failed');
}

reclaim.close();
p1.close();
console.log(`ws_reconnect_token_guard_smoke:ok room=${roomCode}`);

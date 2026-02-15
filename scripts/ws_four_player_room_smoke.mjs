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

const names = ['Hoster', 'Guest1', 'Guest2', 'Guest3'];
const sockets = [];

try {
  const host = await connect();
  sockets.push(host);
  await nextMsg(host, (m) => m.type === 'server:hello');
  send(host, EVENT.ROOM_CREATE, { nickname: names[0] });
  const roomCreated = await nextMsg(host, (m) => m.type === EVENT.ROOM_STATE);
  const roomCode = roomCreated.payload.roomCode;

  let latestState = roomCreated.payload;
  for (let i = 1; i < names.length; i += 1) {
    const ws = await connect();
    sockets.push(ws);
    await nextMsg(ws, (m) => m.type === 'server:hello');
    send(ws, EVENT.ROOM_JOIN, { nickname: names[i], roomCode });
    const joinedState = await nextMsg(ws, (m) => m.type === EVENT.ROOM_STATE && m.payload.players?.some((p) => p.name === names[i]));
    latestState = joinedState.payload;
  }

  if (latestState.players.filter((p) => p.name !== '-').length !== 4) {
    throw new Error('room should have 4 players');
  }

  const overflow = await connect();
  await nextMsg(overflow, (m) => m.type === 'server:hello');
  send(overflow, EVENT.ROOM_JOIN, { nickname: 'Overflow', roomCode });
  const err = await nextMsg(overflow, (m) => m.type === EVENT.ERROR);
  if (err.payload.code !== 'ROOM_FULL') {
    throw new Error('expected ROOM_FULL for 5th player');
  }
  overflow.close();

  for (const ws of sockets) {
    ws.close();
  }
  console.log(`ws_four_player_room_smoke:ok room=${roomCode}`);
} finally {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      // noop
    }
  }
}

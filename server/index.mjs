import http from 'node:http';
import { WebSocketServer } from 'ws';
import { EVENT } from '../shared/protocol.js';
import { validateClientEvent } from '../shared/validation.js';

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);

const server = http.createServer((req, res) => {
  const { url, method } = req;

  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'minesweeper-ws',
        wsPath: '/ws',
        now: Date.now()
      })
    );
    return;
  }

  if (method === 'GET' && url === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, error: 'not_found' }));
});

const wss = new WebSocketServer({ noServer: true });
const rooms = new Map();
const clients = new Map();

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function roomStatePayload(room) {
  return {
    roomCode: room.code,
    host: {
      name: room.host?.nickname ?? '-',
      ready: room.host?.ready ?? false,
      connected: Boolean(room.host?.ws && room.host.ws.readyState === 1)
    },
    guest: {
      name: room.guest?.nickname ?? '-',
      ready: room.guest?.ready ?? false,
      connected: Boolean(room.guest?.ws && room.guest.ws.readyState === 1)
    }
  };
}

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const payload = roomStatePayload(room);
  for (const slot of ['host', 'guest']) {
    const player = room[slot];
    if (player?.ws && player.ws.readyState === 1) {
      send(player.ws, EVENT.ROOM_STATE, payload);
    }
  }
}

function makeRoomCode() {
  for (let i = 0; i < 10000; i += 1) {
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    if (!rooms.has(code)) return code;
  }
  return null;
}

function leaveRoom(ws) {
  const client = clients.get(ws);
  if (!client?.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;

  if (client.slot === 'host') {
    room.host = null;
  } else if (client.slot === 'guest') {
    room.guest = null;
  }

  clients.delete(ws);

  if (!room.host && !room.guest) {
    rooms.delete(room.code);
    return;
  }
  broadcastRoomState(room.code);
}

wss.on('connection', (ws) => {
  clients.set(ws, { roomCode: null, slot: null, nickname: null });
  send(ws, 'server:hello', { ok: true });

  ws.on('message', (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      send(ws, EVENT.ERROR, { code: 'BAD_JSON', message: 'message must be valid json' });
      return;
    }

    const type = parsed?.type;
    const payload = parsed?.payload ?? {};
    if (typeof type !== 'string') {
      send(ws, EVENT.ERROR, { code: 'BAD_EVENT', message: 'type must be string' });
      return;
    }

    if (type === EVENT.ROOM_CREATE) {
      const checked = validateClientEvent(type, payload);
      if (!checked.ok) {
        send(ws, EVENT.ERROR, { code: 'INVALID_PAYLOAD', message: checked.error });
        return;
      }
      const code = makeRoomCode();
      if (!code) {
        send(ws, EVENT.ERROR, { code: 'ROOM_CODE_EXHAUSTED', message: 'unable to allocate room code' });
        return;
      }

      leaveRoom(ws);
      const room = {
        code,
        host: { ws, nickname: checked.data.nickname, ready: false },
        guest: null,
        started: false
      };
      rooms.set(code, room);
      clients.set(ws, { roomCode: code, slot: 'host', nickname: checked.data.nickname });
      broadcastRoomState(code);
      return;
    }

    if (type === EVENT.ROOM_JOIN) {
      const checked = validateClientEvent(type, payload);
      if (!checked.ok) {
        send(ws, EVENT.ERROR, { code: 'INVALID_PAYLOAD', message: checked.error });
        return;
      }
      const room = rooms.get(checked.data.roomCode);
      if (!room) {
        send(ws, EVENT.ERROR, { code: 'ROOM_NOT_FOUND', message: 'room does not exist' });
        return;
      }
      if (room.guest && room.guest.ws && room.guest.ws.readyState === 1) {
        send(ws, EVENT.ERROR, { code: 'ROOM_FULL', message: 'room is already full' });
        return;
      }

      leaveRoom(ws);
      room.guest = { ws, nickname: checked.data.nickname, ready: false };
      clients.set(ws, { roomCode: room.code, slot: 'guest', nickname: checked.data.nickname });
      broadcastRoomState(room.code);
      return;
    }

    if (type === EVENT.PLAYER_READY) {
      const checked = validateClientEvent(type, payload);
      if (!checked.ok) {
        send(ws, EVENT.ERROR, { code: 'INVALID_PAYLOAD', message: checked.error });
        return;
      }

      const client = clients.get(ws);
      if (!client?.roomCode || !client.slot) {
        send(ws, EVENT.ERROR, { code: 'NOT_IN_ROOM', message: 'join a room first' });
        return;
      }
      const room = rooms.get(client.roomCode);
      if (!room || !room[client.slot]) {
        send(ws, EVENT.ERROR, { code: 'ROOM_NOT_FOUND', message: 'room not found' });
        return;
      }
      room[client.slot].ready = checked.data.ready;
      broadcastRoomState(room.code);
      return;
    }

    if (type === EVENT.GAME_START) {
      const checked = validateClientEvent(type, payload);
      if (!checked.ok) {
        send(ws, EVENT.ERROR, { code: 'INVALID_PAYLOAD', message: checked.error });
        return;
      }
      const client = clients.get(ws);
      if (!client?.roomCode || !client.slot) {
        send(ws, EVENT.ERROR, { code: 'NOT_IN_ROOM', message: 'join a room first' });
        return;
      }
      const room = rooms.get(client.roomCode);
      if (!room) {
        send(ws, EVENT.ERROR, { code: 'ROOM_NOT_FOUND', message: 'room not found' });
        return;
      }
      if (client.slot !== 'host') {
        send(ws, EVENT.ERROR, { code: 'HOST_ONLY', message: 'only host can start game' });
        return;
      }
      if (!room.host?.ready || !room.guest?.ready) {
        send(ws, EVENT.ERROR, { code: 'NOT_READY', message: 'both players must be ready' });
        return;
      }
      room.started = true;
      const statePayload = {
        phase: 'playing',
        roomCode: room.code,
        lives: 5,
        gridSize: 16,
        mineCount: 40
      };
      for (const slot of ['host', 'guest']) {
        const player = room[slot];
        if (player?.ws && player.ws.readyState === 1) {
          send(player.ws, EVENT.GAME_STATE, statePayload);
        }
      }
      return;
    }

    send(ws, EVENT.ERROR, { code: 'UNHANDLED_EVENT', message: `unhandled event: ${type}` });
  });

  ws.on('close', () => {
    leaveRoom(ws);
  });
});

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ws server listening on http://${HOST}:${PORT}`);
});

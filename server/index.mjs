import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { EVENT } from '../shared/protocol.js';
import { validateClientEvent } from '../shared/validation.js';
import { boardToPublicCells, createBoard, openCell, toggleFlag } from './board_engine.mjs';

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

const ROOM_SLOTS = Object.freeze(['p1', 'p2', 'p3', 'p4']);
const HOST_SLOT = ROOM_SLOTS[0];
const RESPAWN_MS = 3000;
const START_LIVES = 5;
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 60000);
const ROOM_SWEEP_MS = Number(process.env.ROOM_SWEEP_MS || 5000);
const MIN_START_PLAYERS = 2;

function makeInitialPlayerState() {
  return { deadUntil: 0, explosions: 0 };
}

function makeEmptySlots() {
  return Object.fromEntries(ROOM_SLOTS.map((slot) => [slot, null]));
}

function makeDefaultSpawn(slot) {
  const idx = ROOM_SLOTS.indexOf(slot);
  return {
    x: (idx - 1.5) * 1.8,
    z: -2.8,
    yaw: 0,
    at: Date.now()
  };
}

function makeReconnectToken() {
  return randomBytes(16).toString('hex');
}

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function isPlayerConnected(player) {
  return Boolean(player?.ws && player.ws.readyState === 1);
}

function isReconnectable(player) {
  if (!player) return false;
  if (isPlayerConnected(player)) return true;
  if (!player.disconnectedAt) return false;
  return Date.now() - player.disconnectedAt <= RECONNECT_GRACE_MS;
}

function listConnectedSlots(room) {
  return ROOM_SLOTS.filter((slot) => isPlayerConnected(room.players[slot]));
}

function listReconnectableSlots(room) {
  return ROOM_SLOTS.filter((slot) => isReconnectable(room.players[slot]));
}

function roomStatePayload(room, youSlot) {
  return {
    roomCode: room.code,
    hostSlot: HOST_SLOT,
    youSlot,
    youToken: room.players[youSlot]?.reconnectToken ?? null,
    players: ROOM_SLOTS.map((slot) => ({
      slot,
      name: room.players[slot]?.nickname ?? '-',
      ready: room.players[slot]?.ready ?? false,
      connected: isPlayerConnected(room.players[slot])
    }))
  };
}

function gamePlayersPayload(room) {
  if (!room.game) return {};
  const out = {};
  for (const [slot, playerState] of Object.entries(room.game.players)) {
    out[slot] = { deadUntil: playerState.deadUntil };
  }
  return out;
}

function gamePositionsPayload(room) {
  const out = {};
  for (const [slot, pos] of Object.entries(room.positions)) {
    out[slot] = { x: pos.x, z: pos.z, yaw: pos.yaw, at: pos.at };
  }
  return out;
}

function broadcastRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const slot of ROOM_SLOTS) {
    const player = room.players[slot];
    if (isPlayerConnected(player)) {
      send(player.ws, EVENT.ROOM_STATE, roomStatePayload(room, slot));
    }
  }
}

function broadcastGameState(room) {
  if (!room.game) return;
  const payloadBase = {
    phase: room.game.phase,
    roomCode: room.code,
    lives: room.game.lives,
    gridSize: room.game.board.size,
    mineCount: room.game.board.mines,
    cells: boardToPublicCells(room.game.board),
    players: gamePlayersPayload(room),
    positions: gamePositionsPayload(room)
  };
  for (const slot of ROOM_SLOTS) {
    const player = room.players[slot];
    if (isPlayerConnected(player)) {
      send(player.ws, EVENT.GAME_STATE, { ...payloadBase, youSlot: slot });
    }
  }
}

function broadcastGamePatch(room, actorSlot, changes = []) {
  if (!room.game) return;
  const payload = {
    actor: actorSlot,
    lives: room.game.lives,
    phase: room.game.phase,
    players: gamePlayersPayload(room),
    changes
  };
  for (const slot of ROOM_SLOTS) {
    const player = room.players[slot];
    if (isPlayerConnected(player)) {
      send(player.ws, EVENT.GAME_PATCH, payload);
    }
  }
}

function broadcastGameResult(room, outcome) {
  const totalExplosions = Object.values(room.game.players).reduce((acc, p) => acc + (p.explosions || 0), 0);
  const payload = {
    outcome,
    stats: {
      elapsedSec: Math.round((Date.now() - room.game.startedAt) / 1000),
      explosions: totalExplosions
    }
  };
  for (const slot of ROOM_SLOTS) {
    const player = room.players[slot];
    if (isPlayerConnected(player)) {
      send(player.ws, EVENT.GAME_RESULT, payload);
    }
  }
}

function broadcastPlayerPos(room, slot) {
  const pos = room.positions[slot];
  if (!pos) return;
  const payload = {
    slot,
    x: pos.x,
    z: pos.z,
    yaw: pos.yaw,
    at: pos.at
  };
  for (const peerSlot of ROOM_SLOTS) {
    const player = room.players[peerSlot];
    if (isPlayerConnected(player)) {
      send(player.ws, EVENT.PLAYER_POS, payload);
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

function reclaimSlot(room, { nickname, reconnectToken }, ws) {
  if (reconnectToken) {
    for (const slot of ROOM_SLOTS) {
      const player = room.players[slot];
      if (player?.reconnectToken === reconnectToken && !player.ws && isReconnectable(player)) {
        if (player.nickname !== nickname) return { error: 'TOKEN_NICKNAME_MISMATCH' };
        player.ws = ws;
        player.disconnectedAt = 0;
        return { slot };
      }
    }
  }

  const candidates = ROOM_SLOTS.filter((slot) => {
    const player = room.players[slot];
    return player?.nickname === nickname && !player.ws && isReconnectable(player);
  });
  if (candidates.length > 1) {
    return { error: 'AMBIGUOUS_RECONNECT' };
  }
  if (candidates.length === 1) {
    const slot = candidates[0];
    room.players[slot].ws = ws;
    room.players[slot].disconnectedAt = 0;
    return { slot };
  }
  return { slot: null };
}

function findJoinableSlot(room) {
  for (const slot of ROOM_SLOTS) {
    const player = room.players[slot];
    if (!player || !isReconnectable(player)) return slot;
  }
  return null;
}

function ensureRoomPosition(room, slot) {
  if (!room.positions[slot]) {
    room.positions[slot] = makeDefaultSpawn(slot);
  }
}

function leaveRoom(ws, { disconnect = false } = {}) {
  const client = clients.get(ws);
  if (!client?.roomCode || !client.slot) return;
  const room = rooms.get(client.roomCode);
  if (!room) {
    clients.delete(ws);
    return;
  }

  const player = room.players[client.slot];
  if (player && player.nickname === client.nickname) {
    if (disconnect) {
      player.ws = null;
      player.disconnectedAt = Date.now();
      player.ready = false;
    } else {
      room.players[client.slot] = null;
      delete room.positions[client.slot];
      if (room.game?.players?.[client.slot]) {
        delete room.game.players[client.slot];
      }
    }
  }

  clients.delete(ws);

  if (listReconnectableSlots(room).length === 0) {
    rooms.delete(room.code);
    return;
  }
  broadcastRoomState(room.code);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    let changed = false;
    for (const slot of ROOM_SLOTS) {
      const player = room.players[slot];
      if (player && !player.ws && player.disconnectedAt && now - player.disconnectedAt > RECONNECT_GRACE_MS) {
        room.players[slot] = null;
        delete room.positions[slot];
        changed = true;
      }
    }

    if (listReconnectableSlots(room).length === 0) {
      rooms.delete(room.code);
      continue;
    }

    if (changed) {
      broadcastRoomState(room.code);
    }
  }
}, ROOM_SWEEP_MS);

function initGameForRoom(room) {
  const participantSlots = ROOM_SLOTS.filter((slot) => room.players[slot] && isReconnectable(room.players[slot]));
  room.game = {
    phase: 'playing',
    lives: START_LIVES,
    board: createBoard({ size: 16, mines: 40 }),
    startedAt: Date.now(),
    players: Object.fromEntries(participantSlots.map((slot) => [slot, makeInitialPlayerState()]))
  };
  for (const slot of participantSlots) {
    ensureRoomPosition(room, slot);
  }
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
        players: makeEmptySlots(),
        started: false,
        game: null,
        positions: {}
      };
      room.players[HOST_SLOT] = {
        ws,
        nickname: checked.data.nickname,
        ready: false,
        disconnectedAt: 0,
        reconnectToken: makeReconnectToken()
      };
      ensureRoomPosition(room, HOST_SLOT);

      rooms.set(code, room);
      clients.set(ws, { roomCode: code, slot: HOST_SLOT, nickname: checked.data.nickname });
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

      leaveRoom(ws);

      const reclaimed = reclaimSlot(
        room,
        { nickname: checked.data.nickname, reconnectToken: checked.data.reconnectToken },
        ws
      );
      if (reclaimed.error === 'TOKEN_NICKNAME_MISMATCH') {
        send(ws, EVENT.ERROR, { code: 'TOKEN_NICKNAME_MISMATCH', message: 'reconnect token does not match nickname' });
        return;
      }
      if (reclaimed.error === 'AMBIGUOUS_RECONNECT') {
        send(ws, EVENT.ERROR, { code: 'RECONNECT_TOKEN_REQUIRED', message: 'reconnect token required for duplicate nickname' });
        return;
      }

      let slot = reclaimed.slot;
      if (!slot) {
        if (room.started && room.game) {
          send(ws, EVENT.ERROR, { code: 'ROOM_IN_PROGRESS', message: 'only reconnect is allowed during game' });
          return;
        }
        slot = findJoinableSlot(room);
        if (!slot) {
          send(ws, EVENT.ERROR, { code: 'ROOM_FULL', message: 'room is already full' });
          return;
        }
        room.players[slot] = {
          ws,
          nickname: checked.data.nickname,
          ready: false,
          disconnectedAt: 0,
          reconnectToken: makeReconnectToken()
        };
      }

      ensureRoomPosition(room, slot);
      clients.set(ws, { roomCode: room.code, slot, nickname: checked.data.nickname });
      broadcastRoomState(room.code);

      if (room.started && room.game) {
        send(ws, EVENT.GAME_STATE, {
          phase: room.game.phase,
          roomCode: room.code,
          lives: room.game.lives,
          gridSize: room.game.board.size,
          mineCount: room.game.board.mines,
          cells: boardToPublicCells(room.game.board),
          players: gamePlayersPayload(room),
          positions: gamePositionsPayload(room),
          youSlot: slot
        });
      }
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
      if (!room || !room.players[client.slot]) {
        send(ws, EVENT.ERROR, { code: 'ROOM_NOT_FOUND', message: 'room not found' });
        return;
      }

      room.players[client.slot].ready = checked.data.ready;
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

      if (client.slot !== HOST_SLOT) {
        send(ws, EVENT.ERROR, { code: 'HOST_ONLY', message: 'only host can start game' });
        return;
      }

      const connectedSlots = listConnectedSlots(room);
      if (connectedSlots.length < MIN_START_PLAYERS) {
        send(ws, EVENT.ERROR, { code: 'NOT_ENOUGH_PLAYERS', message: 'at least 2 connected players required' });
        return;
      }

      const allReady = connectedSlots.every((slot) => room.players[slot]?.ready);
      if (!allReady) {
        send(ws, EVENT.ERROR, { code: 'NOT_READY', message: 'all connected players must be ready' });
        return;
      }

      room.started = true;
      initGameForRoom(room);
      broadcastGameState(room);
      return;
    }

    if (type === EVENT.GAME_RESTART) {
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

      if (client.slot !== HOST_SLOT) {
        send(ws, EVENT.ERROR, { code: 'HOST_ONLY', message: 'only host can restart game' });
        return;
      }

      const participantSlots = listReconnectableSlots(room);
      if (participantSlots.length === 0) {
        send(ws, EVENT.ERROR, { code: 'NOT_ENOUGH_PLAYERS', message: 'at least 1 player required' });
        return;
      }

      for (const slot of ROOM_SLOTS) {
        if (room.players[slot]) {
          room.players[slot].ready = false;
        }
      }
      room.started = true;
      initGameForRoom(room);
      broadcastRoomState(room.code);
      broadcastGameState(room);
      return;
    }

    if (type === EVENT.PLAYER_MOVE) {
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

      room.positions[client.slot] = {
        x: checked.data.x,
        z: checked.data.z,
        yaw: checked.data.yaw,
        at: Date.now()
      };
      broadcastPlayerPos(room, client.slot);
      return;
    }

    if (type === EVENT.CELL_FLAG) {
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
      if (!room?.game || room.game.phase !== 'playing') {
        send(ws, EVENT.ERROR, { code: 'GAME_NOT_ACTIVE', message: 'game is not active' });
        return;
      }

      const actorState = room.game.players[client.slot];
      if (!actorState) {
        send(ws, EVENT.ERROR, { code: 'PLAYER_NOT_ACTIVE', message: 'slot is not in active participants' });
        return;
      }

      const now = Date.now();
      if (actorState.deadUntil > now) {
        send(ws, EVENT.ERROR, { code: 'DEAD_LOCK', message: 'player is waiting for respawn' });
        return;
      }

      const result = toggleFlag(room.game.board, checked.data.x, checked.data.y);
      if (!result.ok) {
        send(ws, EVENT.ERROR, { code: 'FLAG_REJECTED', message: result.reason });
        return;
      }

      broadcastGamePatch(room, client.slot, [
        {
          type: 'cell',
          x: result.cell.x,
          y: result.cell.y,
          flagged: result.cell.flagged
        }
      ]);
      return;
    }

    if (type === EVENT.CELL_OPEN) {
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
      if (!room?.game || room.game.phase !== 'playing') {
        send(ws, EVENT.ERROR, { code: 'GAME_NOT_ACTIVE', message: 'game is not active' });
        return;
      }

      const actorState = room.game.players[client.slot];
      if (!actorState) {
        send(ws, EVENT.ERROR, { code: 'PLAYER_NOT_ACTIVE', message: 'slot is not in active participants' });
        return;
      }

      const now = Date.now();
      if (actorState.deadUntil > now) {
        send(ws, EVENT.ERROR, { code: 'DEAD_LOCK', message: 'player is waiting for respawn' });
        return;
      }

      const result = openCell(room.game.board, checked.data.x, checked.data.y);
      if (!result.ok) {
        send(ws, EVENT.ERROR, { code: 'OPEN_REJECTED', message: result.reason });
        return;
      }
      if (result.kind === 'noop') {
        return;
      }

      const changes = [
        {
          type: 'cell',
          x: result.cell.x,
          y: result.cell.y,
          opened: result.cell.opened,
          exploded: result.cell.exploded,
          flagged: result.cell.flagged,
          number: result.cell.opened && !result.cell.mine ? result.cell.number : null
        }
      ];

      if (result.kind === 'mine') {
        room.game.lives -= 1;
        actorState.explosions += 1;
        actorState.deadUntil = now + RESPAWN_MS;
        changes.push({ type: 'player', slot: client.slot, deadUntil: actorState.deadUntil });
      }

      if (result.won || room.game.lives <= 0) {
        room.game.phase = 'result';
      }

      broadcastGamePatch(room, client.slot, changes);

      if (room.game.phase === 'result') {
        broadcastGameResult(room, room.game.lives <= 0 ? 'defeat' : 'victory');
      }
      return;
    }

    if (type === EVENT.CHAT_SEND) {
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

      const chatPayload = {
        from: client.slot,
        nickname: client.nickname,
        text: checked.data.text,
        at: Date.now()
      };

      for (const slot of ROOM_SLOTS) {
        const player = room.players[slot];
        if (isPlayerConnected(player)) {
          send(player.ws, EVENT.CHAT_MESSAGE, chatPayload);
        }
      }
      return;
    }

    send(ws, EVENT.ERROR, { code: 'UNHANDLED_EVENT', message: `unhandled event: ${type}` });
  });

  ws.on('close', () => {
    leaveRoom(ws, { disconnect: true });
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

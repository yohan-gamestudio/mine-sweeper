export const EVENT = Object.freeze({
  // Client -> Server
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  PLAYER_READY: 'player:ready',
  PLAYER_MOVE: 'player:move',
  GAME_START: 'game:start',
  GAME_RESTART: 'game:restart',
  CELL_OPEN: 'cell:open',
  CELL_FLAG: 'cell:flag',
  CHAT_SEND: 'chat:send',

  // Server -> Client
  ROOM_STATE: 'room:state',
  GAME_STATE: 'game:state',
  GAME_PATCH: 'game:patch',
  PLAYER_POS: 'player:pos',
  GAME_RESULT: 'game:result',
  CHAT_MESSAGE: 'chat:message',
  ERROR: 'error'
});

export const CLIENT_EVENTS = Object.freeze([
  EVENT.ROOM_CREATE,
  EVENT.ROOM_JOIN,
  EVENT.PLAYER_READY,
  EVENT.PLAYER_MOVE,
  EVENT.GAME_START,
  EVENT.GAME_RESTART,
  EVENT.CELL_OPEN,
  EVENT.CELL_FLAG,
  EVENT.CHAT_SEND
]);

export const SERVER_EVENTS = Object.freeze([
  EVENT.ROOM_STATE,
  EVENT.GAME_STATE,
  EVENT.GAME_PATCH,
  EVENT.PLAYER_POS,
  EVENT.GAME_RESULT,
  EVENT.CHAT_MESSAGE,
  EVENT.ERROR
]);

export const EVENT_DOC = Object.freeze({
  [EVENT.ROOM_CREATE]: { nickname: 'string(2-12)' },
  [EVENT.ROOM_JOIN]: { nickname: 'string(2-12)', roomCode: 'string(4 digits)', reconnectToken: 'string(optional)' },
  [EVENT.PLAYER_READY]: { ready: 'boolean' },
  [EVENT.PLAYER_MOVE]: { x: 'number', y: 'number', z: 'number', yaw: 'number', pitch: 'number' },
  [EVENT.GAME_START]: {},
  [EVENT.GAME_RESTART]: {},
  [EVENT.CELL_OPEN]: { x: 'int', y: 'int' },
  [EVENT.CELL_FLAG]: { x: 'int', y: 'int', flagged: 'boolean' },
  [EVENT.CHAT_SEND]: { text: 'string(1-200)' },
  [EVENT.ROOM_STATE]: {
    roomCode: 'string',
    hostSlot: 'string',
    youSlot: 'string',
    youToken: 'string',
    players: 'array<{slot,name,ready,connected}>'
  },
  [EVENT.GAME_STATE]: {
    phase: '"playing"|"result"',
    lives: 'number',
    gridSize: 'number',
    mineCount: 'number',
    cells: 'array',
    players: 'object by slot',
    positions: 'object by slot'
  },
  [EVENT.GAME_PATCH]: {
    changes: 'array',
    lives: 'number',
    actor: 'string slot'
  },
  [EVENT.PLAYER_POS]: {
    slot: 'string',
    x: 'number',
    y: 'number',
    z: 'number',
    yaw: 'number',
    pitch: 'number',
    at: 'epoch-ms'
  },
  [EVENT.GAME_RESULT]: {
    outcome: '"victory"|"defeat"',
    stats: '{elapsedSec,explosions}'
  },
  [EVENT.CHAT_MESSAGE]: {
    from: 'string slot',
    nickname: 'string',
    text: 'string',
    at: 'epoch-ms'
  },
  [EVENT.ERROR]: { code: 'string', message: 'string' }
});

export function isClientEvent(type) {
  return CLIENT_EVENTS.includes(type);
}

export function isServerEvent(type) {
  return SERVER_EVENTS.includes(type);
}

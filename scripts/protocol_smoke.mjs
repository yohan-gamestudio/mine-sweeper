import { CLIENT_EVENTS, EVENT, SERVER_EVENTS, isClientEvent, isServerEvent } from '../shared/protocol.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(CLIENT_EVENTS.length > 0, 'CLIENT_EVENTS must not be empty');
assert(SERVER_EVENTS.length > 0, 'SERVER_EVENTS must not be empty');
assert(isClientEvent(EVENT.ROOM_CREATE), 'ROOM_CREATE should be recognized as client event');
assert(isServerEvent(EVENT.GAME_STATE), 'GAME_STATE should be recognized as server event');
assert(!isClientEvent(EVENT.GAME_STATE), 'GAME_STATE should not be client event');
assert(!isServerEvent(EVENT.CELL_OPEN), 'CELL_OPEN should not be server event');

console.log('protocol_smoke:ok');

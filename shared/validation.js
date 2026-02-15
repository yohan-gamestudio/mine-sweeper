import { z } from 'zod';
import { CLIENT_EVENTS, EVENT } from './protocol.js';

const nicknameSchema = z.string().trim().min(2).max(12);
const roomCodeSchema = z.string().regex(/^[0-9]{4}$/);
const cellCoordSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0)
});

export const clientPayloadSchemas = Object.freeze({
  [EVENT.ROOM_CREATE]: z.object({
    nickname: nicknameSchema
  }),
  [EVENT.ROOM_JOIN]: z.object({
    nickname: nicknameSchema,
    roomCode: roomCodeSchema
  }),
  [EVENT.PLAYER_READY]: z.object({
    ready: z.boolean()
  }),
  [EVENT.PLAYER_MOVE]: z.object({
    x: z.number().finite(),
    z: z.number().finite(),
    yaw: z.number().finite()
  }),
  [EVENT.GAME_START]: z.object({}),
  [EVENT.GAME_RESTART]: z.object({}),
  [EVENT.CELL_OPEN]: cellCoordSchema,
  [EVENT.CELL_FLAG]: cellCoordSchema.extend({
    flagged: z.boolean()
  }),
  [EVENT.CHAT_SEND]: z.object({
    text: z.string().trim().min(1).max(200)
  })
});

export function validateClientEvent(type, payload) {
  if (!CLIENT_EVENTS.includes(type)) {
    return { ok: false, error: `unknown-client-event:${type}` };
  }
  const schema = clientPayloadSchemas[type];
  if (!schema) {
    return { ok: false, error: `missing-schema:${type}` };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }
  return { ok: true, data: parsed.data };
}

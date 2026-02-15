# 3D Co-op Minesweeper

Multiplayer-first 3D minesweeper prototype.
- 3D world + first-person movement (WASD, jump, sprint)
- 2D authoritative mines board (16x16, 40 mines)
- up to 4-player room system (4-digit room code)
- shared lives, respawn lock, reconnect window, solo continuation
- teammate position sync + player collision (no push) + basic gameplay audio cues

## Stack
- Client: Vite + Three.js (`main.js`)
- Server: Node.js + `ws` (`server/index.mjs`)
- Shared protocol/validation: `shared/protocol.js`, `shared/validation.js`
- Validation: Zod
- Smoke tests: Node ws scripts + Playwright CLI scenario script

## Requirements
- Node.js 18+
- npm
- `playwright-cli` (for browser smoke pack)

## Install
```bash
npm ci
```

## Run (Dev)
Start server:
```bash
npm run server:dev
```

Start client:
```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Open:
- client: `http://127.0.0.1:5173`
- server health: `http://127.0.0.1:3000/health`

## Controls
- Move: `WASD`
- Jump: `Space`
- Sprint: `Shift`
- Open cell: Left click
- Flag toggle: Right click
- Map overlay: Hold `Tab`
- Fullscreen: `F`

## Multiplayer Flow
1. Host enters nickname and clicks `Create Room`.
2. Up to 3 guests enter nickname + room code and click `Join`.
3. All connected players click `Ready` (minimum 2 players required).
4. Host (`p1`) clicks `Start`.
5. During result, host can `Restart` same room (new board seed).

## Verification
Core ws smoke checks:
```bash
node scripts/ws_room_smoke.mjs
node scripts/ws_four_player_room_smoke.mjs
node scripts/ws_ready_start_smoke.mjs
node scripts/ws_patch_consistency_smoke.mjs
node scripts/ws_life_respawn_smoke.mjs
node scripts/ws_chat_smoke.mjs
node scripts/ws_reconnect_smoke.mjs
node scripts/ws_solo_timeout_smoke.mjs
node scripts/ws_restart_smoke.mjs
```

Playwright CLI scenario pack:
```bash
scripts/playwright_smoke_scenarios.sh
```

## Project Layout
- `main.js`: client game, ui overlays, websocket wiring
- `style.css`: ui styles
- `server/index.mjs`: ws server, rooms, authoritative game lifecycle
- `server/board_engine.mjs`: pure board rules
- `shared/protocol.js`: event schema/constants
- `shared/validation.js`: zod payload validation
- `scripts/*.mjs`: smoke scripts
- `PRD.md`, `SCREEN_SPEC.md`: product/screen requirements
- `QA_CHECKLIST.md`: compliance sweep

## Notes
- Reconnect slot recovery uses per-slot reconnect token.

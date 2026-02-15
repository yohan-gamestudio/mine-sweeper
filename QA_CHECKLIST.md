# QA Checklist (PRD Compliance Sweep)

Checked against: `PRD.md`, `SCREEN_SPEC.md`
Checked at: 2026-02-16

## 1) Screen Coverage
- [x] Home/Lobby Entry screen exists.
- [x] Room Lobby screen exists.
- [x] In-game HUD screen exists.
- [x] Tab map overlay exists (hold Tab).
- [x] Result/Restart screen exists.

## 2) Room/Lobby Rules
- [x] Room create/join with 4-digit code.
- [x] Max 4 players per room.
- [x] Ready/Unready state per player.
- [x] Host-only start gate.
- [x] Duplicate nickname allowed.
- [x] Nickname validation (2-12 chars).
- [x] Connection status displayed in HUD.

## 3) Core Gameplay Rules
- [x] Server-authoritative open/flag handling.
- [x] 16x16 board, 40 mines.
- [x] 8-direction mine numbers.
- [x] No first-click safety.
- [x] Flag toggle via right click.
- [x] Flagged cell open blocked.
- [x] No chain-open.
- [x] Shared lives (5) and defeat at 0.
- [x] Mine hit => 3s dead-lock + respawn timer.
- [x] Result screen with victory/defeat and stats.
- [x] Restart in same room with new board seed (host authoritative).

## 4) Reconnect / Continuation
- [x] Reconnect window: 60s grace.
- [x] Reconnect restores slot and active game snapshot.
- [x] Timeout cleanup removes stale disconnected slot.
- [x] Remaining player can continue solo after teammate timeout.

## 5) Communication
- [x] Team chat exists (room-local only).
- [x] Chat reset on new match start/restart.

## 6) Visual/Interaction Requirements
- [x] 3D world + first-person movement + jump + sprint.
- [x] Mine-like protruding visual on unopened cells.
- [x] 3D flag object planted on cell center.
- [x] Exploded mine cell visualized as burnt tile.
- [x] Map overlay is view-only and centered translucent panel.
- [x] Map shows opened/flagged/exploded marks and local position.

## 7) Known Gaps (Not Fully PRD-complete)
- [x] Teammate position sync in world/map implemented.
- [x] Player-player collision (with no push) implemented.
- [x] Audio set (explosion/flag/footstep/jump) implemented.
- [x] Reconnect identity uses per-slot reconnect token (duplicate nicknames handled).

## 8) Verification Artifacts
- Backend smoke scripts:
  - `scripts/ws_room_smoke.mjs`
  - `scripts/ws_ready_start_smoke.mjs`
  - `scripts/ws_four_player_room_smoke.mjs`
  - `scripts/ws_patch_consistency_smoke.mjs`
  - `scripts/ws_life_respawn_smoke.mjs`
  - `scripts/ws_chat_smoke.mjs`
  - `scripts/ws_reconnect_smoke.mjs`
  - `scripts/ws_solo_timeout_smoke.mjs`
  - `scripts/ws_restart_smoke.mjs`
- Playwright CLI snapshots/artifacts under `.playwright/snapshots/` and `.playwright/artifacts/`.

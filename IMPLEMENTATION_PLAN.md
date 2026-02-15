# Multiplayer Implementation Plan (PRD-driven)

Goal: implement the PRD in small, verifiable steps.

Rules for every step:
1. Implement only the scoped step.
2. Run Playwright CLI verification for that step.
3. Fix first failing behavior/error.
4. Commit only step-related changes.

---

## Task 1. Frontend State Refactor (Single -> Screen Flow)

### Step 1.1 Screen State Machine
- Add app-level states: `entry`, `lobby`, `playing`, `result`.
- Keep current 3D scene for `playing`.
- Add minimal `entry/lobby/result` overlays from `SCREEN_SPEC.md`.
- Verification:
- `playwright-cli open http://127.0.0.1:5173/`
- `playwright-cli snapshot --filename=.playwright/snapshots/t1s1-entry.txt`
- Commit:
- `feat: add frontend screen state machine for multiplayer flow`

### Step 1.2 UI Event Wiring
- Wire buttons for create/join/ready/start/restart with local mock handlers.
- Persist nickname locally through screen transitions.
- Verification:
- Click through all screen transitions and capture snapshots.
- Commit:
- `feat: wire local lobby flow interactions`

### Step 1.3 Mode Guards
- Ensure in-game controls only work in `playing`.
- Ensure result actions only in `result`.
- Verification:
- Playwright checks for blocked interactions in wrong states.
- Commit:
- `fix: enforce screen-mode interaction guards`

---

## Task 2. Shared Game Protocol and Types

### Step 2.1 Shared Message Schema
- Create shared message constants/types for:
- room create/join/ready/start/restart
- cell open/flag
- chat send
- state snapshot/patch/result
- Verify by static build and import from both client/server.
- Commit:
- `feat: add shared websocket protocol schema`

### Step 2.2 Validation Layer
- Add payload validation (zod) on server boundary.
- Add client-side shape checks for dev assertions.
- Verification:
- Send invalid payload with `playwright-cli run-code` and assert handled error path.
- Commit:
- `feat: add protocol payload validation`

---

## Task 3. Multiplayer Server Skeleton

### Step 3.1 Node WebSocket Server Boot
- Add server process and WebSocket endpoint.
- Add health endpoint.
- Verification:
- `curl` health endpoint + browser connect check.
- Commit:
- `feat: bootstrap websocket game server`

### Step 3.2 Room Lifecycle
- Implement room create/join with 4-digit code + collision retry.
- In-memory room registry (max 2 players).
- Verification:
- Two browser sessions create/join same room via Playwright CLI.
- Commit:
- `feat: implement room create/join lifecycle`

### Step 3.3 Ready/Start Lifecycle
- Implement ready toggles and host-only start gate.
- Verification:
- Two-session ready flow snapshots before/after start.
- Commit:
- `feat: implement lobby ready/start synchronization`

---

## Task 4. Server-authoritative Game Engine

### Step 4.1 Extract Board Engine Module
- Move mines logic into pure server module:
- board generation, numbers, open/flag rules, win/lose.
- Verification:
- unit tests for deterministic board behavior.
- Commit:
- `feat: add server board engine core`

### Step 4.2 Life/Death/Respawn Logic
- Implement shared lives, death lock (3s), respawn at spawn.
- Verification:
- server unit tests + two-client runtime check.
- Commit:
- `feat: implement team life and respawn rules`

### Step 4.3 Snapshot + Patch Broadcasting
- Send initial snapshot on join/start.
- Send delta patch on each input.
- Verification:
- two-session consistency check after open/flag actions.
- Commit:
- `feat: add authoritative state snapshot and patch broadcast`

---

## Task 5. Client Networking Integration

### Step 5.1 Connect/Session State
- Add connection state UI and reconnect timer.
- Verification:
- kill/restart server and confirm UI state transitions.
- Commit:
- `feat: add client connection and reconnect state handling`

### Step 5.2 Lobby Network Wiring
- Replace mock lobby actions with socket events.
- Verification:
- host/guest sessions reflect same room/ready state.
- Commit:
- `feat: wire lobby ui to websocket events`

### Step 5.3 In-game Input -> Server Intents
- Send `openCell`/`flagCell` as intents only.
- Apply server patches to render world.
- Verification:
- interleaved host/guest actions produce consistent board.
- Commit:
- `feat: route gameplay inputs through authoritative server`

---

## Task 6. Chat, Reconnect, Solo Continuation

### Step 6.1 Team Chat
- Implement teammate-only in-match chat, reset on restart.
- Verification:
- two sessions chat exchange + restart reset check.
- Commit:
- `feat: add in-room match chat channel`

### Step 6.2 Reconnect Window
- Implement reconnect within 60s restoring player slot/state.
- Verification:
- close one session, reconnect within timeout, verify restore.
- Commit:
- `feat: implement 60s reconnect recovery`

### Step 6.3 Timeout Solo Continue
- After timeout, remaining player can continue and win.
- Verification:
- simulate timeout and clear board solo.
- Commit:
- `feat: allow solo continuation after reconnect timeout`

---

## Task 7. Finalization and QA

### Step 7.1 PRD Compliance Sweep
- Cross-check every PRD rule and screen requirement.
- Verification:
- checklist pass recorded in `QA_CHECKLIST.md`.
- Commit:
- `chore: complete prd compliance sweep`

### Step 7.2 Playwright Scenario Pack
- Save repeatable smoke scripts for:
- host flow, guest flow, in-game sync, reconnect, restart.
- Verification:
- run all scripts green.
- Commit:
- `test: add multiplayer playwright smoke scenarios`

### Step 7.3 Release Baseline
- Update README run instructions for client/server.
- Verification:
- clean install and run from scratch.
- Commit:
- `docs: add multiplayer runbook and release baseline`

---

## Step Commit Policy
- One step = one commit.
- Commit format: `type: task-step summary`.
- No unrelated file changes per step.

# 3D Co-op Minesweeper PRD (MVP)

## 1. Product Goal
- Build a 2-player cooperative game with Minecraft-like first-person movement in a 3D world.
- Keep minesweeper logic on a 2D grid.
- Focus on calm puzzle collaboration with light movement risk.

## 2. Core Concept
- World is 3D and player-controlled in first person.
- Mine logic is 2D (`16x16`).
- Visuals: all unopened cells look like slightly protruding mine-like blocks.
- True mine/safe state is hidden and decided by server logic.

## 3. Platform and Session
- Multiplayer only, room-based.
- Max players per room: 2.
- Room join method: 4-digit numeric code.
- Code generation policy: regenerate on collision.
- Single server region.

## 4. Lobby Rules
- Nickname length: 2 to 12 characters.
- Duplicate nicknames allowed.
- Nickname can be changed in lobby, locked after game start.
- Both players must press Ready before match start.
- Host permissions: start/restart only.

## 5. Gameplay Rules
- Grid size: `16x16`.
- Mine count: `40`.
- Adjacency: 8-direction (classic).
- All cells start closed.
- No first-click safety.
- Win condition: all safe cells opened.
- Lose condition: shared team lives reach 0 (instant game over).
- Team lives: 5.
- Respawn delay after mine hit: 3 seconds.
- Respawn point: initial spawn.
- If a player disconnects: allow reconnect within 60 seconds to same state.
- If reconnect timeout expires: remaining player continues solo and can still win.

## 6. World Interaction
- Interaction is on-site only (no map click interaction).
- Interaction range: 3 blocks.
- Controls:
- Left click: open cell.
- Right click: place/remove flag (toggle).
- Feet cell interaction is allowed for both open and flag.
- Flagged cells cannot be opened until unflagged.
- No chain-open for zero cells.
- No chording.

## 7. Cell State Presentation
- Safe cell opened: protruding mine-like object disappears, flat tile remains.
- Mine exploded: cell becomes burnt/blackened tile.
- Exploded mine cell: no further interaction.
- Opened safe cell: interaction still allowed (including flag toggle), but win count remains satisfied.
- Flag is a physical 3D object visibly planted on the cell.
- Even with flag, stepping/opening a mine still explodes (flag is informational only).

## 8. Death and Spectator
- On explosion: team life -1, player enters death state.
- During death (3s): full spectator lock.
- No movement or interaction allowed.
- Camera fixed at player death position.

## 9. Map Overlay (Tab)
- Hold `Tab` to show a large centered semi-transparent 2D map overlay.
- Releasing `Tab` closes map.
- Map is view-only (no clicking).
- While map is open:
- Movement allowed.
- Mouse look/rotation disabled.
- Map displays:
- Opened cell info only (closed cell info hidden).
- Player own position.
- Teammate position.
- Flags (team-shared).
- Exploded mine cells marked as `X`.

## 10. Communication
- Text chat included.
- Visibility: room teammates only.
- Chat log is per-match temporary; reset on restart.

## 11. UI Scope (MVP)
- Display only:
- Team lives.
- Player state (alive/dead).
- Room code.
- Connection state.
- Do not show remaining mine counter.
- No mandatory onboarding/tutorial overlay.

## 12. Movement and Physics
- First-person character movement (Minecraft-like feel).
- Jump enabled.
- Sprint enabled (`Shift`).
- Flat terrain only.
- Player-player collision enabled.
- No push force.

## 13. Audio Scope (MVP)
- Explosion sound.
- Flag place/remove sounds.
- Footstep and jump sounds.

## 14. Round Flow
- End-of-round returns to result view, then same room can restart immediately.
- Restart always generates a new map seed.
- Mine positions remain hidden even after game end.

## 15. Networking and Authority
- Server-authoritative logic for open/flag/lives/win/lose.
- Client only sends intent; server validates and broadcasts state updates.

## 16. MVP Screen List
1. Home/Lobby Entry Screen
2. Room Lobby Screen (ready/start)
3. In-Game HUD Screen
4. Tab Map Overlay (in-game overlay)
5. Result/Restart Screen

Total screens for MVP: 5 (`4 full screens + 1 in-game overlay`).

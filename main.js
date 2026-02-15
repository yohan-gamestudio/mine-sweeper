import * as THREE from 'three';
import { EVENT } from './shared/protocol.js';
import { validateClientEvent } from './shared/validation.js';

const GRID_SIZE = 16;
const MINE_COUNT = 40;
const CELL_SIZE = 4.4;
const INTERACT_RANGE_BLOCKS = 3;
const INTERACT_RANGE_UNITS = INTERACT_RANGE_BLOCKS * CELL_SIZE;
const MAX_LIVES = 5;
const RESPAWN_SECONDS = 3;
const PLAYER_HEIGHT = 1.7;
const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7;
const JUMP_VELOCITY = 6;
const GRAVITY = 20;
const PROTOCOL_EVENT_COUNT = Object.keys(EVENT).length;
const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3000/ws`;

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="hud">
    <div>Lives: <span id="hud-lives" class="value"></span></div>
    <div>Status: <span id="hud-status" class="value"></span></div>
    <div>Room: <span id="hud-room" class="value">----</span></div>
    <div>Connection: <span id="hud-conn" class="value">LOCAL</span></div>
    <div id="hud-tip">Click to lock pointer</div>
  </div>
  <div id="crosshair">+</div>
  <div id="overlay">
    <div id="entry-card">
      <h1>3D Co-op Minesweeper</h1>
      <p>Nickname (2-12 chars)</p>
      <p><input id="nickname-input" maxlength="12" value="Player1" /></p>
      <p><button id="btn-create">Create Room</button></p>
      <p>Join by room code</p>
      <p>
        <input id="join-code-input" maxlength="4" placeholder="1234" />
        <button id="btn-join">Join</button>
      </p>
      <p id="entry-error"></p>
    </div>
    <div id="lobby-card" class="hidden">
      <h1>Room Lobby</h1>
      <p>Room Code: <strong id="lobby-room-code">----</strong></p>
      <p>Host: <span id="lobby-host-name">-</span> (<span id="lobby-host-ready">Not Ready</span>)</p>
      <p>Guest: <span id="lobby-guest-name">Teammate</span> (<span id="lobby-guest-ready">Ready</span>)</p>
      <p>
        <button id="btn-ready">Ready</button>
        <button id="btn-start" disabled>Start</button>
        <button id="btn-leave">Leave</button>
      </p>
    </div>
    <div id="result-card" class="hidden">
      <h1 id="result-title"></h1>
      <p id="result-sub"></p>
      <p>
        <button id="btn-result-restart">Restart</button>
        <button id="btn-result-lobby">Back to Lobby</button>
      </p>
      <p>Press R to restart quickly.</p>
    </div>
  </div>
  <div id="map-wrap" class="hidden">
    <div id="map-panel">
      <canvas id="map-canvas"></canvas>
    </div>
  </div>
`;

const hudLives = document.querySelector('#hud-lives');
const hudStatus = document.querySelector('#hud-status');
const hudRoom = document.querySelector('#hud-room');
const hudConn = document.querySelector('#hud-conn');
const hudTip = document.querySelector('#hud-tip');
const entryCard = document.querySelector('#entry-card');
const lobbyCard = document.querySelector('#lobby-card');
const nicknameInput = document.querySelector('#nickname-input');
const joinCodeInput = document.querySelector('#join-code-input');
const entryError = document.querySelector('#entry-error');
const lobbyRoomCode = document.querySelector('#lobby-room-code');
const lobbyHostName = document.querySelector('#lobby-host-name');
const lobbyHostReady = document.querySelector('#lobby-host-ready');
const lobbyGuestName = document.querySelector('#lobby-guest-name');
const lobbyGuestReady = document.querySelector('#lobby-guest-ready');
const btnCreate = document.querySelector('#btn-create');
const btnJoin = document.querySelector('#btn-join');
const btnReady = document.querySelector('#btn-ready');
const btnStart = document.querySelector('#btn-start');
const btnLeave = document.querySelector('#btn-leave');
const btnResultRestart = document.querySelector('#btn-result-restart');
const btnResultLobby = document.querySelector('#btn-result-lobby');
const resultCard = document.querySelector('#result-card');
const resultTitle = document.querySelector('#result-title');
const resultSub = document.querySelector('#result-sub');
const mapWrap = document.querySelector('#map-wrap');
const mapCanvas = document.querySelector('#map-canvas');
const mapCtx = mapCanvas.getContext('2d');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c1ff);
scene.fog = new THREE.Fog(0x87c1ff, 28, 80);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(0, PLAYER_HEIGHT, 0);

const lightAmbient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(lightAmbient);
const lightDir = new THREE.DirectionalLight(0xffffff, 0.9);
lightDir.position.set(12, 24, 10);
scene.add(lightDir);

const worldSize = GRID_SIZE * CELL_SIZE;
const boardMin = -worldSize / 2;
const boardMax = worldSize / 2;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(worldSize + 28, worldSize + 28),
  new THREE.MeshStandardMaterial({ color: 0x78b55a, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const boardGroup = new THREE.Group();
scene.add(boardGroup);

const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x5f8f43, roughness: 0.9 });
const safeOpenedMaterial = new THREE.MeshStandardMaterial({ color: 0xa8c781, roughness: 0.84 });
const explodedMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1.0 });
const mineCapMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.68, metalness: 0.16 });
const flagPoleMaterial = new THREE.MeshStandardMaterial({ color: 0xc7c7c7, roughness: 0.5 });
const flagClothMaterial = new THREE.MeshStandardMaterial({ color: 0xe53737, roughness: 0.8 });
const teammateShirtMaterial = new THREE.MeshStandardMaterial({ color: 0x4d86d6, roughness: 0.72 });
const teammateSkinMaterial = new THREE.MeshStandardMaterial({ color: 0xf0d1ac, roughness: 0.76 });
const teammatePantsMaterial = new THREE.MeshStandardMaterial({ color: 0x3f5f8f, roughness: 0.8 });
const teammateShoeMaterial = new THREE.MeshStandardMaterial({ color: 0x252a31, roughness: 0.84 });
const teammateHairMaterial = new THREE.MeshStandardMaterial({ color: 0x2f241c, roughness: 0.88 });
const teammateFaceDetailMaterial = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.7 });

const raycaster = new THREE.Raycaster();
const baseMeshes = [];
const fxBursts = [];
const upAxis = new THREE.Vector3(0, 1, 0);

function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(9,12,18,0.72)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.strokeRect(1, 9, 254, 46);
  ctx.font = 'bold 28px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7fbff';
  ctx.fillText(text, 128, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.8, 0.45, 1);
  return sprite;
}

function createTeammateAvatar() {
  const group = new THREE.Group();

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), teammateSkinMaterial);
  head.position.y = 1.72;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), teammateHairMaterial);
  hair.position.set(0, 1.88, 0);
  group.add(hair);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.32), teammateShirtMaterial);
  body.position.y = 1.2;
  group.add(body);

  const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), teammateShirtMaterial);
  armLeft.position.set(-0.36, 1.22, 0);
  group.add(armLeft);

  const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), teammateShirtMaterial);
  armRight.position.set(0.36, 1.22, 0);
  group.add(armRight);

  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), teammatePantsMaterial);
  legLeft.position.set(-0.13, 0.7, 0);
  group.add(legLeft);

  const legRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.2), teammatePantsMaterial);
  legRight.position.set(0.13, 0.7, 0);
  group.add(legRight);

  const shoeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.28), teammateShoeMaterial);
  shoeLeft.position.set(-0.13, 0.31, 0.02);
  group.add(shoeLeft);

  const shoeRight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.28), teammateShoeMaterial);
  shoeRight.position.set(0.13, 0.31, 0.02);
  group.add(shoeRight);

  const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), teammateFaceDetailMaterial);
  eyeLeft.position.set(-0.08, 1.74, -0.24);
  group.add(eyeLeft);

  const eyeRight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), teammateFaceDetailMaterial);
  eyeRight.position.set(0.08, 1.74, -0.24);
  group.add(eyeRight);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.02), teammateFaceDetailMaterial);
  mouth.position.set(0, 1.62, -0.24);
  group.add(mouth);

  const nameTag = makeNameSprite('Teammate');
  nameTag.position.set(0, 2.2, 0);
  group.add(nameTag);

  return { group, nameTag, armLeft, armRight, legLeft, legRight };
}

const teammateAvatar = createTeammateAvatar();
scene.add(teammateAvatar.group);

const state = {
  screen: 'entry',
  mode: 'paused',
  mapOpen: false,
  pointerLocked: false,
  yaw: 0,
  pitch: 0,
  velocityY: 0,
  lives: MAX_LIVES,
  dead: false,
  deadLeft: 0,
  deadPos: new THREE.Vector3(),
  deadYaw: 0,
  deadPitch: 0,
  safeOpened: 0,
  totalSafe: GRID_SIZE * GRID_SIZE - MINE_COUNT,
  startTimeMs: 0,
  elapsedMs: 0,
  connState: 'LOCAL',
  reconnectLeft: 0,
  reconnectAt: 0,
  nickname: 'Player1',
  roomCode: '----',
  localReady: false,
  hostName: 'Host',
  hostReady: false,
  guestName: 'Guest',
  guestReady: false,
  mySlot: 'host',
  authoritative: false,
  teammatePos: new THREE.Vector2(1, 1),
  cells: [],
  cellsFlat: []
};

let socket = null;
const pendingSocketMessages = [];

function setConnState(next) {
  state.connState = next;
}

function connectSocket(force = false) {
  if (socket && socket.readyState <= 1 && !force) return;
  try {
    socket?.close();
  } catch {
    // noop
  }
  setConnState('CONNECTING');
  socket = new WebSocket(WS_URL);
  socket.addEventListener('open', () => {
    setConnState('CONNECTED');
    state.reconnectLeft = 0;
    state.reconnectAt = 0;
    while (pendingSocketMessages.length > 0) {
      const message = pendingSocketMessages.shift();
      socket.send(JSON.stringify(message));
    }
  });
  socket.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const type = msg?.type;
    const payload = msg?.payload ?? {};
    if (type === EVENT.ROOM_STATE) {
      state.roomCode = payload.roomCode ?? state.roomCode;
      state.hostName = payload.host?.name ?? '-';
      state.hostReady = Boolean(payload.host?.ready);
      state.guestName = payload.guest?.name ?? '-';
      state.guestReady = Boolean(payload.guest?.ready);
      if (state.nickname === state.hostName) {
        state.mySlot = 'host';
        state.localReady = state.hostReady;
      } else if (state.nickname === state.guestName) {
        state.mySlot = 'guest';
        state.localReady = state.guestReady;
      }
      renderScreenState();
      return;
    }
    if (type === EVENT.GAME_STATE) {
      resetGame();
      applyServerSnapshot(payload);
      renderScreenState();
      safeRequestPointerLock();
      return;
    }
    if (type === EVENT.GAME_PATCH) {
      applyServerGamePatch(payload);
      return;
    }
    if (type === EVENT.GAME_RESULT) {
      state.mode = payload?.outcome === 'victory' ? 'won' : 'lost';
      state.screen = 'result';
      resultTitle.textContent = payload?.outcome === 'victory' ? 'VICTORY' : 'DEFEAT';
      resultSub.textContent = `Elapsed ${payload?.stats?.elapsedSec ?? 0}s / Explosions ${payload?.stats?.explosions ?? 0}`;
      renderScreenState();
      document.exitPointerLock?.();
      return;
    }
    if (type === EVENT.ERROR) {
      const text = payload?.message || 'server error';
      if (state.screen === 'entry') {
        entryError.textContent = text;
      } else {
        hudTip.textContent = `Server: ${text}`;
      }
    }
  });
  socket.addEventListener('close', () => {
    if (state.screen === 'entry') {
      setConnState('LOCAL');
      return;
    }
    setConnState('RECONNECTING');
    state.reconnectAt = Date.now() + 60000;
    state.reconnectLeft = 60;
  });
  socket.addEventListener('error', () => {
    if (state.screen !== 'entry') {
      setConnState('RECONNECTING');
      state.reconnectAt = Date.now() + 60000;
      state.reconnectLeft = 60;
    }
  });
}

function sendSocketEvent(type, payload) {
  if (!socket || socket.readyState !== 1) {
    pendingSocketMessages.push({ type, payload });
    return false;
  }
  socket.send(JSON.stringify({ type, payload }));
  return true;
}

function worldFromCell(x, y) {
  return {
    x: boardMin + x * CELL_SIZE + CELL_SIZE * 0.5,
    z: boardMin + y * CELL_SIZE + CELL_SIZE * 0.5
  };
}

function cellFromWorld(x, z) {
  const cx = Math.floor((x - boardMin) / CELL_SIZE);
  const cy = Math.floor((z - boardMin) / CELL_SIZE);
  if (cx < 0 || cy < 0 || cx >= GRID_SIZE || cy >= GRID_SIZE) {
    return null;
  }
  return { x: cx, y: cy };
}

function neighbors8(x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < GRID_SIZE && ny < GRID_SIZE) {
        out.push({ x: nx, y: ny });
      }
    }
  }
  return out;
}

function randomMineSet() {
  const ids = new Set();
  while (ids.size < MINE_COUNT) {
    ids.add(Math.floor(Math.random() * GRID_SIZE * GRID_SIZE));
  }
  return ids;
}

function buildBoard() {
  boardGroup.clear();
  baseMeshes.length = 0;
  state.cells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE));
  state.cellsFlat = [];

  const mineIds = randomMineSet();

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const id = y * GRID_SIZE + x;
      const mine = mineIds.has(id);
      const pos = worldFromCell(x, y);

      const tileSize = CELL_SIZE * 0.96;
      const base = new THREE.Mesh(new THREE.BoxGeometry(tileSize, 0.18, tileSize), baseMaterial);
      base.position.set(pos.x, 0.09, pos.z);
      base.userData = { x, y };
      boardGroup.add(base);
      baseMeshes.push(base);

      // Slightly smaller mine cap on a larger tile.
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(CELL_SIZE * 0.15, CELL_SIZE * 0.2, 0.24, 14),
        mineCapMaterial
      );
      cap.position.set(pos.x, 0.27, pos.z);
      boardGroup.add(cap);

      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.95, 8), flagPoleMaterial);
      pole.position.set(0, 0.56, 0);
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.06), flagClothMaterial);
      cloth.position.set(0.22, 0.72, 0);
      flag.add(pole);
      flag.add(cloth);
      flag.position.set(pos.x, 0, pos.z);
      flag.visible = false;
      boardGroup.add(flag);

      const cell = {
        x,
        y,
        mine,
        number: 0,
        opened: false,
        exploded: false,
        flagged: false,
        base,
        cap,
        flag
      };

      state.cells[y][x] = cell;
      state.cellsFlat.push(cell);
    }
  }

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const cell = state.cells[y][x];
      const n = neighbors8(x, y).reduce((acc, p) => acc + (state.cells[p.y][p.x].mine ? 1 : 0), 0);
      cell.number = n;
    }
  }
}

function resetGame() {
  state.mode = 'playing';
  state.screen = 'playing';
  state.authoritative = false;
  state.mapOpen = false;
  state.lives = MAX_LIVES;
  state.dead = false;
  state.deadLeft = 0;
  state.velocityY = 0;
  state.safeOpened = 0;
  state.totalSafe = GRID_SIZE * GRID_SIZE - MINE_COUNT;
  state.startTimeMs = performance.now();
  state.elapsedMs = 0;
  state.teammatePos.set(Math.floor(GRID_SIZE / 2), Math.floor(GRID_SIZE / 2) - 2);

  buildBoard();

  const center = worldFromCell(Math.floor(GRID_SIZE / 2), Math.floor(GRID_SIZE / 2));
  camera.position.set(center.x, PLAYER_HEIGHT, center.z);
  state.yaw = 0;
  state.pitch = 0;
  resultCard.classList.add('hidden');
  entryCard.classList.add('hidden');
  lobbyCard.classList.add('hidden');
  mapWrap.classList.add('hidden');
}

resetGame();
state.mode = 'paused';
state.screen = 'entry';
entryCard.classList.remove('hidden');
lobbyCard.classList.add('hidden');

function setStatusText() {
  hudLives.textContent = `${state.lives}`;
  hudRoom.textContent = state.roomCode;
  hudConn.textContent = state.connState === 'RECONNECTING' ? `RECONNECT ${state.reconnectLeft}s` : state.connState;
  if (state.mode === 'won') {
    hudStatus.textContent = 'WON';
  } else if (state.mode === 'lost') {
    hudStatus.textContent = 'LOST';
  } else if (state.dead) {
    hudStatus.textContent = `DEAD (${Math.ceil(state.deadLeft)}s)`;
  } else {
    hudStatus.textContent = 'ALIVE';
  }
}

const keys = new Set();

function setPointerLockText() {
  if (!state.pointerLocked) {
    hudTip.textContent = state.screen === 'playing' ? 'Click to lock pointer' : 'Configure room in overlay';
  } else if (state.mapOpen) {
    hudTip.textContent = 'Map open: movement allowed, look locked';
  } else {
    hudTip.textContent = `LMB open | RMB flag | Tab map | Lives ${state.lives}`;
  }
}

function renderScreenState() {
  entryCard.classList.toggle('hidden', state.screen !== 'entry');
  lobbyCard.classList.toggle('hidden', state.screen !== 'lobby');
  resultCard.classList.toggle('hidden', state.screen !== 'result');

  lobbyRoomCode.textContent = state.roomCode;
  lobbyHostName.textContent = state.hostName;
  lobbyHostReady.textContent = state.hostReady ? 'Ready' : 'Not Ready';
  lobbyGuestName.textContent = state.guestName;
  lobbyGuestReady.textContent = state.guestReady ? 'Ready' : 'Not Ready';
  btnReady.textContent = state.localReady ? 'Unready' : 'Ready';
  btnStart.disabled = !state.localReady;
}

function safeRequestPointerLock() {
  try {
    const maybePromise = renderer.domElement.requestPointerLock();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {});
    }
  } catch {
    // Ignore pointer lock failures in restricted/headless environments.
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function canInteractCell(cell) {
  if (!cell) return false;
  if (cell.exploded) return false;
  return true;
}

function applyCellVisual(cell) {
  cell.flag.visible = cell.flagged;
  if (cell.exploded) {
    cell.cap.visible = false;
    cell.base.material = explodedMaterial;
    return;
  }
  if (cell.opened && !cell.mine) {
    cell.cap.visible = false;
    cell.base.material = safeOpenedMaterial;
  } else {
    cell.cap.visible = true;
    cell.base.material = baseMaterial;
  }
}

function applyServerCellPatch(patch) {
  if (typeof patch?.x !== 'number' || typeof patch?.y !== 'number') return;
  const cell = state.cells?.[patch.y]?.[patch.x];
  if (!cell) return;
  if (typeof patch.flagged === 'boolean') cell.flagged = patch.flagged;
  if (typeof patch.opened === 'boolean') cell.opened = patch.opened;
  if (typeof patch.exploded === 'boolean') cell.exploded = patch.exploded;
  if (typeof patch.number === 'number') cell.number = patch.number;
  if (cell.exploded) cell.mine = true;
  applyCellVisual(cell);
}

function applyServerSnapshot(payload) {
  if (!payload) return;
  state.authoritative = true;
  state.mode = payload.phase === 'playing' ? 'playing' : state.mode;
  if (typeof payload.lives === 'number') state.lives = payload.lives;
  if (Array.isArray(payload.cells)) {
    for (const row of payload.cells) {
      if (!Array.isArray(row)) continue;
      for (const c of row) {
        applyServerCellPatch(c);
      }
    }
  }
  const myPlayer = payload.players?.[state.mySlot];
  if (myPlayer?.deadUntil && myPlayer.deadUntil > Date.now()) {
    state.dead = true;
    state.deadLeft = (myPlayer.deadUntil - Date.now()) / 1000;
    state.deadPos.copy(camera.position);
  } else {
    state.dead = false;
    state.deadLeft = 0;
  }
}

function applyServerGamePatch(payload) {
  if (!payload) return;
  if (typeof payload.lives === 'number') state.lives = payload.lives;
  if (Array.isArray(payload.changes)) {
    for (const change of payload.changes) {
      if (change.type === 'cell') {
        applyServerCellPatch(change);
      }
      if (change.type === 'player' && change.slot === state.mySlot && change.deadUntil > Date.now()) {
        state.dead = true;
        state.deadLeft = (change.deadUntil - Date.now()) / 1000;
        state.deadPos.copy(camera.position);
      }
    }
  }
  if (payload.phase === 'result') {
    state.mode = 'paused';
  }
}

function addExplosionBurst(cell) {
  const p = worldFromCell(cell.x, cell.y);
  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff8b5d, transparent: true, opacity: 0.9 })
  );
  burst.position.set(p.x, 0.45, p.z);
  scene.add(burst);
  fxBursts.push({ mesh: burst, t: 0 });
}

function openCell(cell) {
  if (state.mode !== 'playing' || state.dead) return;
  if (!canInteractCell(cell)) return;
  if (cell.flagged) return;

  if (cell.mine) {
    cell.exploded = true;
    applyCellVisual(cell);
    addExplosionBurst(cell);
    state.lives -= 1;
    state.dead = true;
    state.deadLeft = RESPAWN_SECONDS;
    state.deadPos.copy(camera.position);
    state.deadYaw = state.yaw;
    state.deadPitch = state.pitch;

    if (state.lives <= 0) {
      state.mode = 'lost';
      state.screen = 'result';
      state.dead = false;
      resultTitle.textContent = 'DEFEAT';
      resultSub.textContent = `Lives exhausted. Explosions: ${MAX_LIVES}`;
      renderScreenState();
      document.exitPointerLock?.();
    }
    return;
  }

  if (!cell.opened) {
    cell.opened = true;
    state.safeOpened += 1;
  }
  applyCellVisual(cell);

  if (state.safeOpened >= state.totalSafe) {
    state.mode = 'won';
    state.screen = 'result';
    const seconds = Math.round((performance.now() - state.startTimeMs) / 1000);
    resultTitle.textContent = 'VICTORY';
    resultSub.textContent = `Cleared all safe cells in ${seconds}s.`;
    renderScreenState();
    document.exitPointerLock?.();
  }
}

function toggleFlag(cell) {
  if (state.mode !== 'playing' || state.dead) return;
  if (!canInteractCell(cell)) return;
  cell.flagged = !cell.flagged;
  applyCellVisual(cell);
}

function getFeetCell() {
  const c = cellFromWorld(camera.position.x, camera.position.z);
  if (!c) return null;
  return state.cells[c.y][c.x];
}

function getTargetCell() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(baseMeshes, false)[0];
  if (hit) {
    const d = camera.position.distanceTo(hit.point);
    if (d <= INTERACT_RANGE_UNITS) {
      const { x, y } = hit.object.userData;
      return state.cells[y][x];
    }
  }
  return getFeetCell();
}

function holdMap(open) {
  if (state.screen !== 'playing') return;
  state.mapOpen = open;
  mapWrap.classList.toggle('hidden', !open || state.mode !== 'playing');
  setPointerLockText();
}

function randomRoomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function validNickname(value) {
  const name = value.trim();
  return name.length >= 2 && name.length <= 12;
}

function startLocalMatch() {
  const checked = validateClientEvent(EVENT.GAME_START, {});
  if (!checked.ok) return;
  resetGame();
  renderScreenState();
  safeRequestPointerLock();
}

function enterLobbyWithRoom(roomCode) {
  connectSocket();
  state.roomCode = roomCode;
  state.localReady = false;
  state.hostName = '-';
  state.hostReady = false;
  state.guestName = '-';
  state.guestReady = false;
  state.screen = 'lobby';
  entryError.textContent = '';
  localStorage.setItem('ms_nickname', state.nickname);
  renderScreenState();
}

function sendLocalIntent(type, payload) {
  const checked = validateClientEvent(type, payload);
  if (!checked.ok) {
    if (state.screen === 'entry') {
      entryError.textContent = checked.error;
    } else {
      hudTip.textContent = `Input blocked: ${checked.error}`;
    }
    return null;
  }
  return checked.data;
}

function onMouseDown(event) {
  if (state.screen !== 'playing') return;

  if (state.mode === 'won' || state.mode === 'lost') {
    return;
  }

  if (!state.pointerLocked) {
    safeRequestPointerLock();
  }

  const cell = getTargetCell();
  if (!cell) return;

  if (event.button === 0) {
    const intent = sendLocalIntent(EVENT.CELL_OPEN, { x: cell.x, y: cell.y });
    if (!intent) return;
    if (state.authoritative) {
      sendSocketEvent(EVENT.CELL_OPEN, intent);
      return;
    }
    openCell(cell);
  } else if (event.button === 2) {
    const intent = sendLocalIntent(EVENT.CELL_FLAG, { x: cell.x, y: cell.y, flagged: !cell.flagged });
    if (!intent) return;
    if (state.authoritative) {
      sendSocketEvent(EVENT.CELL_FLAG, intent);
      return;
    }
    toggleFlag(cell);
  }
}

function onMouseMove(event) {
  if (!state.pointerLocked || state.mapOpen || state.dead || state.mode !== 'playing') return;
  const sensitivity = 0.0025;
  state.yaw -= event.movementX * sensitivity;
  state.pitch -= event.movementY * sensitivity;
  state.pitch = Math.max(-1.47, Math.min(1.47, state.pitch));
}

btnCreate.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!validNickname(nickname)) {
    entryError.textContent = 'Nickname must be 2 to 12 characters.';
    return;
  }
  state.nickname = nickname;
  const intent = sendLocalIntent(EVENT.ROOM_CREATE, { nickname });
  if (!intent) return;
  enterLobbyWithRoom('----');
  sendSocketEvent(EVENT.ROOM_CREATE, intent);
});

btnJoin.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const code = joinCodeInput.value.trim();
  if (!validNickname(nickname)) {
    entryError.textContent = 'Nickname must be 2 to 12 characters.';
    return;
  }
  if (!/^[0-9]{4}$/.test(code)) {
    entryError.textContent = 'Room code must be 4 digits.';
    return;
  }
  state.nickname = nickname;
  const intent = sendLocalIntent(EVENT.ROOM_JOIN, { nickname, roomCode: code });
  if (!intent) return;
  enterLobbyWithRoom(code);
  sendSocketEvent(EVENT.ROOM_JOIN, intent);
});

btnReady.addEventListener('click', () => {
  const nextReady = !state.localReady;
  const intent = sendLocalIntent(EVENT.PLAYER_READY, { ready: nextReady });
  if (!intent) return;
  sendSocketEvent(EVENT.PLAYER_READY, intent);
});

btnStart.addEventListener('click', () => {
  if (!state.localReady) return;
  const intent = sendLocalIntent(EVENT.GAME_START, {});
  if (!intent) return;
  sendSocketEvent(EVENT.GAME_START, intent);
});

btnLeave.addEventListener('click', () => {
  state.screen = 'entry';
  state.localReady = false;
  state.mode = 'paused';
  state.mapOpen = false;
  mapWrap.classList.add('hidden');
  document.exitPointerLock?.();
  nicknameInput.value = state.nickname;
  joinCodeInput.value = '';
  entryError.textContent = '';
  try {
    socket?.close();
  } catch {
    // noop
  }
  pendingSocketMessages.length = 0;
  setConnState('LOCAL');
  state.reconnectLeft = 0;
  state.reconnectAt = 0;
  renderScreenState();
});

btnResultRestart.addEventListener('click', () => {
  const intent = sendLocalIntent(EVENT.GAME_RESTART, {});
  if (!intent) return;
  sendSocketEvent(EVENT.GAME_RESTART, intent);
  startLocalMatch();
});

btnResultLobby.addEventListener('click', () => {
  state.screen = 'lobby';
  state.mode = 'paused';
  state.localReady = false;
  document.exitPointerLock?.();
  renderScreenState();
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('keydown', (e) => {
  if (state.screen === 'result' && e.code === 'KeyR') {
    startLocalMatch();
    return;
  }
  if (state.screen !== 'playing') return;
  if (e.code === 'Tab') {
    e.preventDefault();
    holdMap(true);
  }
  if (e.code === 'KeyF') {
    toggleFullscreen();
  }
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => {
  if (state.screen !== 'playing') return;
  if (e.code === 'Tab') {
    holdMap(false);
  }
  keys.delete(e.code);
});

document.addEventListener('pointerlockchange', () => {
  state.pointerLocked = document.pointerLockElement === renderer.domElement;
  if (state.pointerLocked && state.screen !== 'playing') {
    document.exitPointerLock?.();
    state.pointerLocked = false;
  }
  setPointerLockText();
});

const savedNickname = localStorage.getItem('ms_nickname');
if (savedNickname && validNickname(savedNickname)) {
  state.nickname = savedNickname;
  nicknameInput.value = savedNickname;
}

window.__dev_validate_client_message = (type, payload) => validateClientEvent(type, payload);

renderScreenState();

function drawMap() {
  if (!state.mapOpen || state.mode !== 'playing') return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = mapCanvas.clientWidth;
  const h = mapCanvas.clientHeight;
  const rw = Math.floor(w * dpr);
  const rh = Math.floor(h * dpr);
  if (mapCanvas.width !== rw || mapCanvas.height !== rh) {
    mapCanvas.width = rw;
    mapCanvas.height = rh;
  }
  mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  mapCtx.clearRect(0, 0, w, h);
  const cellPx = Math.min(w, h) / GRID_SIZE;
  const ox = (w - cellPx * GRID_SIZE) * 0.5;
  const oy = (h - cellPx * GRID_SIZE) * 0.5;

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const c = state.cells[y][x];
      const px = ox + x * cellPx;
      const py = oy + y * cellPx;

      if (c.exploded) {
        mapCtx.fillStyle = '#271c1c';
        mapCtx.fillRect(px, py, cellPx, cellPx);
        mapCtx.fillStyle = '#ff735f';
        mapCtx.font = `${Math.floor(cellPx * 0.62)}px monospace`;
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'middle';
        mapCtx.fillText('X', px + cellPx / 2, py + cellPx / 2);
      } else if (c.opened) {
        mapCtx.fillStyle = '#8f98a3';
        mapCtx.fillRect(px, py, cellPx, cellPx);
        if (!c.mine && c.number > 0) {
          const palette = ['#3a7bff', '#2f9c59', '#dd4d3d', '#7a49ff', '#a63f26', '#1f9aa6', '#2a2a2a', '#666666'];
          mapCtx.fillStyle = palette[Math.min(7, c.number - 1)];
          mapCtx.font = `${Math.floor(cellPx * 0.5)}px "IBM Plex Sans", sans-serif`;
          mapCtx.textAlign = 'center';
          mapCtx.textBaseline = 'middle';
          mapCtx.fillText(String(c.number), px + cellPx / 2, py + cellPx / 2);
        }
      } else {
        mapCtx.fillStyle = '#47515e';
        mapCtx.fillRect(px, py, cellPx, cellPx);
      }

      if (c.flagged) {
        mapCtx.fillStyle = '#ff4545';
        mapCtx.beginPath();
        mapCtx.moveTo(px + cellPx * 0.25, py + cellPx * 0.75);
        mapCtx.lineTo(px + cellPx * 0.25, py + cellPx * 0.2);
        mapCtx.lineTo(px + cellPx * 0.75, py + cellPx * 0.35);
        mapCtx.closePath();
        mapCtx.fill();
      }

      mapCtx.strokeStyle = 'rgba(255,255,255,0.2)';
      mapCtx.strokeRect(px, py, cellPx, cellPx);
    }
  }

  const myCell = getFeetCell();
  if (myCell) {
    mapCtx.fillStyle = '#34a1ff';
    mapCtx.beginPath();
    mapCtx.arc(ox + (myCell.x + 0.5) * cellPx, oy + (myCell.y + 0.5) * cellPx, cellPx * 0.2, 0, Math.PI * 2);
    mapCtx.fill();
  }

  mapCtx.fillStyle = '#62dd88';
  mapCtx.beginPath();
  mapCtx.arc(
    ox + (state.teammatePos.x + 0.5) * cellPx,
    oy + (state.teammatePos.y + 0.5) * cellPx,
    cellPx * 0.2,
    0,
    Math.PI * 2
  );
  mapCtx.fill();
}

function updateMovement(dt) {
  if (state.mode !== 'playing' || state.dead) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() > 0) {
    forward.normalize();
  } else {
    forward.set(0, 0, -1);
  }
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const moveDir = new THREE.Vector3();

  if (keys.has('KeyW')) moveDir.add(forward);
  if (keys.has('KeyS')) moveDir.sub(forward);
  if (keys.has('KeyD')) moveDir.add(right);
  if (keys.has('KeyA')) moveDir.sub(right);

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED;
    camera.position.addScaledVector(moveDir, speed * dt);
  }

  if (camera.position.y <= PLAYER_HEIGHT + 0.001) {
    camera.position.y = PLAYER_HEIGHT;
    state.velocityY = Math.max(0, state.velocityY);
    if (keys.has('Space')) {
      state.velocityY = JUMP_VELOCITY;
    }
  }

  state.velocityY -= GRAVITY * dt;
  camera.position.y += state.velocityY * dt;
  if (camera.position.y < PLAYER_HEIGHT) {
    camera.position.y = PLAYER_HEIGHT;
    state.velocityY = 0;
  }

  camera.position.x = Math.max(boardMin + 0.5, Math.min(boardMax - 0.5, camera.position.x));
  camera.position.z = Math.max(boardMin + 0.5, Math.min(boardMax - 0.5, camera.position.z));
}

function updateDead(dt) {
  if (!state.dead) return;
  state.deadLeft -= dt;
  camera.position.copy(state.deadPos);
  state.yaw = state.deadYaw;
  state.pitch = state.deadPitch;
  if (state.deadLeft <= 0 && state.mode === 'playing') {
    state.dead = false;
    state.deadLeft = 0;
    const center = worldFromCell(Math.floor(GRID_SIZE / 2), Math.floor(GRID_SIZE / 2));
    camera.position.set(center.x, PLAYER_HEIGHT, center.z);
    state.velocityY = 0;
  }
}

function updateFx(dt) {
  for (let i = fxBursts.length - 1; i >= 0; i -= 1) {
    const b = fxBursts[i];
    b.t += dt;
    const s = 1 + b.t * 6;
    b.mesh.scale.setScalar(s);
    b.mesh.material.opacity = Math.max(0, 1 - b.t * 4);
    if (b.t > 0.35) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      fxBursts.splice(i, 1);
    }
  }
}

function updateTeammateAvatar(dt) {
  // Placeholder for remote interpolation: keep avatar synced to teammatePos cell.
  const p = worldFromCell(state.teammatePos.x, state.teammatePos.y);
  teammateAvatar.group.position.set(p.x, 0, p.z);

  // Keep feet grounded; only use a subtle limb idle so the avatar feels alive.
  const t = state.elapsedMs / 1000;
  const swing = Math.sin(t * 3.5) * 0.06;
  teammateAvatar.legLeft.rotation.x = swing;
  teammateAvatar.legRight.rotation.x = -swing;
  teammateAvatar.armLeft.rotation.x = -swing * 0.9;
  teammateAvatar.armRight.rotation.x = swing * 0.9;

  // Model front is -Z, so add PI after deriving look yaw.
  const yawToCamera = Math.atan2(camera.position.x - p.x, camera.position.z - p.z);
  teammateAvatar.group.rotation.y = yawToCamera + Math.PI;
  teammateAvatar.nameTag.quaternion.copy(camera.quaternion);
}

function step(dt) {
  if (state.screen !== 'playing' && keys.size > 0) {
    keys.clear();
  }
  if (state.connState === 'RECONNECTING') {
    const leftMs = Math.max(0, state.reconnectAt - Date.now());
    state.reconnectLeft = Math.ceil(leftMs / 1000);
    if (leftMs <= 0) {
      setConnState('DISCONNECTED');
    } else if ((!socket || socket.readyState >= 2) && leftMs % 5000 < 17) {
      connectSocket(true);
    }
  }
  if (state.mode === 'playing') {
    state.elapsedMs += dt * 1000;
  }

  updateDead(dt);
  updateMovement(dt);
  updateFx(dt);
  updateTeammateAvatar(dt);

  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;

  drawMap();
  setStatusText();
  setPointerLockText();

  renderer.render(scene, camera);
}

let last = performance.now();
function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  step(dt);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.advanceTime = (ms) => {
  const frameMs = 1000 / 60;
  const steps = Math.max(1, Math.round(ms / frameMs));
  for (let i = 0; i < steps; i += 1) {
    step(1 / 60);
  }
};

window.render_game_to_text = () => {
  const flagged = state.cellsFlat.filter((c) => c.flagged).length;
  const openedSafe = state.cellsFlat.filter((c) => c.opened && !c.mine).length;
  const exploded = state.cellsFlat.filter((c) => c.exploded).length;
  const me = cellFromWorld(camera.position.x, camera.position.z);
  const payload = {
    mode: state.mode,
    coord_system: {
      grid_origin: 'top-left is (0,0)',
      world_axes: '+x right, +z down the map, y up',
      grid_size: GRID_SIZE
    },
    rules: {
      mines: MINE_COUNT,
      total_safe: state.totalSafe,
      interact_range_blocks: INTERACT_RANGE_BLOCKS,
      chain_open: false,
      chording: false
    },
    player: {
      world_x: Number(camera.position.x.toFixed(2)),
      world_y: Number(camera.position.y.toFixed(2)),
      world_z: Number(camera.position.z.toFixed(2)),
      cell: me,
      yaw: Number(state.yaw.toFixed(2)),
      pitch: Number(state.pitch.toFixed(2)),
      dead: state.dead,
      dead_left: Number(state.deadLeft.toFixed(2))
    },
    hud: {
      lives: state.lives,
      status: state.mode === 'won' ? 'WON' : state.mode === 'lost' ? 'LOST' : state.dead ? 'DEAD' : 'ALIVE',
      map_open: state.mapOpen,
      protocol_event_count: PROTOCOL_EVENT_COUNT
    },
    board: {
      opened_safe: openedSafe,
      flagged,
      exploded,
      remaining_safe: state.totalSafe - openedSafe
    },
    teammate: {
      name: 'Teammate',
      cell_x: Number(state.teammatePos.x.toFixed(2)),
      cell_y: Number(state.teammatePos.y.toFixed(2))
    }
  };
  return JSON.stringify(payload);
};

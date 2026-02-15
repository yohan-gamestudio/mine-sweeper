function neighbors8(size, x, y) {
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
        out.push([nx, ny]);
      }
    }
  }
  return out;
}

export function createBoard({ size = 16, mines = 40, rng = Math.random } = {}) {
  const total = size * size;
  const mineIds = new Set();
  while (mineIds.size < mines) {
    mineIds.add(Math.floor(rng() * total));
  }

  const cells = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const id = y * size + x;
      return {
        x,
        y,
        mine: mineIds.has(id),
        number: 0,
        opened: false,
        flagged: false,
        exploded: false
      };
    })
  );

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = neighbors8(size, x, y).reduce((acc, [nx, ny]) => acc + (cells[ny][nx].mine ? 1 : 0), 0);
      cells[y][x].number = n;
    }
  }

  return {
    size,
    mines,
    cells,
    safeTotal: total - mines,
    safeOpened: 0
  };
}

export function getCell(board, x, y) {
  if (x < 0 || y < 0 || x >= board.size || y >= board.size) return null;
  return board.cells[y][x];
}

export function toggleFlag(board, x, y) {
  const cell = getCell(board, x, y);
  if (!cell || cell.exploded) return { ok: false, reason: 'invalid_cell' };
  cell.flagged = !cell.flagged;
  return { ok: true, cell };
}

export function openCell(board, x, y) {
  const cell = getCell(board, x, y);
  if (!cell) return { ok: false, reason: 'invalid_cell' };
  if (cell.exploded) return { ok: false, reason: 'already_exploded' };
  if (cell.flagged) return { ok: false, reason: 'flagged' };
  if (cell.opened) return { ok: true, kind: 'noop', cell };

  if (cell.mine) {
    cell.exploded = true;
    return { ok: true, kind: 'mine', cell };
  }

  cell.opened = true;
  board.safeOpened += 1;
  const won = board.safeOpened >= board.safeTotal;
  return { ok: true, kind: 'safe', cell, won };
}

export function boardToPublicCells(board) {
  return board.cells.map((row) =>
    row.map((c) => ({
      x: c.x,
      y: c.y,
      opened: c.opened,
      flagged: c.flagged,
      exploded: c.exploded,
      number: c.opened && !c.mine ? c.number : null
    }))
  );
}

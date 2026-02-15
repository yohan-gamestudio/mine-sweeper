import { boardToPublicCells, createBoard, openCell, toggleFlag } from '../server/board_engine.mjs';

const board = createBoard({
  size: 6,
  mines: 6,
  rng: (() => {
    let i = 0;
    const values = [0.02, 0.05, 0.08, 0.22, 0.41, 0.77, 0.9];
    return () => {
      const v = values[i % values.length];
      i += 1;
      return v;
    };
  })()
});

const flagRes = toggleFlag(board, 5, 5);
if (!flagRes.ok || !flagRes.cell.flagged) {
  throw new Error('toggleFlag failed');
}

const flaggedOpen = openCell(board, 5, 5);
if (flaggedOpen.ok) {
  throw new Error('flagged cell should not open');
}

toggleFlag(board, 5, 5);
const openSafe = openCell(board, 5, 5);
if (!openSafe.ok || openSafe.kind !== 'safe') {
  throw new Error('safe open failed');
}

const publicCells = boardToPublicCells(board);
if (publicCells[5][5].number === null) {
  throw new Error('opened safe cell should reveal number');
}

console.log('board_engine_smoke:ok');

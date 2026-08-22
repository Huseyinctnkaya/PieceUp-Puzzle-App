import { getPieceEdges, buildPiecePath } from "./jigsaw.js";

const SNAP_TOLERANCE_RATIO = 0.3;

export class PuzzleBoard {
  constructor({ rows, cols, cellWidth, cellHeight }) {
    this.rows = rows;
    this.cols = cols;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.locked = new Set();
  }

  totalPieces() {
    return this.rows * this.cols;
  }

  isComplete() {
    return this.locked.size === this.totalPieces();
  }

  attemptDrop(pieceIndex, dropX, dropY) {
    if (this.locked.has(pieceIndex)) {
      return { correct: false, complete: this.isComplete() };
    }

    const row = Math.floor(pieceIndex / this.cols);
    const col = pieceIndex % this.cols;
    const targetX = col * this.cellWidth + this.cellWidth / 2;
    const targetY = row * this.cellHeight + this.cellHeight / 2;

    const toleranceX = this.cellWidth * SNAP_TOLERANCE_RATIO;
    const toleranceY = this.cellHeight * SNAP_TOLERANCE_RATIO;

    const correct =
      Math.abs(dropX - targetX) <= toleranceX && Math.abs(dropY - targetY) <= toleranceY;

    if (correct) {
      this.locked.add(pieceIndex);
    }

    return { correct, complete: this.isComplete() };
  }
}

export function buildPieces(rows, cols, cellWidth, cellHeight, seed) {
  const pieces = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const edges = getPieceEdges(seed, row, col, rows, cols);
      const path = buildPiecePath(cellWidth, cellHeight, edges);
      pieces.push({ index: row * cols + col, row, col, path });
    }
  }
  return pieces;
}

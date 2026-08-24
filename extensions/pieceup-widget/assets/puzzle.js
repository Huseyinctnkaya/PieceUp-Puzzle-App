import { snapTolerance } from "./jigsaw.js";

/**
 * Tracks which pieces are placed and decides whether a drop counts.
 *
 * Deliberately holds no DOM and no pixel layout of its own: it's handed a
 * position and answers yes/no, which is what makes the placement rules
 * testable without a browser.
 */
export class PuzzleBoard {
  constructor({ rows, cols, cellWidth, cellHeight, difficulty }) {
    this.rows = rows;
    this.cols = cols;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.difficulty = difficulty;
    this.locked = new Set();
  }

  totalPieces() {
    return this.rows * this.cols;
  }

  isComplete() {
    return this.locked.size === this.totalPieces();
  }

  /** Where a piece's box belongs on the board, in board coordinates. */
  targetPosition(pieceIndex, tab) {
    const row = Math.floor(pieceIndex / this.cols);
    const col = pieceIndex % this.cols;
    return {
      x: col * this.cellWidth - tab,
      y: row * this.cellHeight - tab,
    };
  }

  /**
   * Tries to place a piece whose box top-left is at (x, y).
   *
   * Measured corner-to-corner against the target rather than centre-to-centre,
   * so the tolerance means the same thing regardless of how far a knob happens
   * to stick out on that particular piece.
   */
  attemptDrop(pieceIndex, x, y, tab = 0) {
    if (this.locked.has(pieceIndex)) {
      return { correct: false, complete: this.isComplete() };
    }

    const target = this.targetPosition(pieceIndex, tab);
    const distance = Math.hypot(x - target.x, y - target.y);
    const threshold =
      Math.min(this.cellWidth, this.cellHeight) *
      snapTolerance(this.difficulty);

    const correct = distance <= threshold;
    if (correct) {
      this.locked.add(pieceIndex);
    }

    return { correct, complete: this.isComplete() };
  }
}

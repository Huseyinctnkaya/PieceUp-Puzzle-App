import { describe, it, expect } from "vitest";
import { PuzzleBoard } from "./puzzle.js";

function makeBoard(overrides = {}) {
  return new PuzzleBoard({
    rows: 3,
    cols: 3,
    cellWidth: 100,
    cellHeight: 100,
    ...overrides,
  });
}

describe("PuzzleBoard.targetPosition", () => {
  it("maps an index to its cell, offset by the tab inset", () => {
    const board = makeBoard();
    // Piece 4 is row 1, col 1 → cell corner (100,100), box starts a tab earlier.
    expect(board.targetPosition(4, 10)).toEqual({ x: 90, y: 90 });
    expect(board.targetPosition(0, 10)).toEqual({ x: -10, y: -10 });
  });
});

describe("PuzzleBoard.attemptDrop", () => {
  it("accepts a piece dropped on its target", () => {
    const board = makeBoard();
    const target = board.targetPosition(4, 0);
    expect(board.attemptDrop(4, target.x, target.y).correct).toBe(true);
  });

  it("accepts a near miss inside the tolerance", () => {
    const board = makeBoard();
    const target = board.targetPosition(4, 0);
    // Default (easy) tolerance is half a cell — 20px off must still land.
    expect(board.attemptDrop(4, target.x + 20, target.y + 10).correct).toBe(
      true,
    );
  });

  it("rejects a drop outside the tolerance", () => {
    const board = makeBoard();
    const target = board.targetPosition(4, 0);
    expect(board.attemptDrop(4, target.x + 200, target.y).correct).toBe(false);
  });

  it("measures distance diagonally, not per-axis", () => {
    const board = makeBoard({ difficulty: "easy" });
    const target = board.targetPosition(4, 0);
    // 40 on each axis is inside a 50px budget per axis, but 56.6 diagonally —
    // this is the case a per-axis check would wrongly accept.
    expect(board.attemptDrop(4, target.x + 40, target.y + 40).correct).toBe(
      false,
    );
  });

  it("gets stricter as difficulty rises", () => {
    const target = makeBoard().targetPosition(4, 0);
    const offset = 40;
    expect(
      makeBoard({ difficulty: "easy" }).attemptDrop(
        4,
        target.x + offset,
        target.y,
      ).correct,
    ).toBe(true);
    expect(
      makeBoard({ difficulty: "hard" }).attemptDrop(
        4,
        target.x + offset,
        target.y,
      ).correct,
    ).toBe(false);
  });

  it("accounts for the tab inset when given one", () => {
    const board = makeBoard();
    const tab = 20;
    const target = board.targetPosition(4, tab);
    expect(board.attemptDrop(4, target.x, target.y, tab).correct).toBe(true);
  });

  it("ignores further drops on an already-placed piece", () => {
    const board = makeBoard();
    const target = board.targetPosition(4, 0);
    expect(board.attemptDrop(4, target.x, target.y).correct).toBe(true);
    // A second drop must not re-count: the completion check reads locked.size.
    expect(board.attemptDrop(4, target.x, target.y).correct).toBe(false);
    expect(board.locked.size).toBe(1);
  });

  it("reports complete only once every piece is placed", () => {
    const board = makeBoard({ rows: 1, cols: 2 });
    const first = board.attemptDrop(
      0,
      ...Object.values(board.targetPosition(0, 0)),
    );
    expect(first.complete).toBe(false);
    const second = board.attemptDrop(
      1,
      ...Object.values(board.targetPosition(1, 0)),
    );
    expect(second.complete).toBe(true);
  });

  it("does not report complete when a piece is rejected", () => {
    const board = makeBoard({ rows: 1, cols: 1 });
    expect(board.attemptDrop(0, 999, 999).complete).toBe(false);
  });
});

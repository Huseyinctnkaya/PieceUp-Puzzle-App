import { describe, it, expect } from "vitest";
import { PuzzleBoard, buildPieces } from "./puzzle.js";

describe("PuzzleBoard.attemptDrop", () => {
  it("accepts a drop inside the tolerance of the correct cell", () => {
    const board = new PuzzleBoard({ rows: 3, cols: 3, cellWidth: 100, cellHeight: 100 });
    const result = board.attemptDrop(8, 250, 255);
    expect(result.correct).toBe(true);
  });

  it("rejects a drop outside the tolerance", () => {
    const board = new PuzzleBoard({ rows: 3, cols: 3, cellWidth: 100, cellHeight: 100 });
    const result = board.attemptDrop(4, 400, 400);
    expect(result.correct).toBe(false);
  });

  it("reports complete once every piece is locked", () => {
    const board = new PuzzleBoard({ rows: 1, cols: 2, cellWidth: 100, cellHeight: 100 });
    board.attemptDrop(0, 50, 50);
    const result = board.attemptDrop(1, 150, 50);
    expect(result.complete).toBe(true);
  });

  it("ignores further drops on an already-locked piece", () => {
    const board = new PuzzleBoard({ rows: 1, cols: 2, cellWidth: 100, cellHeight: 100 });
    board.attemptDrop(0, 50, 50);
    const result = board.attemptDrop(0, 50, 50);
    expect(result.correct).toBe(false);
  });
});

describe("buildPieces", () => {
  it("produces rows*cols pieces with valid svg path strings", () => {
    const pieces = buildPieces(2, 2, 100, 100, "seed");
    expect(pieces).toHaveLength(4);
    for (const piece of pieces) {
      expect(piece.path.startsWith("M 0 0")).toBe(true);
    }
  });
});

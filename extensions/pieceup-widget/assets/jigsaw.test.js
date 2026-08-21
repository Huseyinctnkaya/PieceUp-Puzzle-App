import { describe, it, expect } from "vitest";
import { getPieceEdges, buildPiecePath } from "./jigsaw.js";

describe("getPieceEdges", () => {
  it("agrees between horizontally adjacent pieces", () => {
    const seed = "test-seed";
    const left = getPieceEdges(seed, 0, 0, 3, 3);
    const right = getPieceEdges(seed, 0, 1, 3, 3);
    expect(right.left).toBe(-left.right);
  });

  it("agrees between vertically adjacent pieces", () => {
    const seed = "test-seed";
    const top = getPieceEdges(seed, 0, 0, 3, 3);
    const bottom = getPieceEdges(seed, 1, 0, 3, 3);
    expect(bottom.top).toBe(-top.bottom);
  });

  it("flat edges on the outer border", () => {
    const edges = getPieceEdges("s", 0, 0, 3, 3);
    expect(edges.top).toBe(0);
    expect(edges.left).toBe(0);
  });
});

describe("buildPiecePath", () => {
  it("starts and ends the path correctly", () => {
    const path = buildPiecePath(100, 100, { top: 0, right: 1, bottom: -1, left: 0 });
    expect(path.startsWith("M 0 0")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });
});

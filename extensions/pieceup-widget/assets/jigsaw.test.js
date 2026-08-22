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

  it("produces a rectangle for flat edges", () => {
    const flatPath = buildPiecePath(100, 100, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(flatPath).toBe("M 0 0 L 100 0 L 100 100 L 0 100 L 0 0 Z");
  });
});

describe("interlocking edges (geometric, via buildPiecePath)", () => {
  const SEGMENT_RE = /L\s+-?[\d.]+\s+-?[\d.]+(?:\s+C\s+-?[\d.]+\s+-?[\d.]+,\s*-?[\d.]+\s+-?[\d.]+,\s*-?[\d.]+\s+-?[\d.]+\s+L\s+-?[\d.]+\s+-?[\d.]+)?/g;

  function extractSegments(path) {
    return path.match(SEGMENT_RE);
  }

  function pointsFromSegment(segment) {
    const nums = segment.match(/-?[\d.]+/g).map(Number);
    const pairs = [];
    for (let i = 0; i < nums.length; i += 2) pairs.push([nums[i], nums[i + 1]]);
    return pairs;
  }

  function translate(pairs, offsetX, offsetY) {
    return pairs.map(([x, y]) => [x + offsetX, y + offsetY]);
  }

  // Drops the final point — the trailing "L x2 y2" that advances the path to this
  // piece's OWN next corner, which legitimately differs between adjacent pieces
  // and is not part of the shared seam curve.
  function coreCurvePoints(pairs) {
    return pairs.slice(0, -1);
  }

  function sharedEdgeCorePoints(seed, row, col, rows, cols, width, height, segmentIndex) {
    const edges = getPieceEdges(seed, row, col, rows, cols);
    const path = buildPiecePath(width, height, edges);
    const segments = extractSegments(path);
    const globalPairs = translate(
      pointsFromSegment(segments[segmentIndex]),
      col * width,
      row * height,
    );
    return coreCurvePoints(globalPairs);
  }

  it("A's right edge and B's left edge trace the identical curve for horizontal neighbors", () => {
    const seed = "geom-check";
    const width = 100, height = 100, rows = 3, cols = 3;
    // (1,1) and (1,2) are both interior-row pieces, so their shared vertical edge is non-flat.
    const edgesA = getPieceEdges(seed, 1, 1, rows, cols);
    const edgesB = getPieceEdges(seed, 1, 2, rows, cols);
    expect(edgesA.right).not.toBe(0);
    expect(edgesB.left).toBe(-edgesA.right); // sanity: numeric contract must hold first

    // segment index 1 = "right" (order is top=0, right=1, bottom=2, left=3)
    const coreA = sharedEdgeCorePoints(seed, 1, 1, rows, cols, width, height, 1);
    // segment index 3 = "left"
    const coreB = sharedEdgeCorePoints(seed, 1, 2, rows, cols, width, height, 3);

    expect(coreA).toEqual(coreB);
  });

  it("T's bottom edge and Bo's top edge trace the identical curve for vertical neighbors", () => {
    const seed = "geom-check";
    const width = 100, height = 100, rows = 3, cols = 3;
    // (1,1) and (2,1) are both interior-column pieces, so their shared horizontal edge is non-flat.
    const edgesT = getPieceEdges(seed, 1, 1, rows, cols);
    const edgesBo = getPieceEdges(seed, 2, 1, rows, cols);
    expect(edgesT.bottom).not.toBe(0);
    expect(edgesBo.top).toBe(-edgesT.bottom);

    // segment index 2 = "bottom"
    const coreT = sharedEdgeCorePoints(seed, 1, 1, rows, cols, width, height, 2);
    // segment index 0 = "top"
    const coreBo = sharedEdgeCorePoints(seed, 2, 1, rows, cols, width, height, 0);

    expect(coreT).toEqual(coreBo);
  });
});

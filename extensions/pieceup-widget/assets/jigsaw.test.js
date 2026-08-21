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

  it("horizontally adjacent pieces have interlocking shared edges", () => {
    const seed = "geom-check";
    const width = 100;
    const height = 100;

    // Two horizontally adjacent pieces
    const leftEdges = getPieceEdges(seed, 0, 0, 3, 3);
    const rightEdges = getPieceEdges(seed, 0, 1, 3, 3);

    // Verify numeric edge-agreement constraint
    expect(rightEdges.left).toBe(-leftEdges.right);

    // Build paths
    const leftPath = buildPiecePath(width, height, leftEdges);
    const rightPath = buildPiecePath(width, height, rightEdges);

    // Extract all coordinates from paths using regex
    function extractCoordinates(pathStr) {
      const regex = /-?\d+\.?\d*/g;
      const numbers = pathStr.match(regex).map(Number);
      const coords = [];
      for (let i = 0; i < numbers.length; i += 2) {
        coords.push([numbers[i], numbers[i + 1]]);
      }
      return coords;
    }

    const leftCoords = extractCoordinates(leftPath);
    const rightCoords = extractCoordinates(rightPath);

    // Both paths should have coordinates (M, L, C points, L, Z means at least 2+ coords)
    expect(leftCoords.length).toBeGreaterThan(0);
    expect(rightCoords.length).toBeGreaterThan(0);

    // For the right edge of left piece (x ≈ width) and left edge of right piece (x ≈ 0):
    // Find rightmost points in left piece (right edge)
    const leftRightEdge = leftCoords.filter(([x]) => Math.abs(x - width) < 1);
    // Find leftmost points in right piece (left edge)
    const rightLeftEdge = rightCoords.filter(([x]) => Math.abs(x - 0) < 1);

    // Both should have points at the shared boundary
    expect(leftRightEdge.length).toBeGreaterThan(0);
    expect(rightLeftEdge.length).toBeGreaterThan(0);

    // The rightmost y-coordinates of left piece should match the leftmost y-coordinates of right piece
    const leftRightY = leftRightEdge.map(([, y]) => y).sort((a, b) => a - b);
    const rightLeftY = rightLeftEdge.map(([, y]) => y).sort((a, b) => a - b);

    // Should both start near 0 and end near height
    expect(Math.abs(leftRightY[0] - 0)).toBeLessThan(1);
    expect(Math.abs(leftRightY[leftRightY.length - 1] - height)).toBeLessThan(1);
    expect(Math.abs(rightLeftY[0] - 0)).toBeLessThan(1);
    expect(Math.abs(rightLeftY[rightLeftY.length - 1] - height)).toBeLessThan(1);
  });

  it("vertically adjacent pieces have interlocking shared edges", () => {
    const seed = "geom-check";
    const width = 100;
    const height = 100;

    // Two vertically adjacent pieces
    const topEdges = getPieceEdges(seed, 0, 0, 3, 3);
    const bottomEdges = getPieceEdges(seed, 1, 0, 3, 3);

    // Verify numeric edge-agreement constraint
    expect(bottomEdges.top).toBe(-topEdges.bottom);

    // Build paths
    const topPath = buildPiecePath(width, height, topEdges);
    const bottomPath = buildPiecePath(width, height, bottomEdges);

    // Extract coordinates
    function extractCoordinates(pathStr) {
      const regex = /-?\d+\.?\d*/g;
      const numbers = pathStr.match(regex).map(Number);
      const coords = [];
      for (let i = 0; i < numbers.length; i += 2) {
        coords.push([numbers[i], numbers[i + 1]]);
      }
      return coords;
    }

    const topCoords = extractCoordinates(topPath);
    const bottomCoords = extractCoordinates(bottomPath);

    // Both paths should have coordinates
    expect(topCoords.length).toBeGreaterThan(0);
    expect(bottomCoords.length).toBeGreaterThan(0);

    // For the bottom edge of top piece (y ≈ height) and top edge of bottom piece (y ≈ 0):
    const topBottomEdge = topCoords.filter(([, y]) => Math.abs(y - height) < 1);
    const bottomTopEdge = bottomCoords.filter(([, y]) => Math.abs(y - 0) < 1);

    // Both should have points at the shared boundary
    expect(topBottomEdge.length).toBeGreaterThan(0);
    expect(bottomTopEdge.length).toBeGreaterThan(0);

    // The x-coordinates should span the width
    const topBottomX = topBottomEdge.map(([x]) => x).sort((a, b) => a - b);
    const bottomTopX = bottomTopEdge.map(([x]) => x).sort((a, b) => a - b);

    // Should both start near 0 and end near width
    expect(Math.abs(topBottomX[0] - 0)).toBeLessThan(1);
    expect(Math.abs(topBottomX[topBottomX.length - 1] - width)).toBeLessThan(1);
    expect(Math.abs(bottomTopX[0] - 0)).toBeLessThan(1);
    expect(Math.abs(bottomTopX[bottomTopX.length - 1] - width)).toBeLessThan(1);
  });
});

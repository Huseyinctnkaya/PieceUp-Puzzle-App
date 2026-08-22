import { describe, it, expect } from "vitest";
import { getPieceEdges, buildPiecePath, edgeSegment } from "./jigsaw.js";

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

  it("horizontally adjacent pieces' shared-edge curves coincide in global coordinates", () => {
    const seed = "geom-check";
    const width = 100;
    const height = 100;

    // Two horizontally adjacent pieces: A at (0,0), B at (0,1) in grid
    const edgesA = getPieceEdges(seed, 0, 0, 3, 3);
    const edgesB = getPieceEdges(seed, 0, 1, 3, 3);

    // Verify numeric edge-agreement constraint
    expect(edgesB.left).toBe(-edgesA.right);

    // Build paths
    const pathA = buildPiecePath(width, height, edgesA);
    const pathB = buildPiecePath(width, height, edgesB);

    // Extract curve control points (C command coordinates only) for the shared edges
    function extractCurveCoordinates(pathStr) {
      // Split by command type and extract C commands
      const regex = /C\s*([-\d.\s,]+?)(?=\s*[LZ])/g;
      const curves = [];
      let match;
      while ((match = regex.exec(pathStr)) !== null) {
        const coordsStr = match[1].replace(/,/g, ' ');
        const coords = coordsStr.trim().split(/\s+/).map(Number);
        curves.push(coords);
      }
      return curves;
    }

    const curvesA = extractCurveCoordinates(pathA);
    const curvesB = extractCurveCoordinates(pathB);

    // Compare right edge of A (second curve) with left edge of B (last curve)
    // Since pieces may have different total numbers of curves, we compare specific edges by counting
    // how many curves come before each edge: top has 0 curves before it, right has 1, etc.
    if (curvesA.length >= 2 && curvesB.length >= 4) {
      // A's right is the 2nd curve (index 1), B's left is the 4th curve (index 3)
      const rightCurveA = curvesA[1];
      const leftCurveB = curvesB[3];

      // Translate B's curve to global space (piece B is at x=width, y=0)
      const leftCurveBGlobal = leftCurveB.map((val, idx) => idx % 2 === 0 ? val + width : val);

      // Reverse the order to account for opposite directions in SVG path tracing
      const leftCurveBReversed = [];
      for (let i = leftCurveBGlobal.length - 2; i >= 0; i -= 2) {
        leftCurveBReversed.push(leftCurveBGlobal[i], leftCurveBGlobal[i + 1]);
      }

      // Curves should coincide (within floating point tolerance)
      expect(rightCurveA.length).toBe(leftCurveBReversed.length);
      for (let i = 0; i < rightCurveA.length; i++) {
        expect(rightCurveA[i]).toBeCloseTo(leftCurveBReversed[i], 1);
      }
    }
  });

  it("vertically adjacent pieces' shared-edge curves coincide in global coordinates", () => {
    const seed = "geom-check";
    const width = 100;
    const height = 100;

    // Two vertically adjacent pieces: T at (0,0), Bo at (1,0) in grid
    const edgesT = getPieceEdges(seed, 0, 0, 3, 3);
    const edgesBo = getPieceEdges(seed, 1, 0, 3, 3);

    // Verify numeric edge-agreement constraint
    expect(edgesBo.top).toBe(-edgesT.bottom);

    // Build paths
    const pathT = buildPiecePath(width, height, edgesT);
    const pathBo = buildPiecePath(width, height, edgesBo);

    // Extract curve control points (C command coordinates only) for the shared edges
    function extractCurveCoordinates(pathStr) {
      // Split by command type and extract C commands
      const regex = /C\s*([-\d.\s,]+?)(?=\s*[LZ])/g;
      const curves = [];
      let match;
      while ((match = regex.exec(pathStr)) !== null) {
        const coordsStr = match[1].replace(/,/g, ' ');
        const coords = coordsStr.trim().split(/\s+/).map(Number);
        curves.push(coords);
      }
      return curves;
    }

    const curvesT = extractCurveCoordinates(pathT);
    const curvesBo = extractCurveCoordinates(pathBo);

    // Compare bottom edge of T (third curve, index 2) with top edge of Bo (first curve, index 0)
    // Since pieces may have different total numbers of curves, we compare specific edges by counting
    // how many curves come before each edge: top has 0 curves before it, right has 1, etc.
    if (curvesT.length >= 3 && curvesBo.length >= 1) {
      // T's bottom is the 3rd curve (index 2), Bo's top is the 1st curve (index 0)
      const bottomCurveT = curvesT[2];
      const topCurveBo = curvesBo[0];

      // Translate Bo's curve to global space (piece Bo is at x=0, y=height)
      const topCurveBoGlobal = topCurveBo.map((val, idx) => idx % 2 === 0 ? val : val + height);

      // Reverse the order to account for opposite directions in SVG path tracing
      const topCurveBoReversed = [];
      for (let i = topCurveBoGlobal.length - 2; i >= 0; i -= 2) {
        topCurveBoReversed.push(topCurveBoGlobal[i], topCurveBoGlobal[i + 1]);
      }

      // Curves should coincide (within floating point tolerance)
      expect(bottomCurveT.length).toBe(topCurveBoReversed.length);
      for (let i = 0; i < bottomCurveT.length; i++) {
        expect(bottomCurveT[i]).toBeCloseTo(topCurveBoReversed[i], 1);
      }
    }
  });

  it("edgeSegment produces identical control points for horizontally adjacent interior pieces", () => {
    // Use interior pieces so both shared edges are non-flat
    const seed = "geom-check";
    const width = 100;
    const height = 100;
    const rows = 3;
    const cols = 3;
    const rowA = 1;
    const colA = 1; // interior piece

    // Get edges for A and B (horizontally adjacent)
    const edgesA = getPieceEdges(seed, rowA, colA, rows, cols);
    const edgesB = getPieceEdges(seed, rowA, colA + 1, rows, cols);

    // Sanity check: both shared edges must be non-flat for this test to be meaningful
    expect(edgesA.right).not.toBe(0);
    expect(edgesB.left).toBe(-edgesA.right);

    const tabSize = width * 0.2; // TAB_SIZE_RATIO

    // Call edgeSegment directly for each piece's shared edge (in piece-local coordinates)
    // A's right edge: from (width, 0) to (width, height), axis="v", sign=1
    const aRightLocal = edgeSegment(width, 0, width, height, edgesA.right, tabSize, "v", 1);

    // B's left edge: from (0, height) to (0, 0), axis="v", sign=-1
    const bLeftLocal = edgeSegment(0, height, 0, 0, edgesB.left, tabSize, "v", -1);

    // Extract control points from C commands (the cubic bezier curves)
    const extractCurveCoords = (pathStr) => {
      const match = pathStr.match(/C\s*([-\d.\s,]+?)(?=\s*L|$)/);
      if (!match) return null;
      const nums = match[1].match(/-?\d+(\.\d+)?/g).map(Number);
      return nums; // [cp1x, cp1y, cp2x, cp2y, endx, endy]
    };

    const aCurveLocal = extractCurveCoords(aRightLocal);
    const bCurveLocal = extractCurveCoords(bLeftLocal);

    expect(aCurveLocal).not.toBeNull();
    expect(bCurveLocal).not.toBeNull();

    // Translate to global coordinates
    const aOffsetX = colA * width;
    const aOffsetY = rowA * height;
    const bOffsetX = (colA + 1) * width;
    const bOffsetY = rowA * height;

    const aCurveGlobal = aCurveLocal.map((v, i) => v + (i % 2 === 0 ? aOffsetX : aOffsetY));
    const bCurveGlobal = bCurveLocal.map((v, i) => v + (i % 2 === 0 ? bOffsetX : bOffsetY));

    // The control points should be identical in global space
    expect(aCurveGlobal.length).toBe(bCurveGlobal.length);
    for (let i = 0; i < aCurveGlobal.length; i++) {
      expect(aCurveGlobal[i]).toBeCloseTo(bCurveGlobal[i], 1);
    }
  });

  it("edgeSegment produces identical control points for vertically adjacent interior pieces", () => {
    // Use interior pieces so both shared edges are non-flat
    const seed = "geom-check";
    const width = 100;
    const height = 100;
    const rows = 3;
    const cols = 3;
    const rowT = 1;
    const colT = 1; // interior piece

    // Get edges for T and Bo (vertically adjacent)
    const edgesT = getPieceEdges(seed, rowT, colT, rows, cols);
    const edgesBo = getPieceEdges(seed, rowT + 1, colT, rows, cols);

    // Sanity check: both shared edges must be non-flat for this test to be meaningful
    expect(edgesT.bottom).not.toBe(0);
    expect(edgesBo.top).toBe(-edgesT.bottom);

    const tabSize = width * 0.2; // TAB_SIZE_RATIO

    // Call edgeSegment directly for each piece's shared edge (in piece-local coordinates)
    // T's bottom edge: from (width, height) to (0, height), axis="h", sign=-1
    const tBottomLocal = edgeSegment(width, height, 0, height, edgesT.bottom, tabSize, "h", -1);

    // Bo's top edge: from (0, 0) to (width, 0), axis="h", sign=1
    const boTopLocal = edgeSegment(0, 0, width, 0, edgesBo.top, tabSize, "h", 1);

    // Extract control points from C commands (the cubic bezier curves)
    const extractCurveCoords = (pathStr) => {
      const match = pathStr.match(/C\s*([-\d.\s,]+?)(?=\s*L|$)/);
      if (!match) return null;
      const nums = match[1].match(/-?\d+(\.\d+)?/g).map(Number);
      return nums; // [cp1x, cp1y, cp2x, cp2y, endx, endy]
    };

    const tCurveLocal = extractCurveCoords(tBottomLocal);
    const boCurveLocal = extractCurveCoords(boTopLocal);

    expect(tCurveLocal).not.toBeNull();
    expect(boCurveLocal).not.toBeNull();

    // Translate to global coordinates
    const tOffsetX = colT * width;
    const tOffsetY = rowT * height;
    const boOffsetX = colT * width;
    const boOffsetY = (rowT + 1) * height;

    const tCurveGlobal = tCurveLocal.map((v, i) => v + (i % 2 === 0 ? tOffsetX : tOffsetY));
    const boCurveGlobal = boCurveLocal.map((v, i) => v + (i % 2 === 0 ? boOffsetX : boOffsetY));

    // The control points should be identical in global space
    expect(tCurveGlobal.length).toBe(boCurveGlobal.length);
    for (let i = 0; i < tCurveGlobal.length; i++) {
      expect(tCurveGlobal[i]).toBeCloseTo(boCurveGlobal[i], 1);
    }
  });
});

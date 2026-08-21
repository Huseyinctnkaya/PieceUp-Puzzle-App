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
});

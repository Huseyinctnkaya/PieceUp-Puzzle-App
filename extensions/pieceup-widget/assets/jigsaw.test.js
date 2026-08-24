import { describe, it, expect } from "vitest";
import {
  buildEdgeMatrix,
  buildPiecePath,
  buildPieces,
  planTray,
  randomGenerator,
  snapTolerance,
} from "./jigsaw.js";

/**
 * Walks an SVG path and returns the extent of the curve it actually draws,
 * flattening each cubic into sampled points.
 */
function curveBounds(path) {
  const tokens = path.match(/[MCLZ]|-?[\d.]+/g);
  let i = 0;
  let current = null;
  const points = [];
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    const token = tokens[i++];
    if (token === "M" || token === "L") {
      current = { x: num(), y: num() };
      points.push(current);
    } else if (token === "C") {
      const c1 = { x: num(), y: num() };
      const c2 = { x: num(), y: num() };
      const end = { x: num(), y: num() };
      for (let step = 0; step <= 40; step++) {
        const t = step / 40;
        const u = 1 - t;
        points.push({
          x:
            u ** 3 * current.x +
            3 * u * u * t * c1.x +
            3 * u * t * t * c2.x +
            t ** 3 * end.x,
          y:
            u ** 3 * current.y +
            3 * u * u * t * c1.y +
            3 * u * t * t * c2.y +
            t ** 3 * end.y,
        });
      }
      current = end;
    }
  }

  const values = points.flatMap((p) => [p.x, p.y]);
  return { min: Math.min(...values), max: Math.max(...values) };
}

describe("randomGenerator", () => {
  it("is deterministic for a given seed", () => {
    const a = randomGenerator("seed-1");
    const b = randomGenerator("seed-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs between seeds", () => {
    const a = randomGenerator("seed-1");
    const b = randomGenerator("seed-2");
    expect(a()).not.toBe(b());
  });
});

describe("buildEdgeMatrix", () => {
  const seed = "test-seed";

  it("makes horizontal neighbours exact opposites", () => {
    const matrix = buildEdgeMatrix(3, 3, seed);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        // This is the property the whole visual interlock rests on: if it
        // ever broke, adjacent pieces would both bulge or both cut.
        expect(matrix[r][c + 1].left).toBe(-matrix[r][c].right);
      }
    }
  });

  it("makes vertical neighbours exact opposites", () => {
    const matrix = buildEdgeMatrix(3, 3, seed);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        expect(matrix[r + 1][c].top).toBe(-matrix[r][c].bottom);
      }
    }
  });

  it("leaves the outer border flat", () => {
    const matrix = buildEdgeMatrix(3, 3, seed);
    for (let c = 0; c < 3; c++) {
      expect(matrix[0][c].top).toBe(0);
      expect(matrix[2][c].bottom).toBe(0);
    }
    for (let r = 0; r < 3; r++) {
      expect(matrix[r][0].left).toBe(0);
      expect(matrix[r][2].right).toBe(0);
    }
  });

  it("produces the same matrix for the same seed", () => {
    expect(buildEdgeMatrix(3, 3, seed)).toEqual(buildEdgeMatrix(3, 3, seed));
  });
});

describe("buildPiecePath", () => {
  const flat = { top: 0, right: 0, bottom: 0, left: 0 };

  it("draws a plain rectangle when every edge is flat", () => {
    // Inset by `tab` on all sides, so a 100x100 cell with tab=10 spans 10..110.
    expect(buildPiecePath(flat, 100, 100, 10)).toBe(
      "M 10.00 10.00 L 110.00 10.00 L 110.00 110.00 L 10.00 110.00 L 10.00 10.00 Z",
    );
  });

  it("emits bezier curves for non-flat edges", () => {
    const path = buildPiecePath({ ...flat, right: 1 }, 100, 100, 10);
    expect(path).toContain("C ");
    expect(path.startsWith("M 10.00 10.00")).toBe(true);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("puts a tab outside the cell and a blank inside it", () => {
    const cell = 100;
    const tab = 10;
    // The cell's right boundary sits at tab + cell.
    const boundary = tab + cell;
    const xsOf = (path) =>
      [...path.matchAll(/[-\d.]+ [-\d.]+/g)].map((m) =>
        Number(m[0].split(" ")[0]),
      );

    const outward = Math.max(
      ...xsOf(buildPiecePath({ ...flat, right: 1 }, cell, cell, tab)),
    );
    const inward = Math.min(
      ...xsOf(buildPiecePath({ ...flat, right: -1 }, cell, cell, tab)).filter(
        (x) => x > tab,
      ),
    );

    // A tab must extend past the cell edge; a blank must bite into it.
    expect(outward).toBeGreaterThan(boundary);
    expect(inward).toBeLessThan(boundary);
  });

  it("keeps a tab within its own box, so nothing gets clipped", () => {
    const cell = 100;
    const tab = 20;
    const boxSize = cell + tab * 2;
    const path = buildPiecePath(
      { top: 1, right: 1, bottom: 1, left: 1 },
      cell,
      cell,
      tab,
    );

    // Samples the drawn curve rather than reading the raw numbers: a cubic's
    // control points sit well outside the curve they produce (here ~6 units
    // past the box), so checking those would fail on geometry that actually
    // renders fine. This is what SAFETY_MARGIN exists to guarantee, and what
    // stops clip-path slicing the knobs off.
    const bounds = curveBounds(path);
    expect(bounds.min).toBeGreaterThanOrEqual(0);
    expect(bounds.max).toBeLessThanOrEqual(boxSize);
  });
});

describe("buildPieces", () => {
  it("produces one piece per cell, with matching row/col", () => {
    const pieces = buildPieces(3, 4, "seed");
    expect(pieces).toHaveLength(12);
    expect(pieces[0]).toMatchObject({ index: 0, row: 0, col: 0 });
    expect(pieces[11]).toMatchObject({ index: 11, row: 2, col: 3 });
  });

  it("shuffles the tray order rather than leaving pieces solved", () => {
    const pieces = buildPieces(4, 4, "seed");
    const orders = pieces.map((p) => p.trayOrder);
    // Every position used exactly once...
    expect([...orders].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => i),
    );
    // ...but not in solved order, or the puzzle would start assembled.
    expect(orders).not.toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("is fully deterministic, scatter included", () => {
    expect(buildPieces(3, 3, "seed-a")).toEqual(buildPieces(3, 3, "seed-a"));
  });

  it("scatters differently for different seeds", () => {
    const a = buildPieces(3, 3, "seed-a");
    const b = buildPieces(3, 3, "seed-b");
    expect(a.map((p) => p.trayOrder)).not.toEqual(b.map((p) => p.trayOrder));
  });
});

describe("planTray", () => {
  it("picks the largest scale that fits the target height", () => {
    const plan = planTray(600, 300, 120, 120, 9);
    expect(plan.height).toBeLessThanOrEqual(300);
    expect(plan.scale).toBeLessThanOrEqual(0.78);
  });

  it("falls back to the smallest scale rather than overflowing forever", () => {
    // Nothing fits a 10px-tall tray; the plan still has to come back usable.
    const plan = planTray(600, 10, 120, 120, 16);
    expect(plan.scale).toBe(0.3);
    expect(plan.columns).toBeGreaterThan(0);
  });

  it("degrades gracefully before the board has been measured", () => {
    // Called on first render when widths are still 0.
    const plan = planTray(0, 0, 0, 0, 9);
    expect(plan.columns).toBeGreaterThan(0);
    expect(plan.rows).toBeGreaterThan(0);
  });

  it("fits every piece into the planned grid", () => {
    const plan = planTray(600, 300, 120, 120, 9);
    expect(plan.columns * plan.rows).toBeGreaterThanOrEqual(9);
  });
});

describe("snapTolerance", () => {
  it("tightens as difficulty rises", () => {
    expect(snapTolerance("hard")).toBeLessThan(snapTolerance("medium"));
    expect(snapTolerance("medium")).toBeLessThan(snapTolerance("easy"));
  });

  it("defaults to the most forgiving value for an unknown difficulty", () => {
    expect(snapTolerance(undefined)).toBe(snapTolerance("easy"));
  });
});

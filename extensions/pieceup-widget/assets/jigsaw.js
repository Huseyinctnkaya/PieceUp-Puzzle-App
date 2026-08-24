/**
 * Jigsaw geometry.
 *
 * Every function here is pure and deterministic: the same seed always produces
 * the same puzzle. That's what lets the admin preview render exactly what the
 * shopper will see, and what would let progress be restored later.
 */

/** FNV-1a — turns a string into a 32-bit seed. */
function hashSeed(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. */
export function randomGenerator(seed) {
  let a = hashSeed(seed);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Edge shape for every piece: 1 = tab (sticks out), -1 = blank (cut in),
 * 0 = flat.
 *
 * Neighbours are forced to be exact opposites — one's tab is the other's
 * blank — and the outer border stays flat, like a real puzzle. Generating the
 * shared edges once and deriving both pieces from them is what guarantees
 * that, rather than hoping two independent calculations agree.
 */
export function buildEdgeMatrix(rows, cols, seed) {
  const rnd = randomGenerator(seed + ":edges");
  // horizontal[r][c] = the right edge of piece (r,c)
  const horizontal = [];
  const vertical = [];
  for (let r = 0; r < rows; r++) {
    horizontal.push([]);
    vertical.push([]);
    for (let c = 0; c < cols; c++) {
      horizontal[r].push(rnd() > 0.5 ? 1 : -1);
      vertical[r].push(rnd() > 0.5 ? 1 : -1);
    }
  }

  const matrix = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        top: r === 0 ? 0 : -vertical[r - 1][c],
        right: c === cols - 1 ? 0 : horizontal[r][c],
        bottom: r === rows - 1 ? 0 : vertical[r][c],
        left: c === 0 ? 0 : -horizontal[r][c - 1],
      });
    }
    matrix.push(row);
  }
  return matrix;
}

/**
 * The classic jigsaw edge profile, as pairs of (position along the edge,
 * height perpendicular to it). Reads as: a shallow dip, a round knob, then a
 * dip back down to a flat exit.
 */
const EDGE_CURVE = [
  // [c1s, c1n, c2s, c2n, s, n] — each row is one cubic bezier.
  [0.24, 0.0, 0.36, 0.0, 0.4, -0.05],
  [0.16, 0.3, 0.84, 0.3, 0.6, -0.05],
  [0.64, 0.0, 0.76, 0.0, 1.0, 0.0],
];

/** Peak of the middle bezier, in edge-length units — scaling derives from it. */
const PEAK_RATIO = 0.2125;

/** Margin so a knob never quite touches the edge of its own box. */
const SAFETY_MARGIN = 0.92;

/**
 * Draws one edge from p0 to p1. The tab bulges perpendicular to the edge,
 * outward (1) or inward (-1) per `direction`.
 *
 * Pieces are drawn clockwise, which is what makes the perpendicular vector
 * always point away from the piece — so the same formula works on all four
 * sides without per-side sign corrections.
 */
function drawEdge(p0, p1, direction, tab) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (direction === 0 || tab <= 0) {
    return `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
  }

  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  // Perpendicular, pointing outward given the clockwise winding.
  const px = uy;
  const py = -ux;
  const height = ((tab * SAFETY_MARGIN) / PEAK_RATIO) * direction;

  const point = (s, n) => {
    const x = p0.x + ux * length * s + px * n * height;
    const y = p0.y + uy * length * s + py * n * height;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  };

  return EDGE_CURVE.map(
    ([c1s, c1n, c2s, c2n, s, n]) =>
      `C ${point(c1s, c1n)}, ${point(c2s, c2n)}, ${point(s, n)}`,
  ).join(" ");
}

/**
 * SVG path for one piece, in its own box's coordinates.
 *
 * The cell sits `tab` inside the box on every side, so knobs have room to
 * stick out without being clipped — the box is deliberately larger than the
 * grid cell it fills.
 */
export function buildPiecePath(edges, cellWidth, cellHeight, tab) {
  const x0 = tab;
  const y0 = tab;
  const x1 = tab + cellWidth;
  const y1 = tab + cellHeight;

  const topLeft = { x: x0, y: y0 };
  const topRight = { x: x1, y: y0 };
  const bottomRight = { x: x1, y: y1 };
  const bottomLeft = { x: x0, y: y1 };

  return [
    `M ${topLeft.x.toFixed(2)} ${topLeft.y.toFixed(2)}`,
    drawEdge(topLeft, topRight, edges.top, tab),
    drawEdge(topRight, bottomRight, edges.right, tab),
    drawEdge(bottomRight, bottomLeft, edges.bottom, tab),
    drawEdge(bottomLeft, topLeft, edges.left, tab),
    "Z",
  ].join(" ");
}

/**
 * Every piece, plus how it sits scattered in the tray.
 *
 * The scatter (order, offset, tilt) comes from the same seeded generator, so
 * a given puzzle always looks identical — the mess is deliberate, not random
 * per render.
 */
export function buildPieces(rows, cols, seed) {
  const matrix = buildEdgeMatrix(rows, cols, seed);
  const rnd = randomGenerator(seed + ":tray");
  const total = rows * cols;

  // Tray order: 0..n-1 shuffled, so pieces don't sit in solved order.
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      pieces.push({
        index,
        row: r,
        col: c,
        edges: matrix[r][c],
        trayOrder: order[index],
        // Offsets are fractions of the box, applied when laying out the tray.
        offsetX: (rnd() - 0.5) * 0.24,
        offsetY: (rnd() - 0.5) * 0.24,
        tilt: (rnd() - 0.5) * 14,
      });
    }
  }
  return pieces;
}

/**
 * The grid a piece count maps to — as square as possible, rows first.
 *
 * Lives here rather than in the renderer because the storefront and the admin
 * preview both need it, and they must agree: if they ever derived different
 * grids, the preview would show the merchant a puzzle their shoppers don't get.
 */
export function gridFor(pieceCount) {
  const rows = Math.ceil(Math.sqrt(pieceCount));
  const cols = Math.ceil(pieceCount / rows);
  return { rows, cols };
}

/** Scales tried largest-first; the first one that fits the tray wins. */
const SCALE_CANDIDATES = [0.78, 0.72, 0.66, 0.6, 0.54, 0.48, 0.42, 0.36, 0.3];

// A piece's box is padded by a tab on each side, so its visible body is the
// middle ~71% of the box and a knob reaches another ~14% beyond that. A piece
// therefore covers ground up to 0.5 box from its own centre, and any step
// smaller than that — once the scatter in board.js has eaten into it — leaves
// a piece buried under its neighbour: visible, but impossible to grab, because
// a pointerdown on its centre hits whatever is painted on top.
//
// So the steps below, minus twice the scatter offsets in board.js, must stay
// above 0.5. They still overlap enough to read as a pile rather than a grid.
/** Horizontal step between pieces, as a fraction of box width. */
const STEP_X = 0.74;
/** Vertical step between tray rows, as a fraction of box height. */
const STEP_Y = 0.62;
/** Tray's top and bottom padding. */
const TRAY_PADDING = 24;

function computePlan(scale, trayWidth, boxWidth, boxHeight, totalPieces) {
  const bw = boxWidth * scale;
  const bh = boxHeight * scale;
  const columns = Math.max(
    1,
    Math.min(totalPieces, Math.floor(trayWidth / (bw * STEP_X))),
  );
  const rows = Math.ceil(totalPieces / columns);
  const stepY = bh * STEP_Y;
  const height = bh + (rows - 1) * stepY + TRAY_PADDING;
  // stepY travels with the plan rather than being re-derived by the caller:
  // when the layout code kept its own copy of the constant, the two drifted
  // apart and the tray was packed tighter than the height it was budgeted.
  return { scale, columns, rows, height, stepY };
}

/**
 * Plans the tray layout.
 *
 * Pieces are shown shrunk in the tray, at the largest scale where the whole
 * pile still fits the space given. Without this the tray grows past the board
 * on small screens; scaling too far the other way makes pieces too small to
 * grab with a finger, which is why the candidates stop at 0.3.
 */
export function planTray(
  trayWidth,
  targetHeight,
  boxWidth,
  boxHeight,
  totalPieces,
) {
  if (trayWidth <= 0 || boxWidth <= 0) {
    return {
      scale: 0.6,
      columns: 1,
      rows: totalPieces,
      height: 0,
      stepY: boxHeight * 0.6 * STEP_Y,
    };
  }
  for (const scale of SCALE_CANDIDATES) {
    const plan = computePlan(
      scale,
      trayWidth,
      boxWidth,
      boxHeight,
      totalPieces,
    );
    if (plan.height <= targetHeight) return plan;
  }
  return computePlan(
    SCALE_CANDIDATES[SCALE_CANDIDATES.length - 1],
    trayWidth,
    boxWidth,
    boxHeight,
    totalPieces,
  );
}

/** How close a piece must land, as a fraction of cell size. */
export function snapTolerance(difficulty) {
  if (difficulty === "hard") return 0.22;
  if (difficulty === "medium") return 0.35;
  return 0.5;
}

const TAB_SIZE_RATIO = 0.2;

function edgeDirection(seed, row, col, axis) {
  const key = `${seed}:${axis}:${row}:${col}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 2 === 0 ? 1 : -1;
}

export function getPieceEdges(seed, row, col, rows, cols) {
  return {
    top: row === 0 ? 0 : -edgeDirection(seed, row - 1, col, "h"),
    bottom: row === rows - 1 ? 0 : edgeDirection(seed, row, col, "h"),
    left: col === 0 ? 0 : -edgeDirection(seed, row, col - 1, "v"),
    right: col === cols - 1 ? 0 : edgeDirection(seed, row, col, "v"),
  };
}

export function buildPiecePath(width, height, edges) {
  const tw = width * TAB_SIZE_RATIO;
  const th = height * TAB_SIZE_RATIO;

  const top = edgeSegment(0, 0, width, 0, edges.top, th, "h");
  const right = edgeSegment(width, 0, width, height, edges.right, tw, "v");
  const bottom = edgeSegment(width, height, 0, height, edges.bottom, th, "h");
  const left = edgeSegment(0, height, 0, 0, edges.left, tw, "v");

  return `M 0 0 ${top} ${right} ${bottom} ${left} Z`;
}

function edgeSegment(x1, y1, x2, y2, edge, tabSize, axis) {
  if (edge === 0) {
    return `L ${x2} ${y2}`;
  }
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const offset = tabSize * edge;
  if (axis === "h") {
    return (
      `L ${midX - tabSize} ${y1} ` +
      `C ${midX - tabSize} ${y1 - offset}, ${midX + tabSize} ${y1 - offset}, ${midX + tabSize} ${y1} ` +
      `L ${x2} ${y2}`
    );
  }
  return (
    `L ${x1} ${midY - tabSize} ` +
    `C ${x1 + offset} ${midY - tabSize}, ${x1 + offset} ${midY + tabSize}, ${x1} ${midY + tabSize} ` +
    `L ${x2} ${y2}`
  );
}

import { buildPieces, buildPiecePath, gridFor, planTray } from "./jigsaw.js";
import { PuzzleBoard } from "./puzzle.js";

/** Movement below this is treated as a tap, not a drag. */
const DRAG_THRESHOLD = 5;
/** How much of the board's height the tray may take. */
const TRAY_HEIGHT_RATIO = 0.62;
const TRAY_HEIGHT_MAX = 240;
/** Tab height as a fraction of the cell — how pronounced the knobs are. */
const TAB_RATIO = 0.2;

let clipIdCounter = 0;

/**
 * Renders the puzzle and owns all of its interaction.
 *
 * Everything — board, tray, pieces — lives in one absolutely positioned
 * coordinate space. That's what lets a piece be dragged from the tray onto the
 * board as a single continuous movement, instead of being moved between two
 * separate containers mid-drag.
 */
export function renderBoard(container, config, onComplete) {
  const { rows, cols } = gridFor(config.pieceCount);
  // Seeded from the image so a given puzzle always looks the same, and so the
  // admin preview can render exactly what the shopper gets.
  const seed = `${config.imageUrl}:${rows}x${cols}`;
  const pieces = buildPieces(rows, cols, seed);

  const board = new PuzzleBoard({
    rows,
    cols,
    cellWidth: 1,
    cellHeight: 1,
    difficulty: config.difficulty,
  });

  const clipPrefix = `pieceup-clip-${clipIdCounter++}`;

  container.innerHTML = "";
  const stage = document.createElement("div");
  stage.className = "pieceup-stage";
  container.appendChild(stage);

  const boardEl = document.createElement("div");
  boardEl.className = "pieceup-board";
  stage.appendChild(boardEl);

  const trayEl = document.createElement("div");
  trayEl.className = "pieceup-tray";
  stage.appendChild(trayEl);

  // clip-path definitions live in one hidden svg shared by every piece.
  const defsSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  defsSvg.setAttribute("class", "pieceup-defs");
  defsSvg.setAttribute("aria-hidden", "true");
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defsSvg.appendChild(defs);
  stage.appendChild(defsSvg);

  // Faint outlines of the empty slots, so it reads as a puzzle before any
  // piece is placed.
  const slotsSvg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  slotsSvg.setAttribute("class", "pieceup-slots");
  slotsSvg.setAttribute("aria-hidden", "true");
  boardEl.appendChild(slotsSvg);

  const state = {
    metrics: null,
    freePositions: new Map(), // pieces dropped somewhere that isn't their slot
    selected: null, // tap-to-select, for touch and keyboard
    dragging: null,
    grabOffset: { x: 0, y: 0 },
    startPoint: { x: 0, y: 0 },
    moved: false,
  };

  const elements = new Map();
  const slotButtons = new Map();

  function measure() {
    const stageRect = stage.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    const trayRect = trayEl.getBoundingClientRect();
    if (boardRect.width === 0) return null;

    const cellWidth = boardRect.width / cols;
    const cellHeight = boardRect.height / rows;
    const tab = Math.min(cellWidth, cellHeight) * TAB_RATIO;

    return {
      boardX: boardRect.left - stageRect.left,
      boardY: boardRect.top - stageRect.top,
      boardWidth: boardRect.width,
      boardHeight: boardRect.height,
      trayX: trayRect.left - stageRect.left,
      trayY: trayRect.top - stageRect.top,
      trayWidth: trayRect.width,
      trayHeight: trayRect.height,
      cellWidth,
      cellHeight,
      tab,
      boxWidth: cellWidth + tab * 2,
      boxHeight: cellHeight + tab * 2,
    };
  }

  function trayPlan(metrics) {
    const target = Math.min(
      TRAY_HEIGHT_MAX,
      metrics.boardHeight * TRAY_HEIGHT_RATIO,
    );
    return planTray(
      metrics.trayWidth,
      target,
      metrics.boxWidth,
      metrics.boxHeight,
      pieces.length,
    );
  }

  /** Where a piece sits while still in the tray, in stage coordinates. */
  function trayPosition(piece, metrics, plan) {
    const scaledW = metrics.boxWidth * plan.scale;
    const scaledH = metrics.boxHeight * plan.scale;
    const col = piece.trayOrder % plan.columns;
    const row = Math.floor(piece.trayOrder / plan.columns);

    const stepX =
      plan.columns > 1
        ? Math.max(0, metrics.trayWidth - scaledW) / (plan.columns - 1)
        : 0;
    const stepY = scaledH * 0.52;
    const topGap = Math.max(
      0,
      (metrics.trayHeight - (scaledH + (plan.rows - 1) * stepY)) / 2,
    );

    const visualX =
      metrics.trayX +
      (plan.columns > 1
        ? col * stepX
        : Math.max(0, metrics.trayWidth - scaledW) / 2) +
      piece.offsetX * scaledW * 0.3;
    const visualY =
      metrics.trayY + topGap + row * stepY + piece.offsetY * scaledH * 0.14;

    // Keep the scatter from pushing a piece out of the tray entirely.
    const clampedX = Math.min(
      Math.max(visualX, metrics.trayX),
      metrics.trayX + Math.max(0, metrics.trayWidth - scaledW),
    );

    // transform-origin is the centre, so left/top compensate for the scale.
    return {
      x: clampedX - (metrics.boxWidth * (1 - plan.scale)) / 2,
      y: visualY - (metrics.boxHeight * (1 - plan.scale)) / 2,
    };
  }

  function isInTray(piece) {
    return (
      !board.locked.has(piece.index) && !state.freePositions.has(piece.index)
    );
  }

  function positionOf(piece, metrics, plan) {
    if (board.locked.has(piece.index)) {
      const target = board.targetPosition(piece.index, metrics.tab);
      return { x: metrics.boardX + target.x, y: metrics.boardY + target.y };
    }
    const free = state.freePositions.get(piece.index);
    if (free) return free;
    return trayPosition(piece, metrics, plan);
  }

  function layout() {
    const metrics = measure();
    if (!metrics) return;
    state.metrics = metrics;
    board.cellWidth = metrics.cellWidth;
    board.cellHeight = metrics.cellHeight;

    const plan = trayPlan(metrics);
    state.plan = plan;
    trayEl.style.height = `${plan.height}px`;

    slotsSvg.setAttribute(
      "viewBox",
      `0 0 ${metrics.boardWidth} ${metrics.boardHeight}`,
    );

    for (const piece of pieces) {
      const path = buildPiecePath(
        piece.edges,
        metrics.cellWidth,
        metrics.cellHeight,
        metrics.tab,
      );
      const el = elements.get(piece.index);
      if (!el) continue;

      el.clipPath.setAttribute("d", path);
      el.outline.setAttribute("d", path);
      el.outline.parentElement.setAttribute(
        "viewBox",
        `0 0 ${metrics.boxWidth} ${metrics.boxHeight}`,
      );
      el.slot.setAttribute("d", path);
      el.slot.setAttribute(
        "transform",
        `translate(${piece.col * metrics.cellWidth - metrics.tab}, ${
          piece.row * metrics.cellHeight - metrics.tab
        })`,
      );

      el.root.style.width = `${metrics.boxWidth}px`;
      el.root.style.height = `${metrics.boxHeight}px`;

      // The face shows the whole image, shifted so this piece's own slice
      // shows through its clip-path.
      el.face.style.backgroundSize = `${metrics.boardWidth}px ${metrics.boardHeight}px`;
      el.face.style.backgroundPosition = `${-(piece.col * metrics.cellWidth - metrics.tab)}px ${-(
        piece.row * metrics.cellHeight -
        metrics.tab
      )}px`;

      applyPosition(piece, metrics, plan);
    }

    refreshSlotButtons();
  }

  function applyPosition(piece, metrics, plan) {
    const el = elements.get(piece.index);
    if (!el) return;
    const pos = positionOf(piece, metrics, plan);
    const placed = board.locked.has(piece.index);
    const dragging = state.dragging === piece.index;
    const inTray = isInTray(piece) && !dragging;

    el.root.style.left = `${pos.x}px`;
    el.root.style.top = `${pos.y}px`;
    el.root.style.transform = inTray
      ? `rotate(${piece.tilt}deg) scale(${plan.scale})`
      : "rotate(0deg)";
    el.root.style.zIndex = dragging ? 40 : placed ? 10 : 20;
    el.root.classList.toggle("is-placed", placed);
    el.root.classList.toggle("is-dragging", dragging);
    el.root.classList.toggle("is-selected", state.selected === piece.index);
    el.slot.classList.toggle("is-filled", placed);
  }

  function refresh() {
    if (!state.metrics || !state.plan) return;
    for (const piece of pieces) applyPosition(piece, state.metrics, state.plan);
    refreshSlotButtons();
  }

  function place(piece) {
    state.freePositions.delete(piece.index);
    state.selected = null;
    const el = elements.get(piece.index);
    if (el) {
      el.root.setAttribute("tabindex", "-1");
      el.root.removeAttribute("aria-label");
      el.root.classList.add("just-placed");
      // Let the settle animation finish before the class is reused.
      setTimeout(() => el.root.classList.remove("just-placed"), 400);
    }
    refresh();
    if (board.isComplete()) onComplete();
  }

  function tryDrop(piece, position) {
    const metrics = state.metrics;
    if (!metrics) return false;
    const { correct } = board.attemptDrop(
      piece.index,
      position.x - metrics.boardX,
      position.y - metrics.boardY,
      metrics.tab,
    );
    if (correct) {
      place(piece);
      return true;
    }
    return false;
  }

  function buildPieceElement(piece) {
    const clipId = `${clipPrefix}-${piece.index}`;

    const clip = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "clipPath",
    );
    clip.setAttribute("id", clipId);
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    const clipPath = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    clip.appendChild(clipPath);
    defs.appendChild(clip);

    const slot = document.createElementNS("http://www.w3.org/2000/svg", "path");
    slot.setAttribute("class", "pieceup-slot");
    slotsSvg.appendChild(slot);

    const root = document.createElement("div");
    root.className = "pieceup-piece";
    root.setAttribute("role", "button");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", `Piece ${piece.index + 1}`);

    const face = document.createElement("div");
    face.className = "pieceup-piece-face";
    face.style.clipPath = `url(#${clipId})`;
    face.style.backgroundImage = `url("${config.imageUrl}")`;
    root.appendChild(face);

    const outlineSvg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    outlineSvg.setAttribute("class", "pieceup-piece-outline");
    outlineSvg.setAttribute("aria-hidden", "true");
    const outline = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    outline.setAttribute("fill", "none");
    outlineSvg.appendChild(outline);
    root.appendChild(outlineSvg);

    stage.appendChild(root);
    elements.set(piece.index, { root, face, outline, clipPath, slot });

    wireInteraction(piece, root);
  }

  function wireInteraction(piece, el) {
    el.addEventListener("pointerdown", (event) => {
      if (board.locked.has(piece.index)) return;
      event.preventDefault();
      const metrics = state.metrics;
      const plan = state.plan;
      if (!metrics || !plan) return;

      const stageRect = stage.getBoundingClientRect();
      const current = positionOf(piece, metrics, plan);
      const scale = isInTray(piece) ? plan.scale : 1;
      // Where the piece visually starts, accounting for centre-origin scaling.
      const visualX = current.x + (metrics.boxWidth * (1 - scale)) / 2;
      const visualY = current.y + (metrics.boxHeight * (1 - scale)) / 2;

      // Grab point as a fraction of the piece, so it stays under the finger
      // when the piece grows from tray scale to full size.
      state.grabOffset = {
        x:
          ((event.clientX - stageRect.left - visualX) /
            (metrics.boxWidth * scale)) *
          metrics.boxWidth,
        y:
          ((event.clientY - stageRect.top - visualY) /
            (metrics.boxHeight * scale)) *
          metrics.boxHeight,
      };
      state.startPoint = { x: event.clientX, y: event.clientY };
      state.moved = false;
      state.dragging = piece.index;
      state.selected = piece.index;
      el.setPointerCapture(event.pointerId);
      refresh();
    });

    el.addEventListener("pointermove", (event) => {
      if (state.dragging !== piece.index) return;
      // Ignore jitter so a tap doesn't register as a tiny drag — that's what
      // keeps tap-to-select usable on touch.
      const travel = Math.hypot(
        event.clientX - state.startPoint.x,
        event.clientY - state.startPoint.y,
      );
      if (!state.moved && travel < DRAG_THRESHOLD) return;
      state.moved = true;

      const stageRect = stage.getBoundingClientRect();
      state.freePositions.set(piece.index, {
        x: event.clientX - stageRect.left - state.grabOffset.x,
        y: event.clientY - stageRect.top - state.grabOffset.y,
      });
      refresh();
    });

    function endDrag(event) {
      if (state.dragging !== piece.index) return;
      state.dragging = null;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // Already released — harmless.
      }
      if (!state.moved) {
        // A tap: leave the piece selected so a slot can be tapped next.
        refresh();
        return;
      }
      const position = state.freePositions.get(piece.index);
      if (position && !tryDrop(piece, position)) {
        // Wrong spot — send it back to the tray rather than leaving it loose,
        // so the board never fills up with strays.
        state.freePositions.delete(piece.index);
        refresh();
      }
    }

    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    el.addEventListener("keydown", (event) => {
      if (board.locked.has(piece.index)) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selected = state.selected === piece.index ? null : piece.index;
        refresh();
      }
    });
  }

  /** Tap-to-select then tap-a-slot — the alternative to dragging. */
  function buildSlotButtons() {
    for (const piece of pieces) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pieceup-slot-button";
      button.setAttribute("aria-label", `Slot ${piece.index + 1}`);
      boardEl.appendChild(button);

      button.addEventListener("click", () => {
        const metrics = state.metrics;
        if (!metrics || state.selected === null) return;
        const selected = pieces.find((p) => p.index === state.selected);
        if (!selected) return;
        if (selected.row === piece.row && selected.col === piece.col) {
          board.locked.add(selected.index);
          place(selected);
        } else {
          state.selected = null;
          refresh();
        }
      });

      slotButtons.set(piece.index, button);
    }
  }

  function refreshSlotButtons() {
    if (!state.metrics) return;
    for (const piece of pieces) {
      const button = slotButtons.get(piece.index);
      if (!button) continue;
      button.style.left = `${piece.col * state.metrics.cellWidth}px`;
      button.style.top = `${piece.row * state.metrics.cellHeight}px`;
      button.style.width = `${state.metrics.cellWidth}px`;
      button.style.height = `${state.metrics.cellHeight}px`;
      // Only clickable once a piece is waiting to be placed, so the buttons
      // don't swallow pointer events meant for the pieces themselves.
      button.disabled =
        board.locked.has(piece.index) || state.selected === null;
    }
  }

  boardEl.style.backgroundImage = config.showGuide
    ? `url("${config.imageUrl}")`
    : "";

  // The board's shape follows the image, so the puzzle isn't distorted.
  const image = new Image();
  image.onload = () => {
    if (image.naturalWidth && image.naturalHeight) {
      boardEl.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
    }
    layout();
  };
  image.src = config.imageUrl;

  for (const piece of pieces) buildPieceElement(piece);
  buildSlotButtons();

  layout();

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => layout())
      : null;
  if (observer) {
    observer.observe(stage);
    observer.observe(boardEl);
  }

  return {
    destroy() {
      if (observer) observer.disconnect();
    },
  };
}

import {
  buildPieces,
  buildPiecePath,
  gridFor,
  planTray,
  randomGenerator,
} from "./jigsaw.js";
import { PuzzleBoard } from "./puzzle.js";

/** Movement below this is treated as a tap, not a drag. */
const DRAG_THRESHOLD = 5;
/** How much of the board's height the tray may take. */
const TRAY_HEIGHT_RATIO = 0.62;
const TRAY_HEIGHT_MAX = 240;
/** Must match the stylesheet's breakpoint, or the two would disagree. */
// How far a piece may wander from its tray slot, as a fraction of its size, so
// the pile looks handmade rather than gridded. Bounded by the step sizes in
// jigsaw.js: twice the scatter must not eat the step below 0.5 of a box, or
// pieces start burying each other's centres and can no longer be picked up.
const SCATTER_X = 0.1;
const SCATTER_Y = 0.05;

const SIDE_BY_SIDE_MIN_WIDTH = 860;
/** Tab height as a fraction of the cell — how pronounced the knobs are. */
const TAB_RATIO = 0.2;

let clipIdCounter = 0;

// A simplified jigsaw silhouette: knob on top, notch on the right. The real
// piece generator draws proper bezier edges, but at badge size that outline
// turns to mush, so this is the same idea drawn by hand.
const BADGE_PATH =
  "M6 4h4a2.4 2.4 0 1 1 4.8 0H19a1.2 1.2 0 0 1 1.2 1.2V10a2.4 2.4 0 1 0 0 4.8v4.8a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 19.6V5.2A1.2 1.2 0 0 1 5.2 4z";

/**
 * Builds the merchant's copy above the card: badge, headline, description.
 *
 * Every part is optional and each is skipped when unset, so a merchant who
 * writes nothing gets the bare puzzle rather than an empty heading block.
 */
function buildIntro(container, config) {
  const badgeLabel = (config.badgeLabel || "").trim();
  const headline = (config.headline || "").trim();
  const description = (config.description || "").trim();
  if (!badgeLabel && !headline && !description) return;

  const intro = document.createElement("header");
  intro.className = "pieceup-intro";

  if (badgeLabel) {
    const badge = document.createElement("span");
    badge.className = "pieceup-intro-badge";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "pieceup-intro-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", BADGE_PATH);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.9");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
    badge.appendChild(svg);
    // textContent, not innerHTML: this is merchant-authored copy arriving over
    // the app proxy, and it lands on every shopper's page.
    badge.appendChild(document.createTextNode(badgeLabel));
    intro.appendChild(badge);
  }

  if (headline) {
    const title = document.createElement("h2");
    title.className = "pieceup-intro-title";
    title.textContent = headline;
    intro.appendChild(title);
  }

  if (description) {
    const text = document.createElement("p");
    text.className = "pieceup-intro-text";
    text.textContent = description;
    intro.appendChild(text);
  }

  container.appendChild(intro);
}

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

  buildIntro(container, config);

  const card = document.createElement("div");
  card.className = "pieceup-card";
  container.appendChild(card);

  const header = document.createElement("div");
  header.className = "pieceup-header";
  card.appendChild(header);

  const progressGroup = document.createElement("div");
  progressGroup.className = "pieceup-progress-group";
  header.appendChild(progressGroup);

  // One pip per piece while the count is small enough to read at a glance;
  // beyond that they'd be too thin to see, so a single bar replaces them.
  const usePips = pieces.length <= 20;
  const progressTrack = document.createElement("div");
  progressTrack.className = usePips
    ? "pieceup-progress-pips"
    : "pieceup-progress-bar";
  progressGroup.appendChild(progressTrack);

  const pips = [];
  if (usePips) {
    for (let i = 0; i < pieces.length; i++) {
      const pip = document.createElement("span");
      pip.className = "pieceup-pip";
      progressTrack.appendChild(pip);
      pips.push(pip);
    }
  } else {
    const fill = document.createElement("span");
    fill.className = "pieceup-progress-fill";
    progressTrack.appendChild(fill);
    pips.push(fill);
  }

  const progressLabel = document.createElement("span");
  progressLabel.className = "pieceup-progress-label";
  progressGroup.appendChild(progressLabel);

  const controls = document.createElement("div");
  controls.className = "pieceup-controls";
  header.appendChild(controls);

  const movesBadge = document.createElement("span");
  movesBadge.className = "pieceup-badge";
  controls.appendChild(movesBadge);

  const shuffleButton = document.createElement("button");
  shuffleButton.type = "button";
  shuffleButton.className = "pieceup-shuffle";
  controls.appendChild(shuffleButton);

  const stage = document.createElement("div");
  stage.className = "pieceup-stage";
  card.appendChild(stage);

  const boardEl = document.createElement("div");
  boardEl.className = "pieceup-board";
  stage.appendChild(boardEl);

  const trayEl = document.createElement("div");
  trayEl.className = "pieceup-tray";
  stage.appendChild(trayEl);

  // The start gate. The reference opens on the finished picture behind glass
  // with a single call to action, so the shopper sees the prize before the
  // puzzle scatters into pieces.
  const gate = document.createElement("div");
  gate.className = "pieceup-gate";
  const gateBox = document.createElement("div");
  gateBox.className = "pieceup-gate-box";
  gate.appendChild(gateBox);

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "pieceup-start";
  startButton.textContent = config.startLabel || "Start puzzle";
  gateBox.appendChild(startButton);

  const gateHint = document.createElement("p");
  gateHint.className = "pieceup-gate-hint";
  gateHint.textContent =
    config.startHint || "Drag every piece onto the board to win your reward.";
  gateBox.appendChild(gateHint);
  stage.appendChild(gate);

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
    moves: 0,
    // Each shuffle re-derives the scatter from a new seed, so the pile looks
    // genuinely different rather than merely re-sorted.
    shuffleRound: 0,
    shufflesLeft: config.shuffleLimit ?? 2,
    // The puzzle waits behind the gate until the shopper opts in.
    gated: true,
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

  /**
   * Whether the tray sits beside the board rather than under it.
   *
   * Read from a media query mirroring the stylesheet's breakpoint, not from
   * measurements: the tray's height depends on this decision and the decision
   * would depend on that height, so measuring it oscillates between states.
   */
  function isSideBySide() {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(`(min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`).matches
    );
  }

  function trayPlan(metrics) {
    // Beside the board the tray gets the board's full height; beneath it, only
    // a slice, so the board stays the focus.
    const target = isSideBySide()
      ? metrics.boardHeight
      : Math.min(TRAY_HEIGHT_MAX, metrics.boardHeight * TRAY_HEIGHT_RATIO);
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
    const stepY = plan.stepY;
    const topGap = Math.max(
      0,
      (metrics.trayHeight - (scaledH + (plan.rows - 1) * stepY)) / 2,
    );

    const visualX =
      metrics.trayX +
      (plan.columns > 1
        ? col * stepX
        : Math.max(0, metrics.trayWidth - scaledW) / 2) +
      piece.offsetX * scaledW * SCATTER_X;
    const visualY =
      metrics.trayY + topGap + row * stepY + piece.offsetY * scaledH * SCATTER_Y;

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
    trayEl.style.height = isSideBySide()
      ? `${metrics.boardHeight}px`
      : `${plan.height}px`;

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

  function refreshHeader() {
    const placed = board.locked.size;
    progressLabel.textContent = `${placed} / ${pieces.length} pieces`;
    movesBadge.textContent = `Moves: ${state.moves}`;

    if (usePips) {
      pips.forEach((pip, i) => pip.classList.toggle("is-on", i < placed));
    } else {
      pips[0].style.width = `${(placed / pieces.length) * 100}%`;
    }

    const exhausted = state.shufflesLeft <= 0;
    shuffleButton.textContent = exhausted
      ? "No shuffles left"
      : `Shuffle (${state.shufflesLeft})`;
    // Also disabled once solved: shuffling then has nothing left to move.
    shuffleButton.disabled = exhausted || board.isComplete();
  }

  function shuffle() {
    if (state.shufflesLeft <= 0) return;
    state.shufflesLeft -= 1;
    state.shuffleRound += 1;

    // Only unplaced pieces move; already-solved work is never undone.
    const loose = pieces.filter((piece) => !board.locked.has(piece.index));
    const rnd = randomGenerator(`${seed}:shuffle:${state.shuffleRound}`);
    const slots = loose.map((piece) => piece.trayOrder);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    loose.forEach((piece, i) => {
      piece.trayOrder = slots[i];
      piece.tilt = (rnd() - 0.5) * 14;
      // Pieces dropped loose on the board go back to the tray, which is what
      // makes shuffling useful when the board is cluttered.
      state.freePositions.delete(piece.index);
    });

    state.selected = null;
    refresh();
  }

  shuffleButton.addEventListener("click", shuffle);

  // Drawn immediately rather than waiting for refresh(): the header shows
  // counts, not positions, so it must not sit blank until the board has been
  // measured or the shopper has touched something.
  refreshHeader();

  function refresh() {
    if (!state.metrics || !state.plan) return;
    for (const piece of pieces) applyPosition(piece, state.metrics, state.plan);
    refreshSlotButtons();
    refreshHeader();
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
      state.moves += 1;
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
        state.moves += 1;
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

  // Gated, the board is a preview of the finished picture — that is the point
  // of the start screen — so it ignores showGuide until the game begins.
  function applyBoardImage() {
    boardEl.style.backgroundImage =
      state.gated || config.showGuide ? `url("${config.imageUrl}")` : "";
  }
  applyBoardImage();

  stage.classList.add("is-gated");
  startButton.addEventListener("click", () => {
    state.gated = false;
    stage.classList.remove("is-gated");
    applyBoardImage();
    // Pieces were laid out while hidden; re-running now lets them animate in
    // from the tray rather than appearing already settled.
    layout();
    if (typeof config.onStart === "function") config.onStart();
  });

  // The board's shape follows the image, so the puzzle isn't distorted.
  const image = new Image();
  image.onload = () => {
    if (image.naturalWidth && image.naturalHeight) {
      const ratio = image.naturalWidth / image.naturalHeight;
      boardEl.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
      // Bounding the width by (height budget x ratio) is what makes the height
      // cap shrink the board instead of squashing the picture: max-height alone
      // clamps height while width stays put, which stretches the image.
      boardEl.style.maxWidth = `calc(var(--pieceup-board-height) * ${ratio})`;
    }
    layout();
  };
  image.onerror = () => {
    // Pieces are drawn purely as background-image, so a failed load renders
    // them invisible and the puzzle looks empty. A flat fill keeps it playable
    // and, more importantly, keeps the failure visible rather than silent.
    // Only the fill changes, not the geometry — re-running layout() here would
    // restart every piece's position transition for no visible gain.
    stage.classList.add("pieceup-image-failed");
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

  // The breakpoint flip changes the tray's target height, and a resize
  // observer on the stage won't necessarily fire for it.
  const breakpoint =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(`(min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`)
      : null;
  const onBreakpointChange = () => layout();
  if (breakpoint) breakpoint.addEventListener("change", onBreakpointChange);

  return {
    destroy() {
      if (observer) observer.disconnect();
      if (breakpoint) {
        breakpoint.removeEventListener("change", onBreakpointChange);
      }
    },
  };
}

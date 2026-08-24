// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "./api.js";

vi.mock("./api.js");

let initPieceUp;

const BOARD_SIZE = 200;
const TRAY_HEIGHT = 120;

/**
 * jsdom has no layout engine: every getBoundingClientRect returns zeroes, so
 * the board's measure() would bail out and nothing would ever be positioned.
 * Patching the prototype means the very first layout pass already sees real
 * numbers, the way it would in a browser — a 200x200 board at (1000, 500)
 * with a tray directly beneath it.
 */
function installLayoutStub() {
  const rect = (left, top, width, height) => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => {},
  });

  Element.prototype.getBoundingClientRect = function () {
    if (this.classList.contains("pieceup-stage")) {
      return rect(1000, 500, BOARD_SIZE, BOARD_SIZE + TRAY_HEIGHT);
    }
    if (this.classList.contains("pieceup-board")) {
      return rect(1000, 500, BOARD_SIZE, BOARD_SIZE);
    }
    if (this.classList.contains("pieceup-tray")) {
      return rect(1000, 500 + BOARD_SIZE, BOARD_SIZE, TRAY_HEIGHT);
    }
    return rect(0, 0, 0, 0);
  };
}

/** Opens the puzzle with layout measurements already in place. */
async function openPuzzle(root) {
  await initPieceUp(root);
  root.querySelector(".pieceup-trigger").click();
  return root;
}

/** Pieces can't capture pointers in jsdom; stub it so drags can be simulated. */
function grabbable(piece) {
  piece.setPointerCapture = () => {};
  piece.releasePointerCapture = () => {};
  return piece;
}

beforeEach(async () => {
  document.body.innerHTML = `<div id="pieceup-root" data-trigger-page="ALL"></div>`;
  installLayoutStub();
  vi.mocked(api.fetchConfig).mockResolvedValue({
    imageUrl: "https://example.com/img.jpg",
    pieceCount: 4,
    triggerMode: "BUTTON",
    triggerPage: "ALL",
    triggerDelaySeconds: null,
  });
  vi.mocked(api.fetchStatus).mockResolvedValue(false);
  vi.mocked(api.trackOpen).mockImplementation(() => {});
  vi.resetModules();
  ({ initPieceUp } = await import("./widget.js"));
});

describe("initPieceUp", () => {
  it("mounts a trigger button and opens the puzzle board on click", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    const button = root.querySelector(".pieceup-trigger");
    expect(button).not.toBeNull();

    button.click();
    expect(root.querySelector(".pieceup-board")).not.toBeNull();
  });

  it("shows the already-played message instead of the board when already played", async () => {
    vi.mocked(api.fetchStatus).mockResolvedValue(true);
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    root.querySelector(".pieceup-trigger").click();
    expect(root.querySelector(".pieceup-message")).not.toBeNull();
    expect(root.querySelector(".pieceup-board")).toBeNull();
  });

  it("creates one piece per cell", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));
    expect(root.querySelectorAll(".pieceup-piece")).toHaveLength(4);
  });

  it("gives each piece its own slice of the image, not a shared crop", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    // pieceCount=4 → 2x2 over a 200px board → 100px cells. Every piece must
    // offset the shared background to its own cell; the bug this guards
    // against showed every piece the same top-left crop.
    const faces = root.querySelectorAll(".pieceup-piece-face");
    expect(faces).toHaveLength(4);

    const positions = Array.from(faces).map(
      (el) => el.style.backgroundPosition,
    );
    expect(new Set(positions).size).toBe(4);

    // All four share one background sized to the whole board.
    for (const face of faces) {
      expect(face.style.backgroundSize).toBe(`${BOARD_SIZE}px ${BOARD_SIZE}px`);
    }
  });

  it("closes the popup via the close button", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    root.querySelector(".pieceup-trigger").click();

    const overlay = root.querySelector(".pieceup-overlay");
    expect(overlay.hidden).toBe(false);

    root.querySelector(".pieceup-close").click();
    expect(overlay.hidden).toBe(true);
  });

  it("closes the popup on Escape and does nothing on Escape while already closed", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    const overlay = root.querySelector(".pieceup-overlay");

    document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(overlay.hidden).toBe(true);

    root.querySelector(".pieceup-trigger").click();
    expect(overlay.hidden).toBe(false);

    document.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(overlay.hidden).toBe(true);
  });

  it("snaps a near-miss drop to the exact cell rather than the drop point", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    // DOM order is row-major, so index 1 is row 0, col 1. Its box top-left
    // sits a tab above and left of the cell: (100 - 20, 0 - 20).
    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[1]);
    const tab = 100 * 0.2; // 100px cell, TAB_RATIO 0.2
    const targetLeft = 100 - tab;
    const targetTop = 0 - tab;

    // Dragged the way a person would: grab the piece, move, then release
    // slightly off target. The first move is what lifts it out of the tray —
    // it grows to full size under the pointer, so the piece's position only
    // tracks the pointer exactly from the second move onward. Measuring the
    // delta after that first move keeps this independent of the tray scale.
    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 1100,
        clientY: 700,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointermove", {
        clientX: 1140,
        clientY: 700,
        pointerId: 1,
      }),
    );

    const afterLift = {
      x: parseFloat(piece.style.left),
      y: parseFloat(piece.style.top),
    };
    // Aim 12px off in both axes: inside the tolerance, but not the exact spot.
    const dx = targetLeft + 12 - afterLift.x;
    const dy = targetTop + 12 - afterLift.y;

    piece.dispatchEvent(
      new window.PointerEvent("pointermove", {
        clientX: 1140 + dx,
        clientY: 700 + dy,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 1140 + dx,
        clientY: 700 + dy,
        pointerId: 1,
      }),
    );

    expect(piece.classList.contains("is-placed")).toBe(true);
    // Snapped exactly, not left 12px off where the pointer released.
    expect(piece.style.left).toBe(`${targetLeft}px`);
    expect(piece.style.top).toBe(`${targetTop}px`);
  });

  it("returns a wrongly dropped piece to the tray instead of stranding it", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[1]);
    const before = piece.style.left;

    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 0,
        clientY: 0,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointermove", {
        clientX: 9000,
        clientY: 9000,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 9000,
        clientY: 9000,
        pointerId: 1,
      }),
    );

    expect(piece.classList.contains("is-placed")).toBe(false);
    // Back where it started, rather than abandoned at (9000, 9000).
    expect(piece.style.left).toBe(before);
  });

  it("treats a tap as selection rather than a drag", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[0]);

    // Press and release with only 2px of travel — below the drag threshold.
    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointermove", {
        clientX: 102,
        clientY: 101,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 102,
        clientY: 101,
        pointerId: 1,
      }),
    );

    // Selected, not placed and not dragged away — this is what makes the
    // tap-a-piece then tap-a-slot flow work on touch.
    expect(piece.classList.contains("is-selected")).toBe(true);
    expect(piece.classList.contains("is-placed")).toBe(false);
  });

  it("places a selected piece when its own slot is tapped", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[1]);

    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );

    const slots = root.querySelectorAll(".pieceup-slot-button");
    slots[1].click();
    expect(piece.classList.contains("is-placed")).toBe(true);
  });

  it("does not place a selected piece on the wrong slot", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[1]);

    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );

    root.querySelectorAll(".pieceup-slot-button")[2].click();
    expect(piece.classList.contains("is-placed")).toBe(false);
  });

  it("shows progress and move count in the header", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    expect(root.querySelector(".pieceup-progress-label").textContent).toBe(
      "0 / 4 pieces",
    );
    expect(root.querySelector(".pieceup-badge").textContent).toBe("Moves: 0");
    // One pip per piece while the count is small.
    expect(root.querySelectorAll(".pieceup-pip")).toHaveLength(4);
  });

  it("counts a move and lights a pip when a piece is placed", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[1]);
    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    root.querySelectorAll(".pieceup-slot-button")[1].click();

    expect(root.querySelector(".pieceup-progress-label").textContent).toBe(
      "1 / 4 pieces",
    );
    expect(root.querySelector(".pieceup-badge").textContent).toBe("Moves: 1");
    expect(root.querySelectorAll(".pieceup-pip.is-on")).toHaveLength(1);
  });

  it("re-scatters loose pieces on shuffle and spends an attempt", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const before = Array.from(root.querySelectorAll(".pieceup-piece")).map(
      (el) => el.style.left,
    );
    const shuffle = root.querySelector(".pieceup-shuffle");
    expect(shuffle.textContent).toBe("Shuffle (2)");

    shuffle.click();

    expect(shuffle.textContent).toBe("Shuffle (1)");
    const after = Array.from(root.querySelectorAll(".pieceup-piece")).map(
      (el) => el.style.left,
    );
    expect(after).not.toEqual(before);
  });

  it("never undoes placed pieces when shuffling", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));

    const piece = grabbable(root.querySelectorAll(".pieceup-piece")[1]);
    piece.dispatchEvent(
      new window.PointerEvent("pointerdown", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    piece.dispatchEvent(
      new window.PointerEvent("pointerup", {
        clientX: 100,
        clientY: 100,
        pointerId: 1,
      }),
    );
    root.querySelectorAll(".pieceup-slot-button")[1].click();
    const placedLeft = piece.style.left;

    root.querySelector(".pieceup-shuffle").click();

    // Solved work has to survive a shuffle, or the button would be a trap.
    expect(piece.classList.contains("is-placed")).toBe(true);
    expect(piece.style.left).toBe(placedLeft);
  });

  it("disables shuffle once the attempts run out", async () => {
    const root = await openPuzzle(document.getElementById("pieceup-root"));
    const shuffle = root.querySelector(".pieceup-shuffle");

    shuffle.click();
    shuffle.click();

    expect(shuffle.disabled).toBe(true);
    expect(shuffle.textContent).toBe("No shuffles left");
  });
});

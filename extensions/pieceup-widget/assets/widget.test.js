// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "./api.js";

vi.mock("./api.js");

let initPieceUp;

beforeEach(async () => {
  document.body.innerHTML = `<div id="pieceup-root" data-trigger-page="ALL"></div>`;
  vi.mocked(api.fetchConfig).mockResolvedValue({
    imageUrl: "https://example.com/img.jpg",
    pieceCount: 4,
    triggerMode: "BUTTON",
    triggerPage: "ALL",
    triggerDelaySeconds: null,
  });
  vi.mocked(api.fetchStatus).mockResolvedValue(false);
  ({ initPieceUp } = await import("./widget.js"));
});

describe("initPieceUp", () => {
  it("mounts a trigger button and opens the puzzle board on click", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    const button = root.querySelector(".pieceup-trigger");
    expect(button).not.toBeNull();

    button.click();
    const board = root.querySelector(".pieceup-board");
    expect(board).not.toBeNull();
  });

  it("shows the already-played message instead of the board when already played", async () => {
    vi.mocked(api.fetchStatus).mockResolvedValue(true);
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    root.querySelector(".pieceup-trigger").click();
    expect(root.querySelector(".pieceup-message")).not.toBeNull();
    expect(root.querySelector(".pieceup-board")).toBeNull();
  });

  it("positions each piece's background according to its own grid cell (Finding 1)", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    root.querySelector(".pieceup-trigger").click();

    // pieceCount=4 -> rows=2, cols=2, so every piece should get a distinct
    // background-position; if Finding 1's bug were present, every piece
    // would share the same "0px 0px" position.
    const pieces = root.querySelectorAll(".pieceup-piece");
    expect(pieces.length).toBe(4);
    const positions = Array.from(pieces).map((el) => el.style.backgroundPosition);
    expect(new Set(positions).size).toBe(4);

    // DOM order matches buildPieces' row-major order, so the last piece is
    // row 1, col 1 -> shifted by -100px/-100px.
    expect(positions[3]).toBe("-100px -100px");
    // The piece at row 0, col 1 is shifted horizontally only.
    expect(positions[1]).toBe("-100px 0px");
  });

  it("sizes the board and piece backgrounds from rows/cols instead of a hardcoded 300x300 (Finding 2)", async () => {
    vi.mocked(api.fetchConfig).mockResolvedValue({
      imageUrl: "https://example.com/img.jpg",
      pieceCount: 6,
      triggerMode: "BUTTON",
      triggerPage: "ALL",
      triggerDelaySeconds: null,
    });
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    root.querySelector(".pieceup-trigger").click();

    // pieceCount=6 -> rows=ceil(sqrt(6))=3, cols=ceil(6/3)=2 -> a 200x300 board,
    // not the 300x300 box that only fits a 3x3 (pieceCount=9) layout.
    const board = root.querySelector(".pieceup-board");
    expect(board.style.width).toBe("200px");
    expect(board.style.height).toBe("300px");
    expect(board.style.backgroundSize).toBe("200px 300px");

    const piece = root.querySelector(".pieceup-piece");
    expect(piece.style.backgroundSize).toBe("200px 300px");
  });

  it("closes the popup via the close button (Finding 3)", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    root.querySelector(".pieceup-trigger").click();

    const overlay = root.querySelector(".pieceup-overlay");
    expect(overlay.hidden).toBe(false);

    const closeButton = root.querySelector(".pieceup-close");
    expect(closeButton).not.toBeNull();
    closeButton.click();
    expect(overlay.hidden).toBe(true);
  });

  it("closes the popup on Escape and does nothing on Escape while already closed", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    const overlay = root.querySelector(".pieceup-overlay");

    // Escape while closed: no-op, nothing to assert breaking.
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.hidden).toBe(true);

    root.querySelector(".pieceup-trigger").click();
    expect(overlay.hidden).toBe(false);

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.hidden).toBe(true);
  });

  it("snaps a correctly-but-imprecisely dropped piece to its exact target cell, not the drop point (Finding 4)", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    root.querySelector(".pieceup-trigger").click();

    const boardEl = root.querySelector(".pieceup-board");
    boardEl.getBoundingClientRect = () => ({
      left: 1000,
      top: 500,
      width: 200,
      height: 200,
      right: 1200,
      bottom: 700,
    });

    // pieceCount=4 -> rows=2, cols=2; DOM index 1 is row 0, col 1.
    // Its exact target top-left (board-relative) is (100, 0), i.e. viewport
    // (1100, 500). Drop it 10px off in each axis -- still within the 30%
    // (30px) tolerance, so attemptDrop reports correct, but the raw drop
    // point is NOT the exact cell position.
    const pieceEl = root.querySelectorAll(".pieceup-piece")[1];
    pieceEl.setPointerCapture = () => {};
    pieceEl.getBoundingClientRect = () => ({
      left: 1090,
      top: 490,
      width: 100,
      height: 100,
      right: 1190,
      bottom: 590,
    });

    pieceEl.dispatchEvent(new window.PointerEvent("pointerdown", { clientX: 0, clientY: 0, pointerId: 1 }));
    pieceEl.dispatchEvent(new window.PointerEvent("pointerup", { clientX: 0, clientY: 0, pointerId: 1 }));

    expect(pieceEl.classList.contains("pieceup-piece--locked")).toBe(true);
    // Snapped to the exact grid cell (boardRect.left/top + col/row * cellWidth/Height),
    // not left at the imprecise drop position (1090px / 490px).
    expect(pieceEl.style.left).toBe("1100px");
    expect(pieceEl.style.top).toBe("500px");
  });
});

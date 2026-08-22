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
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as api from "./api.js";
import * as app from "./pieceup-app.js";

vi.mock("./api.js");
// The puzzle itself is the reference implementation, bundled by esbuild and
// exercised end to end in Playwright, where there is a layout engine to measure
// against. Mocked here so these tests cover what widget.js is actually
// responsible for: deciding what to show, and carrying the reward back.
vi.mock("./pieceup-app.js");

let initPieceUp;
let handle;

beforeEach(async () => {
  // Call records survive between tests otherwise, so `mock.calls[0]` would
  // point at whatever an earlier test did.
  vi.clearAllMocks();
  document.body.innerHTML = `<div id="pieceup-root" data-trigger-page="ALL"></div>`;
  handle = { setRewardCode: vi.fn(), destroy: vi.fn() };
  vi.mocked(app.mountPuzzle).mockImplementation((container) => {
    // Stands in for the mounted puzzle, so assertions can tell "the puzzle is
    // on screen" from "a message replaced it".
    const marker = document.createElement("div");
    marker.className = "puzzle-kampanya";
    container.appendChild(marker);
    return handle;
  });
  vi.mocked(api.fetchConfig).mockResolvedValue({
    imageUrl: "https://example.com/img.jpg",
    pieceCount: 4,
    triggerMode: "BUTTON",
    triggerPage: "ALL",
    triggerDelaySeconds: null,
  });
  vi.mocked(api.fetchStatus).mockResolvedValue(false);
  vi.mocked(api.trackOpen).mockImplementation(() => {});
  vi.mocked(api.submitCompletion).mockResolvedValue("PIECEUP-TEST");
  vi.resetModules();
  ({ initPieceUp } = await import("./widget.js"));
});

/** Where the widget renders: its own shadow root, out of the theme's reach. */
function ui(root) {
  return root.shadowRoot ?? root;
}

/** The completion callback widget.js handed to the puzzle. */
function completionCallback() {
  return vi.mocked(app.mountPuzzle).mock.calls[0][2];
}

describe("initPieceUp", () => {
  it("mounts a trigger button and opens the puzzle on click", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    const button = ui(root).querySelector(".pieceup-trigger");
    expect(button).not.toBeNull();

    button.click();
    expect(ui(root).querySelector(".puzzle-kampanya")).not.toBeNull();
    expect(app.mountPuzzle).toHaveBeenCalledOnce();
  });

  it("passes the merchant's config through to the puzzle", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    ui(root).querySelector(".pieceup-trigger").click();

    expect(vi.mocked(app.mountPuzzle).mock.calls[0][1]).toMatchObject({
      imageUrl: "https://example.com/img.jpg",
      pieceCount: 4,
    });
  });

  it("shows the already-played message instead of the puzzle", async () => {
    vi.mocked(api.fetchStatus).mockResolvedValue(true);
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    ui(root).querySelector(".pieceup-trigger").click();
    expect(ui(root).querySelector(".pieceup-message")).not.toBeNull();
    expect(app.mountPuzzle).not.toHaveBeenCalled();
  });

  it("hands the reward code to the puzzle's own panel", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    ui(root).querySelector(".pieceup-trigger").click();

    await completionCallback()();

    // Shown in place, over the finished picture, rather than replacing the
    // popup with a bare message.
    expect(handle.setRewardCode).toHaveBeenCalledWith("PIECEUP-TEST");
    expect(ui(root).querySelector(".pieceup-message")).toBeNull();
  });

  it("explains a spent reward allowance without telling the shopper to retry", async () => {
    vi.mocked(api.submitCompletion).mockRejectedValue(
      new Error("reward_limit_reached"),
    );
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    ui(root).querySelector(".pieceup-trigger").click();

    await completionCallback()();

    // The shop ran out of rewards. That isn't the shopper's fault and trying
    // again won't help, so the copy must not suggest it.
    const message = ui(root).querySelector(".pieceup-message").textContent;
    expect(message).toContain("out of rewards");
    expect(message).not.toContain("try again");
  });

  it("asks the shopper to retry when the reward call simply failed", async () => {
    vi.mocked(api.submitCompletion).mockRejectedValue(new Error("network"));
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    ui(root).querySelector(".pieceup-trigger").click();

    await completionCallback()();

    expect(ui(root).querySelector(".pieceup-message").textContent).toContain(
      "try again",
    );
  });

  it("closes the popup via the close button", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    ui(root).querySelector(".pieceup-trigger").click();

    const overlay = ui(root).querySelector(".pieceup-overlay");
    expect(overlay.hidden).toBe(false);
    ui(root).querySelector(".pieceup-close").click();
    expect(overlay.hidden).toBe(true);
  });

  it("closes on Escape, and does nothing on Escape while already closed", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    ui(root).querySelector(".pieceup-trigger").click();

    const overlay = ui(root).querySelector(".pieceup-overlay");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.hidden).toBe(true);

    // A second Escape must be a no-op rather than an error.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.hidden).toBe(true);
  });
});

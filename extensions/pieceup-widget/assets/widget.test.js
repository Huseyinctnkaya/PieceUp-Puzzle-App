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

/**
 * Clicks the trigger and waits for the popup to finish opening.
 *
 * The popup waits for its stylesheets before mounting, and jsdom loads a
 * <link> without ever firing its load event — so the event a browser would
 * fire is dispatched here. Without it these tests would be waiting on the
 * two-second fallback rather than on the behaviour they are about.
 */
async function openPopup(root) {
  ui(root).querySelector(".pieceup-trigger").click();
  for (const link of ui(root).querySelectorAll("link")) {
    link.dispatchEvent(new Event("load"));
  }
  // One turn for the await in open(), one for the mount that follows it.
  await Promise.resolve();
  await Promise.resolve();
}

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

    expect(ui(root).querySelector(".pieceup-trigger")).not.toBeNull();

    await openPopup(root);
    expect(ui(root).querySelector(".puzzle-kampanya")).not.toBeNull();
    expect(app.mountPuzzle).toHaveBeenCalledOnce();
  });

  it("passes the merchant's config through to the puzzle", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    await openPopup(root);

    expect(vi.mocked(app.mountPuzzle).mock.calls[0][1]).toMatchObject({
      imageUrl: "https://example.com/img.jpg",
      pieceCount: 4,
    });
  });

  it("shows the already-played message instead of the puzzle", async () => {
    vi.mocked(api.fetchStatus).mockResolvedValue(true);
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    await openPopup(root);
    expect(ui(root).querySelector(".pieceup-message")).not.toBeNull();
    expect(app.mountPuzzle).not.toHaveBeenCalled();
  });

  it("hands the reward code to the puzzle's own panel", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    await openPopup(root);

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
    await openPopup(root);

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
    await openPopup(root);

    await completionCallback()();

    expect(ui(root).querySelector(".pieceup-message").textContent).toContain(
      "try again",
    );
  });

  it("closes the popup via the close button", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    await openPopup(root);

    const overlay = ui(root).querySelector(".pieceup-overlay");
    expect(overlay.hidden).toBe(false);
    ui(root).querySelector(".pieceup-close").click();
    expect(overlay.hidden).toBe(true);
  });

  it("closes on Escape, and does nothing on Escape while already closed", async () => {
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);
    await openPopup(root);

    const overlay = ui(root).querySelector(".pieceup-overlay");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.hidden).toBe(true);

    // A second Escape must be a no-op rather than an error.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(overlay.hidden).toBe(true);
  });

  it("still shows the puzzle when the play check fails", async () => {
    vi.mocked(api.fetchStatus).mockRejectedValue(new Error("network"));
    const root = document.getElementById("pieceup-root");
    await initPieceUp(root);

    // The check only decides which message to show; the server refuses a
    // second reward on its own. A widget that disappears because one request
    // failed is much the worse outcome.
    expect(ui(root).querySelector(".pieceup-trigger")).not.toBeNull();
  });

  it("says so in the console when it cannot start at all", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(api.fetchConfig).mockRejectedValue(new Error("config_down"));
    const root = document.getElementById("pieceup-root");

    await initPieceUp(root);

    // Without this the storefront shows nothing and explains nothing, which
    // is indistinguishable from the app not being installed.
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("PieceUp"),
      expect.any(Error),
    );
    logged.mockRestore();
  });

});
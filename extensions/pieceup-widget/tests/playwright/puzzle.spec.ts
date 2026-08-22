import { test, expect } from "@playwright/test";

// Served by the static file server configured as `webServer` in
// playwright.config.ts (baseURL points at it), so relative fetch() calls
// from widget.js resolve to real http(s) URLs that page.route() can
// intercept — a file:// origin can't do either of those things. That
// server's root is extensions/pieceup-widget/ (see static-server.mjs), so
// this path is relative to there, not the repo root.
const fixtureUrl = "/tests/playwright/fixture.html";

test("completes a 2x2 puzzle via pointer drag and shows the reward code", async ({ page }) => {
  await page.route("**/apps/pieceup/config", (route) =>
    route.fulfill({
      json: {
        config: {
          imageUrl: "https://example.com/img.jpg",
          pieceCount: 4,
          triggerMode: "BUTTON",
          triggerPage: "ALL",
          triggerDelaySeconds: null,
        },
      },
    }),
  );
  await page.route("**/apps/pieceup/status*", (route) =>
    route.fulfill({ json: { alreadyPlayed: false } }),
  );
  await page.route("**/apps/pieceup/complete", (route) =>
    route.fulfill({ json: { discountCode: "PIECEUP-TEST99" } }),
  );

  await page.goto(fixtureUrl);
  await page.evaluate(() => (window as any).__initPieceUp(document.getElementById("pieceup-root")));

  await page.click(".pieceup-trigger");

  const pieces = page.locator(".pieceup-piece");
  const board = page.locator(".pieceup-board");
  const count = await pieces.count();

  for (let i = 0; i < count; i++) {
    const piece = pieces.nth(i);
    const pieceBox = await piece.boundingBox();
    if (!pieceBox) throw new Error("missing piece bounding box");

    await page.mouse.move(pieceBox.x + 50, pieceBox.y + 50);
    await page.mouse.down();

    // wireDrag() in widget.js switches the piece to `position: fixed` on the
    // very first pointermove, pulling it out of the tray's flex flow. That
    // shrinks the tray and (since the overlay vertically centers the popup)
    // reflows the whole popup, moving the board on screen. A nudge move
    // settles that reflow before we measure the board, so the target
    // coordinates we drag to reflect where the board actually ends up
    // rather than its pre-drag position.
    await page.mouse.move(pieceBox.x + 51, pieceBox.y + 51);

    const boardBox = await board.boundingBox();
    if (!boardBox) throw new Error("missing board bounding box");
    const targetX = boardBox.x + (i % 2) * 100 + 50;
    const targetY = boardBox.y + Math.floor(i / 2) * 100 + 50;

    await page.mouse.move(targetX, targetY, { steps: 5 });
    await page.mouse.up();
  }

  await expect(page.locator(".pieceup-message")).toContainText("PIECEUP-TEST99");
});

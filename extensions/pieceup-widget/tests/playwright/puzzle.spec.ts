import { test, expect } from "@playwright/test";

// Served by the static file server configured as `webServer` in
// playwright.config.ts (baseURL points at it), so relative fetch() calls
// from widget.js resolve to real http(s) URLs that page.route() can
// intercept — a file:// origin can't do either of those things. That
// server's root is extensions/pieceup-widget/ (see static-server.mjs), so
// this path is relative to there, not the repo root.
const fixtureUrl = "/tests/playwright/fixture.html";

test("completes a 2x2 puzzle via pointer drag and shows the reward code", async ({
  page,
}) => {
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

  // Wide enough for the side-by-side layout, which is the arrangement most
  // shoppers see; the stacked one is covered by the unit tests.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(fixtureUrl);
  // The fixture hangs initPieceUp off window so the test can start the widget
  // on demand; declaring the property is what keeps this off `any`.
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });

  await page.click(".pieceup-trigger");

  const board = page.locator(".pieceup-board");
  await expect(board).toBeVisible();

  const pieces = page.locator(".pieceup-piece");
  const count = await pieces.count();
  expect(count).toBe(4);

  const boardBox = await board.boundingBox();
  if (!boardBox) throw new Error("missing board bounding box");
  // 4 pieces → a 2x2 grid over the board.
  const cellWidth = boardBox.width / 2;
  const cellHeight = boardBox.height / 2;

  for (let i = 0; i < count; i++) {
    const piece = pieces.nth(i);
    const pieceBox = await piece.boundingBox();
    if (!pieceBox) throw new Error("missing piece bounding box");

    // Grab at the piece's centre, wherever it happens to be scattered.
    const grabX = pieceBox.x + pieceBox.width / 2;
    const grabY = pieceBox.y + pieceBox.height / 2;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();

    // The first move lifts the piece out of the tray, where it grows from tray
    // scale to full size under the pointer. Its position only tracks the
    // pointer one-for-one after that, so the drag is aimed using the delta
    // measured from here rather than from the pre-lift position.
    await page.mouse.move(grabX + 4, grabY + 4);

    const lifted = await piece.boundingBox();
    if (!lifted) throw new Error("missing lifted bounding box");
    const liftedCentreX = lifted.x + lifted.width / 2;
    const liftedCentreY = lifted.y + lifted.height / 2;

    // DOM order is row-major, so piece i belongs to row floor(i/2), col i%2.
    const targetCentreX = boardBox.x + ((i % 2) + 0.5) * cellWidth;
    const targetCentreY = boardBox.y + (Math.floor(i / 2) + 0.5) * cellHeight;

    await page.mouse.move(
      grabX + 4 + (targetCentreX - liftedCentreX),
      grabY + 4 + (targetCentreY - liftedCentreY),
      { steps: 5 },
    );
    await page.mouse.up();

    // Each piece must actually land before the next is dragged — otherwise a
    // silent placement failure would only surface as a confusing timeout on
    // the final message assertion.
    await expect(piece).toHaveClass(/is-placed/);
  }

  await expect(page.locator(".pieceup-message")).toContainText(
    "PIECEUP-TEST99",
  );
});

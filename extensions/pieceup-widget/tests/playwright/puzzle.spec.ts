import { test, expect, type Page } from "@playwright/test";

// Served by the static file server configured as `webServer` in
// playwright.config.ts (baseURL points at it), so relative fetch() calls
// from widget.js resolve to real http(s) URLs that page.route() can
// intercept — a file:// origin can't do either of those things. That
// server's root is extensions/pieceup-widget/ (see static-server.mjs), so
// this path is relative to there, not the repo root.
const fixtureUrl = "/tests/playwright/fixture.html";

/**
 * Waits until the pieces stop moving.
 *
 * Pieces animate into place over 220ms, and getBoundingClientRect reports the
 * interpolated geometry mid-flight — so measuring or clicking too early reads
 * a position no piece ever actually occupies.
 */
async function waitForPiecesSettled(page: Page) {
  await page.waitForFunction(() => {
    const piece = document.querySelector(".pieceup-piece");
    if (!piece) return false;
    const width = Math.round(piece.getBoundingClientRect().width);
    const store = window as unknown as { __w?: number; __stable?: number };
    store.__stable = store.__w === width ? (store.__stable ?? 0) + 1 : 0;
    store.__w = width;
    return (store.__stable ?? 0) >= 3;
  });
}


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

  // The puzzle opens on a preview behind glass; the pieces only appear once
  // the shopper opts in.
  await expect(page.locator(".pieceup-piece").first()).toBeHidden();
  await page.click(".pieceup-start");
  await expect(page.locator(".pieceup-gate")).toBeHidden();

  const pieces = page.locator(".pieceup-piece");
  const count = await pieces.count();
  expect(count).toBe(4);
  await waitForPiecesSettled(page);

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

// A genuinely valid 200x100 PNG. A malformed one never fires image.onload,
// which silently skips the board's aspect-ratio handling — so the ratio
// assertion below would pass against a square board and prove nothing.
const WIDE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAC6ElEQVR4nO3SeesYAgCA4d9oCBk5muWICdnE2sgIORpCRo72riFkW0O2jByNbMsRwtpk1pAts4ZYM2EhR6/lyBELy5FpsxyNbEL5Gv54n8/wDAzgINwOt8fBuAPuiDvhzrgL7oq74RDcHffAPXEv3Bv3waG4Lw7D/XB/PAAPxIPwYByOh+CheBgejkfgCByJR+JReDSOwtE4Bo/BY/E4HIvH4wl4Ip6EJ+MpeCqehqfjODwDz8Sz8Gw8B8/F83A8no8X4IV4EV6Ml+AEBCfiJLwUL8PL8Qq8Eq/Cq3EyTsGpOA2vwWvxOrwep+MMvAFn4o14E96Mt+CteBvOwtvxDrwTZ+McnIt34d14D96L9+H9+AA+iA/hwzgP5+MCfAQfxYX4GC7Cxfg4PoFP4lO4BJfi07gMn8HluAKfxefweXwBX8SVuApfwtX4Mr6Cr+JruAZfxzfwTXwL38Z38F0U38O1+D5+gB/iR/gxfoKf4mf4OX6B6/BL/Aq/xvX4DX6L3+H3+ANuwB9xI27Cn3Az/oy/4K/4G27B3/EP/BO34jb8C//Gf/BfHChWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhXr/x3rP5chGL7lzUSdAAAAAElFTkSuQmCC";

/**
 * The pieces have to be reachable without scrolling. A narrow viewport puts the
 * tray under the board, and it used to land past the bottom of the popup: the
 * puzzle looked empty and the pieces couldn't be dragged at all.
 */
for (const [width, height] of [
  [560, 800],
  [900, 800],
  [1440, 900],
]) {
  test(`fits the viewport at ${width}x${height}`, async ({ page }) => {
    await page.route("**/apps/pieceup/config", (route) =>
      route.fulfill({
        json: {
          config: {
            imageUrl: WIDE_IMAGE,
            pieceCount: 9,
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

    await page.setViewportSize({ width, height });
    await page.goto(fixtureUrl);
    await page.evaluate(() => {
      const w = window as unknown as {
        __initPieceUp: (root: HTMLElement | null) => Promise<void>;
      };
      return w.__initPieceUp(document.getElementById("pieceup-root"));
    });
    await page.click(".pieceup-trigger");
    await page.click(".pieceup-start");
    await expect(page.locator(".pieceup-piece").first()).toBeVisible();
    await waitForPiecesSettled(page);

    const result = await page.evaluate((viewportHeight) => {
      const pick = (selector: string) =>
        document.querySelector(selector) as HTMLElement;
      const tray = pick(".pieceup-tray").getBoundingClientRect();
      const board = pick(".pieceup-board").getBoundingClientRect();
      const popup = pick(".pieceup-popup");
      const pieces = Array.from(
        document.querySelectorAll(".pieceup-piece"),
      ).map((piece) => piece.getBoundingClientRect());
      const card = pick(".pieceup-card").getBoundingClientRect();

      // Every piece must be grabbable where a player would aim: its centre. The
      // tray overlaps pieces on purpose, and overlapping too far put some
      // centres underneath a neighbour, so a pointerdown there dragged the
      // wrong piece — or, for the topmost piece, nothing the player intended.
      const unreachable = Array.from(
        document.querySelectorAll(".pieceup-piece"),
      ).filter((piece) => {
        const rect = piece.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return !piece.contains(hit);
      }).length;

      return {
        unreachablePieces: unreachable,
        trayVisible: tray.bottom <= viewportHeight && tray.top >= 0,
        popupScrolls: popup.scrollHeight > popup.clientHeight + 1,
        offscreenPieces: pieces.filter(
          (rect) => rect.bottom > viewportHeight || rect.top < 0,
        ).length,
        // Sideways overflow clips pieces against the card edge, which reads as
        // half-drawn pieces rather than as something scrolled out of view.
        clippedPieces: pieces.filter(
          (rect) => rect.right > card.right + 1 || rect.left < card.left - 1,
        ).length,
        trayOverflowsCard: tray.right > card.right + 1,
        boardRatio: board.width / board.height,
      };
    }, height);

    expect(result.unreachablePieces).toBe(0);
    expect(result.trayVisible).toBe(true);
    expect(result.popupScrolls).toBe(false);
    expect(result.offscreenPieces).toBe(0);
    expect(result.trayOverflowsCard).toBe(false);
    expect(result.clippedPieces).toBe(0);
    // The board must keep the image's proportions: capping its height used to
    // clamp height while leaving width alone, which stretched the picture.
    expect(result.boardRatio).toBeCloseTo(2, 1);
  });
}

test("shows the merchant's copy above the card, as text not markup", async ({
  page,
}) => {
  await page.route("**/apps/pieceup/config", (route) =>
    route.fulfill({
      json: {
        config: {
          badgeLabel: "Win a reward",
          headline: "Solve the puzzle",
          // Merchant-authored copy reaches every shopper's page, so it must
          // never be parsed as markup.
          description: "<img src=x onerror=alert(1)>Drag the pieces",
          imageUrl: WIDE_IMAGE,
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

  await page.goto(fixtureUrl);
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });
  await page.click(".pieceup-trigger");

  await expect(page.locator(".pieceup-intro-badge")).toContainText(
    "Win a reward",
  );
  await expect(page.locator(".pieceup-intro-title")).toHaveText(
    "Solve the puzzle",
  );
  await expect(page.locator(".pieceup-intro-text")).toHaveText(
    "<img src=x onerror=alert(1)>Drag the pieces",
  );
  await expect(page.locator(".pieceup-intro-text img")).toHaveCount(0);
});

test("omits the intro entirely when the merchant wrote none", async ({
  page,
}) => {
  await page.route("**/apps/pieceup/config", (route) =>
    route.fulfill({
      json: {
        config: {
          badgeLabel: null,
          headline: null,
          description: null,
          imageUrl: WIDE_IMAGE,
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

  await page.goto(fixtureUrl);
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });
  await page.click(".pieceup-trigger");

  await expect(page.locator(".pieceup-card")).toBeVisible();
  // An empty heading block would push the puzzle down for no reason.
  await expect(page.locator(".pieceup-intro")).toHaveCount(0);
});

/**
 * The stylesheet and the layout code must not disagree about where the tray is.
 *
 * The widget runs inside whatever theme the merchant uses, so its CSS can be
 * overridden, cached at an older version, or simply lose to a more specific
 * rule. When that happened the board stacked above the tray while the layout
 * code -- reading the breakpoint instead of the page -- still measured as
 * though the tray sat beside it, and every piece was positioned into empty
 * space outside the card.
 */
test("survives a theme that overrides the stage layout", async ({ page }) => {
  await page.route("**/apps/pieceup/config", (route) =>
    route.fulfill({
      json: {
        config: {
          imageUrl: WIDE_IMAGE,
          pieceCount: 9,
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

  // Wide enough that the breakpoint says "side by side", while the page's own
  // CSS stacks them anyway -- exactly the mismatch a real theme can cause.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(fixtureUrl);
  await page.addStyleTag({
    content: [
      // Kills the pieces' coordinate space: without a positioned stage they
      // resolve against the fixed, viewport-sized overlay instead, and land
      // outside the popup entirely.
      // Strips the positioned ancestors out from under the pieces, so they
      // resolve against the viewport-sized overlay: the exact failure a
      // merchant hit, where every piece landed outside the popup.
      ".pieceup-stage { position: static !important; }",
      ".pieceup-popup { position: static !important; }",
      ".pieceup-stage { flex-direction: column !important; }",
      ".pieceup-board { flex: none !important; width: 100% !important; }",
      ".pieceup-tray { flex: none !important; width: 100% !important; }",
    ].join("\n"),
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });
  await page.click(".pieceup-trigger");
  await page.click(".pieceup-start");
  await waitForPiecesSettled(page);

  // The inline declaration has to beat the theme's !important rule, or the
  // pieces lose their coordinate space and the assertion below is vacuous.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".pieceup-stage")!).position,
      ),
    )
    .toBe("relative");

  const strays = await page.evaluate(() => {
    const card = document
      .querySelector(".pieceup-card")!
      .getBoundingClientRect();
    return Array.from(document.querySelectorAll(".pieceup-piece")).filter(
      (piece) => {
        const rect = piece.getBoundingClientRect();
        return (
          rect.right < card.left ||
          rect.left > card.right ||
          rect.bottom < card.top ||
          rect.top > card.bottom
        );
      },
    ).length;
  });

  expect(strays).toBe(0);
});

import { test, expect, type Page } from "@playwright/test";

// Served by the static file server configured as `webServer` in
// playwright.config.ts, so the relative fetch() calls widget.js makes resolve
// to real http URLs that page.route() can intercept.
const fixtureUrl = "/tests/playwright/fixture.html";

// A genuinely valid 200x100 PNG. A malformed one never fires the image's load
// event, and the board silently keeps a square aspect ratio instead.
const WIDE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAC6ElEQVR4nO3SeesYAgCA4d9oCBk5muWICdnE2sgIORpCRo72riFkW0O2jByNbMsRwtpk1pAts4ZYM2EhR6/lyBELy5FpsxyNbEL5Gv54n8/wDAzgINwOt8fBuAPuiDvhzrgL7oq74RDcHffAPXEv3Bv3waG4Lw7D/XB/PAAPxIPwYByOh+CheBgejkfgCByJR+JReDSOwtE4Bo/BY/E4HIvH4wl4Ip6EJ+MpeCqehqfjODwDz8Sz8Gw8B8/F83A8no8X4IV4EV6Ml+AEBCfiJLwUL8PL8Qq8Eq/Cq3EyTsGpOA2vwWvxOrwep+MMvAFn4o14E96Mt+CteBvOwtvxDrwTZ+McnIt34d14D96L9+H9+AA+iA/hwzgP5+MCfAQfxYX4GC7Cxfg4PoFP4lO4BJfi07gMn8HluAKfxefweXwBX8SVuApfwtX4Mr6Cr+JruAZfxzfwTXwL38Z38F0U38O1+D5+gB/iR/gxfoKf4mf4OX6B6/BL/Aq/xvX4DX6L3+H3+ANuwB9xI27Cn3Az/oy/4K/4G27B3/EP/BO34jb8C//Gf/BfHChWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhXr/x3rP5chGL7lzUSdAAAAAElFTkSuQmCC";

type ConfigOverrides = Record<string, unknown>;

/** Loads the widget with a given config, without opening the popup. */
async function setUpPuzzle(page: Page, overrides: ConfigOverrides = {}) {
  // The trailing star matters: fetchConfig() appends ?identityKey=... so the
  // A/B test can resolve the variant, and a pattern without it stops matching.
  // The request then reaches the static server, 404s, and the widget mounts
  // nothing at all — which surfaces as every locator in the file timing out.
  await page.route("**/apps/pieceup/config*", (route) =>
    route.fulfill({
      json: {
        config: {
          headline: "Solve the puzzle",
          imageUrl: WIDE_IMAGE,
          pieceCount: 4,
          triggerMode: "BUTTON",
          triggerPage: "ALL",
          triggerDelaySeconds: null,
          ...overrides,
        },
      },
    }),
  );
  await page.route("**/apps/pieceup/status*", (route) =>
    route.fulfill({ json: { alreadyPlayed: false } }),
  );
  await page.route("**/apps/pieceup/track", (route) =>
    route.fulfill({ json: { ok: true } }),
  );

  // Only navigate if the caller hasn't already — a test may need to set the
  // page up (injecting CSS, say) before the widget initialises.
  if (!page.url().includes("fixture.html")) await page.goto(fixtureUrl);
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });
}

/** Loads the widget and opens the popup from its trigger button. */
async function openPuzzle(page: Page, overrides: ConfigOverrides = {}) {
  await setUpPuzzle(page, overrides);
  await page.click(".pieceup-trigger");
}

test("opens on a start screen and reveals the pieces once started", async ({
  page,
}) => {
  await openPuzzle(page);

  // The reference opens on the finished picture behind glass.
  await expect(page.locator(".ortu .ana-buton")).toBeVisible();
  await page.click(".ortu .ana-buton");
  await expect(page.locator(".ortu")).toHaveCount(0);

  await expect(page.locator(".parca")).toHaveCount(4);
  await expect(page.locator(".tahta")).toBeVisible();
  await expect(page.locator(".tepsi")).toBeVisible();
});

test("places a piece dragged onto its slot", async ({ page }) => {
  await openPuzzle(page);
  await page.click(".ortu .ana-buton");

  const board = await page.locator(".tahta").boundingBox();
  if (!board) throw new Error("missing board");

  // The tray deliberately piles the pieces up, so most of them are partly
  // covered. The last one in document order is the one painted on top, and so
  // the only one guaranteed to receive a pointerdown at its centre.
  const piece = page.locator(".parca").last();
  const label = (await piece.getAttribute("aria-label")) ?? "";
  const index = Number((label.match(/\d+/) ?? ["1"])[0]) - 1;

  const before = await piece.boundingBox();
  if (!before) throw new Error("missing piece");
  const grabX = before.x + before.width / 2;
  const grabY = before.y + before.height / 2;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  // Past the 5px threshold that separates a drag from a tap, and far enough
  // that the piece has dropped its tray scale before it is measured.
  await page.mouse.move(grabX + 40, grabY + 40, { steps: 6 });
  await page.waitForTimeout(150);

  const lifted = await piece.boundingBox();
  if (!lifted) throw new Error("missing lifted piece");
  const col = index % 2;
  const row = Math.floor(index / 2);
  const targetX = board.x + (col + 0.5) * (board.width / 2);
  const targetY = board.y + (row + 0.5) * (board.height / 2);

  await page.mouse.move(
    grabX + 40 + (targetX - (lifted.x + lifted.width / 2)),
    grabY + 40 + (targetY - (lifted.y + lifted.height / 2)),
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(page.locator(".ilerleme-yazisi")).toHaveText("1 / 4");
});

test("shows the merchant's copy above the card", async ({ page }) => {
  await openPuzzle(page, {
    badgeLabel: "Win a reward",
    headline: "Solve the puzzle",
    description: "Drag every piece onto the board.",
  });

  await expect(page.locator(".ust-etiket")).toContainText("Win a reward");
  await expect(page.locator(".kampanya-baslik")).toHaveText(
    "Solve the puzzle",
  );
  await expect(page.locator(".kampanya-aciklama")).toContainText(
    "Drag every piece onto the board.",
  );
});

test("tells a returning shopper they've already played", async ({ page }) => {
  await page.route("**/apps/pieceup/config*", (route) =>
    route.fulfill({
      json: {
        config: {
          headline: "Solve",
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
    route.fulfill({ json: { alreadyPlayed: true } }),
  );

  await page.goto(fixtureUrl);
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });
  await page.click(".pieceup-trigger");

  await expect(page.locator(".pieceup-message")).toContainText(
    "already played",
  );
  await expect(page.locator(".parca")).toHaveCount(0);
});

/**
 * The widget renders on a page whose CSS belongs to the merchant.
 *
 * A theme rule that takes `position` off an ancestor is enough to break the
 * puzzle: the pieces are positioned absolutely inside their stage, so they
 * resolve against whatever is positioned further up and land off the popup,
 * leaving the tray looking empty. That is what a merchant hit. Rendering in a
 * shadow root is what stops page CSS reaching them at all, and this is the test
 * that says so — the rules below are deliberately as hostile as CSS allows.
 */
test("is not affected by the page's own stylesheet", async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.addStyleTag({
    content: [
      ".puzzle-alan, .tahta, .tepsi, .oyun-sarmal, .oyun-kutusu {",
      "  position: static !important;",
      "  display: block !important;",
      "  width: auto !important;",
      "  transform: none !important;",
      "}",
      ".parca { position: static !important; visibility: hidden !important; }",
    ].join("\n"),
  });

  await openPuzzle(page);
  await page.click(".ortu .ana-buton");

  const geometry = await page.evaluate(() => {
    const shadow = document.getElementById("pieceup-root")!.shadowRoot!;
    const card = shadow
      .querySelector(".oyun-kutusu")!
      .getBoundingClientRect();
    const pieces = Array.from(shadow.querySelectorAll(".parca"));
    return {
      count: pieces.length,
      // Every piece must still be laid out inside the card the shopper sees.
      strays: pieces.filter((piece) => {
        const rect = piece.getBoundingClientRect();
        return (
          rect.right < card.left ||
          rect.left > card.right ||
          rect.bottom < card.top ||
          rect.top > card.bottom
        );
      }).length,
      hidden: pieces.filter(
        (piece) => getComputedStyle(piece).visibility === "hidden",
      ).length,
    };
  });

  expect(geometry.count).toBe(4);
  expect(geometry.strays).toBe(0);
  expect(geometry.hidden).toBe(0);
});

/**
 * The trigger has to be a button in the corner of the viewport, not merely a
 * button that exists.
 *
 * Its styling lives in the stylesheet the widget loads into its shadow root.
 * When that failed to load, the trigger fell back to an unstyled button at the
 * foot of the page — present, clickable, and invisible to anyone looking for
 * it. Clicking it in a test still passed, which is how this reached a
 * merchant.
 */
test("shows the trigger fixed in the corner of the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPuzzle(page);

  const trigger = page.locator(".pieceup-trigger");
  await expect(trigger).toBeVisible();

  const placement = await page.evaluate(() => {
    const button = document
      .getElementById("pieceup-root")!
      .shadowRoot!.querySelector(".pieceup-trigger")!;
    const rect = button.getBoundingClientRect();
    return {
      position: getComputedStyle(button).position,
      width: Math.round(rect.width),
      fromRight: Math.round(window.innerWidth - rect.right),
      fromBottom: Math.round(window.innerHeight - rect.bottom),
    };
  });

  expect(placement.position).toBe("fixed");
  expect(placement.width).toBe(56);
  expect(placement.fromRight).toBe(20);
  expect(placement.fromBottom).toBe(20);
});

/**
 * The merchant's gameplay settings have to survive the whole trip: the app
 * proxy's JSON, the mapping in entry.tsx, and the puzzle's own props. Asserting
 * on what actually renders is the only way to catch a name that stops matching
 * somewhere in the middle.
 */
test("puts the tray where the merchant asked", async ({ page }) => {
  await openPuzzle(page, { trayPosition: "left" });
  await page.click(".ortu .ana-buton");

  const trayIsLeftOfBoard = await page.evaluate(() => {
    const shadow = document.getElementById("pieceup-root")!.shadowRoot!;
    const board = shadow.querySelector(".tahta")!.getBoundingClientRect();
    const tray = shadow.querySelector(".tepsi")!.getBoundingClientRect();
    return tray.right <= board.left + 1;
  });

  expect(trayIsLeftOfBoard).toBe(true);
});

test("applies the difficulty the merchant chose", async ({ page }) => {
  // Hard tolerance is a fraction of a cell, so a piece dropped well short of
  // its slot must be rejected where an easy puzzle would have accepted it.
  await openPuzzle(page, { difficulty: "hard", pieceCount: 4 });
  await page.click(".ortu .ana-buton");

  const board = await page.locator(".tahta").boundingBox();
  const piece = page.locator(".parca").last();
  const before = await piece.boundingBox();
  if (!board || !before) throw new Error("missing geometry");

  const grabX = before.x + before.width / 2;
  const grabY = before.y + before.height / 2;
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await page.mouse.move(grabX + 40, grabY + 40, { steps: 6 });
  await page.waitForTimeout(150);

  const lifted = await piece.boundingBox();
  if (!lifted) throw new Error("missing lifted piece");
  const label = (await piece.getAttribute("aria-label")) ?? "";
  const index = Number((label.match(/\d+/) ?? ["1"])[0]) - 1;
  const cellWidth = board.width / 2;
  const cellHeight = board.height / 2;
  // Tolerance is a fraction of the *shorter* cell side: 0.5 on easy, 0.22 on
  // hard. Aiming 0.35 of it off therefore lands on easy and misses on hard,
  // which is what makes this an assertion about the setting rather than about
  // dropping a piece badly.
  const targetX =
    board.x + ((index % 2) + 0.5) * cellWidth + cellHeight * 0.35;
  const targetY = board.y + (Math.floor(index / 2) + 0.5) * cellHeight;

  await page.mouse.move(
    grabX + 40 + (targetX - (lifted.x + lifted.width / 2)),
    grabY + 40 + (targetY - (lifted.y + lifted.height / 2)),
    { steps: 8 },
  );
  await page.mouse.up();
  await page.waitForTimeout(300);

  await expect(page.locator(".ilerleme-yazisi")).toHaveText("0 / 4");
});

/**
 * How the puzzle opens is the merchant's choice, and each mode has to be
 * distinguishable from the others — a mode that quietly behaves like "button"
 * is the setting doing nothing.
 */
test("opens on its own when the merchant asked it to", async ({ page }) => {
  await setUpPuzzle(page, { triggerMode: "AUTO", triggerDelaySeconds: 0 });

  // No click: that is the whole point of the mode.
  await expect(page.locator(".ortu .ana-buton")).toBeVisible();
  // And no trigger button to press, since the merchant did not ask for one.
  await expect(page.locator(".pieceup-trigger")).toHaveCount(0);
});

test("offers both a button and an automatic open when asked for both", async ({
  page,
}) => {
  await setUpPuzzle(page, { triggerMode: "BOTH", triggerDelaySeconds: 0 });

  await expect(page.locator(".pieceup-trigger")).toHaveCount(1);
  await expect(page.locator(".ortu .ana-buton")).toBeVisible();
});

test("waits the delay the merchant set before opening", async ({ page }) => {
  await setUpPuzzle(page, { triggerMode: "AUTO", triggerDelaySeconds: 2 });

  // Still shut a moment in: a delay that opens immediately is not a delay.
  await page.waitForTimeout(300);
  await expect(page.locator(".pieceup-overlay")).toBeHidden();

  await expect(page.locator(".ortu .ana-buton")).toBeVisible({ timeout: 4000 });
});

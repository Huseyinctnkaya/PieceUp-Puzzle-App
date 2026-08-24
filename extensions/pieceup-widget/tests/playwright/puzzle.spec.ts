import { test, expect, type Page } from "@playwright/test";

// Served by the static file server configured as `webServer` in
// playwright.config.ts, so the relative fetch() calls widget.js makes resolve
// to real http URLs that page.route() can intercept.
const fixtureUrl = "/tests/playwright/fixture.html";

// A genuinely valid 200x100 PNG. A malformed one never fires the image's load
// event, and the board silently keeps a square aspect ratio instead.
const WIDE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAC6ElEQVR4nO3SeesYAgCA4d9oCBk5muWICdnE2sgIORpCRo72riFkW0O2jByNbMsRwtpk1pAts4ZYM2EhR6/lyBELy5FpsxyNbEL5Gv54n8/wDAzgINwOt8fBuAPuiDvhzrgL7oq74RDcHffAPXEv3Bv3waG4Lw7D/XB/PAAPxIPwYByOh+CheBgejkfgCByJR+JReDSOwtE4Bo/BY/E4HIvH4wl4Ip6EJ+MpeCqehqfjODwDz8Sz8Gw8B8/F83A8no8X4IV4EV6Ml+AEBCfiJLwUL8PL8Qq8Eq/Cq3EyTsGpOA2vwWvxOrwep+MMvAFn4o14E96Mt+CteBvOwtvxDrwTZ+McnIt34d14D96L9+H9+AA+iA/hwzgP5+MCfAQfxYX4GC7Cxfg4PoFP4lO4BJfi07gMn8HluAKfxefweXwBX8SVuApfwtX4Mr6Cr+JruAZfxzfwTXwL38Z38F0U38O1+D5+gB/iR/gxfoKf4mf4OX6B6/BL/Aq/xvX4DX6L3+H3+ANuwB9xI27Cn3Az/oy/4K/4G27B3/EP/BO34jb8C//Gf/BfHChWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhXr/x3rP5chGL7lzUSdAAAAAElFTkSuQmCC";

type ConfigOverrides = Record<string, unknown>;

async function openPuzzle(page: Page, overrides: ConfigOverrides = {}) {
  await page.route("**/apps/pieceup/config", (route) =>
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

  await page.goto(fixtureUrl);
  await page.evaluate(() => {
    const w = window as unknown as {
      __initPieceUp: (root: HTMLElement | null) => Promise<void>;
    };
    return w.__initPieceUp(document.getElementById("pieceup-root"));
  });
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
  await page.route("**/apps/pieceup/config", (route) =>
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

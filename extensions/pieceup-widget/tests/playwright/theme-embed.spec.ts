import { test, expect } from "@playwright/test";

/**
 * The theme block's own entry path.
 *
 * Every other test calls initPieceUp itself, which skips the part a real store
 * actually runs: a module script that waits for DOMContentLoaded and passes it
 * the embed's div. A break there shows up as the widget simply not being on
 * the page, and nothing else here would catch it.
 */
const fixtureUrl = "/tests/playwright/theme-fixture.html";

const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAC6ElEQVR4nO3SeesYAgCA4d9oCBk5muWICdnE2sgIORpCRo72riFkW0O2jByNbMsRwtpk1pAts4ZYM2EhR6/lyBELy5FpsxyNbEL5Gv54n8/wDAzgINwOt8fBuAPuiDvhzrgL7oq74RDcHffAPXEv3Bv3waG4Lw7D/XB/PAAPxIPwYByOh+CheBgejkfgCByJR+JReDSOwtE4Bo/BY/E4HIvH4wl4Ip6EJ+MpeCqehqfjODwDz8Sz8Gw8B8/F83A8no8X4IV4EV6Ml+AEBCfiJLwUL8PL8Qq8Eq/Cq3EyTsGpOA2vwWvxOrwep+MMvAFn4o14E96Mt+CteBvOwtvxDrwTZ+McnIt34d14D96L9+H9+AA+iA/hwzgP5+MCfAQfxYX4GC7Cxfg4PoFP4lO4BJfi07gMn8HluAKfxefweXwBX8SVuApfwtX4Mr6Cr+JruAZfxzfwTXwL38Z38F0U38O1+D5+gB/iR/gxfoKf4mf4OX6B6/BL/Aq/xvX4DX6L3+H3+ANuwB9xI27Cn3Az/oy/4K/4G27B3/EP/BO34jb8C//Gf/BfHChWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhXr/x3rP5chGL7lzUSdAAAAAElFTkSuQmCC";

async function serveConfig(page: import("@playwright/test").Page, config = {}) {
  await page.route("**/apps/pieceup/config", (route) =>
    route.fulfill({
      json: {
        config: {
          headline: "Solve the puzzle",
          imageUrl: IMAGE,
          pieceCount: 4,
          triggerMode: "BUTTON",
          triggerPage: "ALL",
          triggerDelaySeconds: null,
          ...config,
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
}

test("mounts from the theme block without being called by hand", async ({
  page,
}) => {
  await serveConfig(page);
  await page.goto(fixtureUrl);

  await expect(page.locator(".pieceup-trigger")).toHaveCount(1);
});

test("opens on its own from the theme block", async ({ page }) => {
  await serveConfig(page, { triggerMode: "AUTO", triggerDelaySeconds: 0 });
  await page.goto(fixtureUrl);

  await expect(page.locator(".ortu .ana-buton")).toBeVisible();
});

test("survives a config request that fails", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.route("**/apps/pieceup/config", (route) =>
    route.fulfill({ status: 500, body: "boom" }),
  );
  await page.goto(fixtureUrl);
  await page.waitForTimeout(500);

  // Nothing on the page, but the reason is in the console — otherwise a broken
  // proxy and an uninstalled app look exactly alike.
  await expect(page.locator(".pieceup-trigger")).toHaveCount(0);
  expect(errors.join(" ")).toContain("PieceUp");
});

/** Opens the popup on a puzzle already finished, offering one boxed prize. */
async function finishWith(
  page: import("@playwright/test").Page,
  gift: Record<string, unknown>,
  discountCode: string | null,
  extraConfig: Record<string, unknown> = {},
) {
  await serveConfig(page, {
    pieceCount: 4,
    giftStep: true,
    giftBoxMode: true,
    gifts: [gift],
    ...extraConfig,
  });
  await page.route("**/apps/pieceup/complete", (route) =>
    route.fulfill({ json: { discountCode } }),
  );
  // Seeded as finished through the same saved progress a returning shopper
  // would have, rather than dragging four pieces to reach the panel.
  await page.addInitScript((image) => {
    localStorage.setItem(
      `ikas-puzzle:${image}:2x2`,
      JSON.stringify({
        tur: 0,
        yerlesenler: [0, 1, 2, 3],
        hamle: 4,
        tamamlandi: true,
      }),
    );
  }, IMAGE);

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");
  await page.locator(".hediye-karti").first().click();
}

test("congratulates a winner and offers the code and a way to spend it", async ({
  page,
}) => {
  await finishWith(page, { title: "20% off", awardsPrize: true }, "PUZZLE20");

  await expect(page.locator(".odul-baslik")).toContainText("Tebrikler");
  await expect(page.locator(".kupon-kodu")).toHaveText("PUZZLE20");
  await expect(page.locator(".odul-buton")).toHaveCount(1);
});

test("does not congratulate a shopper who won nothing", async ({ page }) => {
  await finishWith(page, { title: "Try again", awardsPrize: false }, null);

  // Congratulating someone on a "try again" reads as a broken prize, and a
  // shop button invites them to spend on the strength of having won nothing.
  await expect(page.locator(".odul-baslik")).not.toContainText("Tebrikler");
  await expect(page.locator(".odul-buton")).toHaveCount(0);
  await expect(page.locator(".kupon-kodu")).toHaveCount(0);
});

test("fits the popup without scrolling once the prizes are showing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1136, height: 829 });
  await finishWith(page, { title: "20% off", awardsPrize: true }, "PUZZLE20");

  const layout = await page.evaluate(() => {
    const shadow = document.getElementById("pieceup-root")!.shadowRoot!;
    const popup = shadow.querySelector(".pieceup-popup") as HTMLElement;
    const badge = shadow.querySelector(".kampanya-baslik")!.getBoundingClientRect();
    return {
      scrolls: popup.scrollHeight > popup.clientHeight + 1,
      // The section's own padding sets a campaign apart from a page. A popup
      // has no page, and that padding was pushing the puzzle out of view.
      spaceAbove: Math.round(badge.top - popup.getBoundingClientRect().top),
    };
  });

  expect(layout.scrolls).toBe(false);
  expect(layout.spaceAbove).toBeLessThan(110);
});

/** Puts a saved round in storage before the page loads. */
async function withSavedRound(
  page: import("@playwright/test").Page,
  saved: { yerlesenler: number[]; tamamlandi: boolean },
) {
  await page.addInitScript(
    ({ image, round }) => {
      localStorage.setItem(
        `ikas-puzzle:${image}:2x2`,
        JSON.stringify({ tur: 0, hamle: round.yerlesenler.length, ...round }),
      );
    },
    { image: IMAGE, round: saved },
  );
}

test("starts a half-finished puzzle over rather than resuming it", async ({
  page,
}) => {
  await serveConfig(page, { pieceCount: 4 });
  await withSavedRound(page, { yerlesenler: [0, 1], tamamlandi: false });

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");

  // Reopening onto a scatter you half remember is harder to pick up than a
  // fresh board, and there is nothing won to protect.
  await expect(page.locator(".ortu .ana-buton")).toBeVisible();
  await expect(page.locator(".ilerleme-yazisi")).toHaveText("0 / 4");
});

test("brings a shopper back to the reward they already won", async ({
  page,
}) => {
  await serveConfig(page, {
    pieceCount: 4,
    giftStep: true,
    giftBoxMode: true,
    gifts: [{ title: "20% off", awardsPrize: true }],
  });
  await withSavedRound(page, {
    yerlesenler: [0, 1, 2, 3],
    tamamlandi: true,
  });

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");

  // Closing the popup must not cost someone the code they won.
  await expect(page.locator(".hediye-karti")).toHaveCount(1);
  await expect(page.locator(".ortu .ana-buton")).toHaveCount(0);
});

test("keeps the reward step when the popup is closed before choosing", async ({
  page,
}) => {
  await serveConfig(page, {
    pieceCount: 4,
    giftStep: true,
    giftBoxMode: true,
    gifts: [{ title: "20% off", awardsPrize: true }],
  });
  await withSavedRound(page, {
    yerlesenler: [0, 1, 2, 3],
    tamamlandi: true,
  });

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");
  await expect(page.locator(".hediye-karti")).toHaveCount(1);

  await page.click(".pieceup-close");
  await page.click(".pieceup-trigger");

  await expect(page.locator(".hediye-karti")).toHaveCount(1);
  await expect(page.locator(".ortu .ana-buton")).toHaveCount(0);
});

test("forgets the completed round after delivering a reward", async ({
  page,
}) => {
  await finishWith(
    page,
    { title: "20% off", awardsPrize: true },
    "PUZZLE20",
    { canReplay: true },
  );
  await expect(page.locator(".kupon-kodu")).toHaveText("PUZZLE20");

  const saved = await page.evaluate(
    (image) => localStorage.getItem(`ikas-puzzle:${image}:2x2`),
    IMAGE,
  );
  expect(saved).toBeNull();

  await page.click(".pieceup-close");
  await page.click(".pieceup-trigger");

  await expect(page.locator(".ortu .ana-buton")).toBeVisible();
  await expect(page.locator(".ilerleme-yazisi")).toHaveText("0 / 4");
});

test("retries reward delivery for a restored completed round without gifts", async ({
  page,
}) => {
  await serveConfig(page, { pieceCount: 4, giftStep: false });
  await page.route("**/apps/pieceup/complete", (route) =>
    route.fulfill({ json: { discountCode: "PUZZLE20" } }),
  );
  await withSavedRound(page, {
    yerlesenler: [0, 1, 2, 3],
    tamamlandi: true,
  });

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");

  await expect(page.locator(".kupon-kodu")).toHaveText("PUZZLE20");
});

test("offers another round when the puzzle has no play limit", async ({
  page,
}) => {
  await serveConfig(page, {
    pieceCount: 4,
    canReplay: true,
    giftStep: true,
    giftBoxMode: true,
    gifts: [{ title: "20% off", awardsPrize: true }],
  });
  await withSavedRound(page, { yerlesenler: [0, 1, 2, 3], tamamlandi: true });

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");

  // Without this an unlimited puzzle is unlimited in name only: the finished
  // round comes back every time and there is no way to a fresh one.
  await expect(page.locator(".ikincil-buton")).toHaveCount(1);
});

test("offers no second round when a shopper only gets one", async ({
  page,
}) => {
  await serveConfig(page, {
    pieceCount: 4,
    canReplay: false,
    giftStep: true,
    giftBoxMode: true,
    gifts: [{ title: "20% off", awardsPrize: true }],
  });
  await withSavedRound(page, { yerlesenler: [0, 1, 2, 3], tamamlandi: true });

  await page.goto(fixtureUrl);
  await page.click(".pieceup-trigger");

  // Offering a round the server will refuse is worse than not offering one.
  await expect(page.locator(".ikincil-buton")).toHaveCount(0);
});

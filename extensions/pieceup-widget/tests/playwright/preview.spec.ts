import { test, expect } from "@playwright/test";

const fixtureUrl = "/tests/playwright/preview-fixture.html";
const IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAC6ElEQVR4nO3SeesYAgCA4d9oCBk5muWICdnE2sgIORpCRo72riFkW0O2jByNbMsRwtpk1pAts4ZYM2EhR6/lyBELy5FpsxyNbEL5Gv54n8/wDAzgINwOt8fBuAPuiDvhzrgL7oq74RDcHffAPXEv3Bv3waG4Lw7D/XB/PAAPxIPwYByOh+CheBgejkfgCByJR+JReDSOwtE4Bo/BY/E4HIvH4wl4Ip6EJ+MpeCqehqfjODwDz8Sz8Gw8B8/F83A8no8X4IV4EV6Ml+AEBCfiJLwUL8PL8Qq8Eq/Cq3EyTsGpOA2vwWvxOrwep+MMvAFn4o14E96Mt+CteBvOwtvxDrwTZ+McnIt34d14D96L9+H9+AA+iA/hwzgP5+MCfAQfxYX4GC7Cxfg4PoFP4lO4BJfi07gMn8HluAKfxefweXwBX8SVuApfwtX4Mr6Cr+JruAZfxzfwTXwL38Z38F0U38O1+D5+gB/iR/gxfoKf4mf4OX6B6/BL/Aq/xvX4DX6L3+H3+ANuwB9xI27Cn3Az/oy/4K/4G27B3/EP/BO34jb8C//Gf/BfHChWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhWrWMUqVrGKVaxiFatYxSpWsYpVrGIVq1jFKlaxilWsYhXr/x3rP5chGL7lzUSdAAAAAElFTkSuQmCC";

/**
 * The admin preview runs the storefront bundle rather than drawing its own
 * version of the puzzle, so it cannot drift from what shoppers get. This covers
 * that path — import the bundle, mount it into a shadow root — without the app
 * proxy or an authenticated admin session.
 */
test("mounts the storefront puzzle from the bundle alone", async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.evaluate((imageUrl) => {
    const w = window as unknown as {
      __mountPreview: (settings: Record<string, unknown>) => Promise<unknown>;
    };
    return w.__mountPreview({
      imageUrl,
      pieceCount: 4,
      knobSize: 24,
      difficulty: "easy",
      trayPosition: "left",
      accentColor: "#1a1a1a",
      showGuide: true,
      headline: "Preview",
      rememberProgress: false,
    });
  }, IMAGE);

  await expect(page.locator(".ana-buton")).toBeVisible();
  await page.click(".ana-buton");
  await expect(page.locator(".parca")).toHaveCount(4);

  // The merchant's settings have to reach it here too, not just on a theme.
  const trayIsLeft = await page.evaluate(() => {
    const shadow = document.getElementById("preview-host")!.shadowRoot!;
    const board = shadow.querySelector(".tahta")!.getBoundingClientRect();
    const tray = shadow.querySelector(".tepsi")!.getBoundingClientRect();
    return tray.right <= board.left + 1;
  });
  expect(trayIsLeft).toBe(true);
});

/**
 * widget.js drives the puzzle through the handle mountPuzzle returns, and the
 * unit tests mock that module — so nothing there can tell whether the mock
 * still resembles the real thing. It stopped resembling it: mountPuzzle went
 * back to returning a bare function while widget.js kept calling
 * setRewardCode on it, which meant a shopper who finished a puzzle was never
 * shown their code. This asserts the real module's shape.
 */
test("returns the handle widget.js drives it with", async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.evaluate((imageUrl) => {
    const w = window as unknown as {
      __mountPreview: (settings: Record<string, unknown>) => Promise<unknown>;
    };
    return w.__mountPreview({ imageUrl, pieceCount: 4, headline: "Preview" });
  }, IMAGE);

  const handle = await page.evaluate(() => {
    const w = window as unknown as {
      __handle: { setRewardCode?: unknown; destroy?: unknown };
    };
    return {
      setRewardCode: typeof w.__handle.setRewardCode,
      destroy: typeof w.__handle.destroy,
    };
  });

  expect(handle.setRewardCode).toBe("function");
  expect(handle.destroy).toBe("function");
});

test("shows the reward code in the puzzle's own panel", async ({ page }) => {
  await page.goto(fixtureUrl);

  // The reward panel only exists once the puzzle is finished, which is also
  // the only moment widget.js calls setRewardCode. Seeded through the same
  // saved progress a returning shopper would have, rather than by dragging
  // four pieces to get to the state under test.
  await page.evaluate((imageUrl) => {
    window.localStorage.setItem(
      `ikas-puzzle:${imageUrl}:2x2`,
      JSON.stringify({ tur: 0, yerlesenler: [0, 1, 2, 3], hamle: 4, tamamlandi: true }),
    );
  }, IMAGE);

  await page.evaluate((imageUrl) => {
    const w = window as unknown as {
      __mountPreview: (settings: Record<string, unknown>) => Promise<unknown>;
    };
    return w.__mountPreview({
      imageUrl,
      pieceCount: 4,
      headline: "Preview",
      shuffleKey: imageUrl,
      rememberProgress: true,
    });
  }, IMAGE);

  await page.evaluate(() => {
    const w = window as unknown as {
      __handle: { setRewardCode(code: string): void };
    };
    w.__handle.setRewardCode("PIECEUP-TEST");
  });

  await expect(page.locator("body")).toContainText("PIECEUP-TEST");
});

/**
 * With the gift step on, finishing the puzzle offers the gifts the merchant
 * defined, and the reward panel only appears once one is picked. This covers
 * the whole chain — our config shape, the list the renderer builds from it, and
 * the reference's own selection flow.
 */
test("offers the merchant's gifts, then the reward", async ({ page }) => {
  await page.goto(fixtureUrl);

  // Seeded as finished, the same way a returning shopper's saved progress
  // would be, rather than dragging every piece to reach the state under test.
  await page.evaluate((imageUrl) => {
    window.localStorage.setItem(
      `ikas-puzzle:${imageUrl}:2x2`,
      JSON.stringify({ tur: 0, yerlesenler: [0, 1, 2, 3], hamle: 4, tamamlandi: true }),
    );
  }, IMAGE);

  await page.evaluate((imageUrl) => {
    const w = window as unknown as {
      __mountPreview: (settings: Record<string, unknown>) => Promise<unknown>;
    };
    return w.__mountPreview({
      imageUrl,
      pieceCount: 4,
      headline: "Preview",
      shuffleKey: imageUrl,
      rememberProgress: true,
      giftStep: true,
      // Surprise boxes: the gifts cover the board and the reward waits behind
      // the choice. Without box mode the strip sits under the board and the
      // reward is shown straight away, which is a different flow.
      giftBoxMode: true,
      gifts: [
        { title: "Free shipping" },
        { title: "10% off", description: "On your next order" },
      ],
    });
  }, IMAGE);

  const cards = page.locator(".hediye-karti");
  await expect(cards).toHaveCount(2);

  // Boxed, so what is inside stays hidden until one is opened.
  await expect(page.locator(".hediye-serit")).not.toContainText("Free shipping");
  await expect(page.locator(".odul-serit")).toHaveCount(0);

  await cards.first().click();

  // The card's own stylesheet is a separate file from the campaign's, and was
  // once left out of the bundle entirely — the cards then rendered as bare
  // inline buttons, which still passed every assertion about their content.
  const styled = await page.evaluate(() => {
    const shadow = document.getElementById("preview-host")!.shadowRoot!;
    const card = shadow.querySelector(".hediye-karti")!;
    const box = card.getBoundingClientRect();
    return {
      display: getComputedStyle(card).display,
      width: Math.round(box.width),
      height: Math.round(box.height),
    };
  });
  expect(styled.display).toBe("flex");
  // A card, not a button squashed to its text.
  expect(styled.height).toBeGreaterThan(80);

  // Opening a box is the choice: the gift is revealed and the reward follows.
  await expect(page.locator(".hediye-serit")).toContainText("Free shipping");
  await expect(page.locator(".odul-serit")).toHaveCount(1);
});

/**
 * Which gift was chosen decides the discount, so it has to reach the server.
 * Awarding the first gift regardless would give every shopper the same prize
 * no matter which box they opened.
 */
test("reports which gift the shopper chose", async ({ page }) => {
  await page.goto(fixtureUrl);
  await page.evaluate((imageUrl) => {
    window.localStorage.setItem(
      `ikas-puzzle:${imageUrl}:2x2`,
      JSON.stringify({ tur: 0, yerlesenler: [0, 1, 2, 3], hamle: 4, tamamlandi: true }),
    );
  }, IMAGE);

  await page.evaluate((imageUrl) => {
    const w = window as unknown as {
      __mountPreview: (
        settings: Record<string, unknown>,
        onComplete?: (giftIndex: number) => void,
      ) => Promise<unknown>;
      __chosen: number[];
    };
    w.__chosen = [];
    return w.__mountPreview(
      {
        imageUrl,
        pieceCount: 4,
        headline: "Preview",
        shuffleKey: imageUrl,
        rememberProgress: true,
        giftStep: true,
        giftBoxMode: true,
        gifts: [{ title: "First" }, { title: "Second" }, { title: "Third" }],
      },
      (giftIndex: number) => w.__chosen.push(giftIndex),
    );
  }, IMAGE);

  await page.locator(".hediye-karti").nth(2).click();

  const chosen = await page.evaluate(
    () => (window as unknown as { __chosen: number[] }).__chosen,
  );
  expect(chosen).toEqual([2]);
});

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

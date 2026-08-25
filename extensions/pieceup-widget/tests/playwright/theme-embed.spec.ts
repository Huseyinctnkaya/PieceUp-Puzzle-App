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

const IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

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

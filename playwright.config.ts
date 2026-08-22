import { defineConfig } from "@playwright/test";

// The fixture page imports widget.js as an ES module and calls the App
// Proxy endpoints via relative fetch() paths (see api.js). Chromium refuses
// both cross-origin module fetches and fetch() itself when the page is
// loaded from a file:// URL (origin "null"), so page.route() interception
// never even gets a chance to run. To keep the test self-contained (no real
// backend, no extra dependencies), we spin up a minimal static file server
// (extensions/pieceup-widget/tests/playwright/static-server.mjs) for the
// duration of the test run and load the fixture over http instead. That
// server binds to 127.0.0.1 only and serves solely from the
// extensions/pieceup-widget directory (with path-containment checks), so
// nothing outside this extension's own test assets is ever reachable.
const PORT = 4173;
const HOST = "127.0.0.1";

export default defineConfig({
  testDir: "./extensions/pieceup-widget/tests/playwright",
  use: {
    baseURL: `http://${HOST}:${PORT}`,
  },
  webServer: {
    command: `node extensions/pieceup-widget/tests/playwright/static-server.mjs ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});

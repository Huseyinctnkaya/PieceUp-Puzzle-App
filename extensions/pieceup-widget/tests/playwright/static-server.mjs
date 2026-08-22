// Minimal static file server used only by `npm run test:e2e` (see the
// `webServer` entry in playwright.config.ts). It exists purely to work
// around a real browser restriction: Chromium blocks both ES module
// imports and fetch() from file:// pages, so the fixture page has to be
// loaded over http for widget.js's module import and api.js's relative
// fetch() calls to work at all (page.route() can only intercept real
// network requests, not the file:// fetch failures those calls hit
// otherwise).
//
// Two things are deliberately restricted, per security review:
//   1. Bound to 127.0.0.1 only (not all interfaces) — nothing outside this
//      machine should ever be able to reach it.
//   2. Served root is scoped to this extension's own directory
//      (extensions/pieceup-widget), not the repo root — so things like
//      .env, database.sqlite, and node_modules are never reachable, and
//      any request path that resolves outside that directory (e.g. via
//      `..` traversal) is rejected outright.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2] || process.env.PIECEUP_TEST_SERVER_PORT || 4173);
const HOST = "127.0.0.1";

// This file lives at extensions/pieceup-widget/tests/playwright/, so two
// levels up is extensions/pieceup-widget/ — the smallest directory that
// contains both the fixture (tests/playwright/) and the widget assets it
// imports (assets/).
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

function resolveWithinRoot(requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const resolved = path.join(ROOT, decoded);
  const relative = path.relative(ROOT, resolved);
  const escapesRoot = relative.startsWith("..") || path.isAbsolute(relative);
  return escapesRoot ? null : resolved;
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${HOST}`);
  const filePath = resolveWithinRoot(pathname);

  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  // Playwright's webServer waits for the configured port to accept
  // connections; this log line is only useful for local debugging.
  console.log(`pieceup test static server listening on http://${HOST}:${PORT} (root: ${ROOT})`);
});

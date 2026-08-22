import { defineConfig } from "@playwright/test";

// The fixture page imports widget.js as an ES module and calls the App
// Proxy endpoints via relative fetch() paths (see api.js). Chromium refuses
// both cross-origin module fetches and fetch() itself when the page is
// loaded from a file:// URL (origin "null"), so page.route() interception
// never even gets a chance to run. To keep the test self-contained (no real
// backend, no extra dependencies), we spin up a minimal static file server
// over the repo root for the duration of the test run and load the fixture
// over http instead.
const PORT = 4173;

export default defineConfig({
  testDir: "./extensions/pieceup-widget/tests/playwright",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `node -e 'const http=require("http");const fs=require("fs");const path=require("path");const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json"};http.createServer((req,res)=>{const u=new URL(req.url,"http://x");const p=path.join(process.cwd(),decodeURIComponent(u.pathname));fs.readFile(p,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.writeHead(200,{"Content-Type":types[path.extname(p)]||"application/octet-stream"});res.end(data);});}).listen(${PORT});'`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});

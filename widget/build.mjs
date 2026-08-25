/**
 * Bundles the reference puzzle into assets the theme extension can serve.
 *
 * A theme app extension has no build step of its own — Shopify serves whatever
 * sits in assets/, and permits no directories there beyond assets, blocks,
 * snippets and locales — so the sources and this script live outside it and
 * the built bundle is committed into assets/.
 *
 * The two @ikas modules the reference imports are aliased to local shims, which
 * is what lets its source be used unmodified.
 */
import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [
    resolve(here, "src/entry.tsx"),
    // One stylesheet that pulls in every component's, including the ones the
    // campaign's own CSS does not reach.
    resolve(here, "src/styles.css"),
  ],
  outdir: resolve(here, "../extensions/pieceup-widget/assets"),
  entryNames: "pieceup-app",
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  jsxImportSource: "preact",
  alias: {
    "@ikas/component-utils": resolve(here, "src/shims/component-utils.ts"),
    "@ikas/bp-storefront": resolve(here, "src/shims/bp-storefront.tsx"),
  },
  loader: { ".css": "css" },
  logLevel: "info",
});

// The admin's preview runs this same bundle rather than drawing its own
// approximation of the puzzle, so it needs a copy it can load. It cannot read
// the extension's: `shopify app dev` claims the /extensions/* path for the
// theme extension's own asset server. Served from the app's public/ instead.
const assets = resolve(here, "../extensions/pieceup-widget/assets");
const publicDir = resolve(here, "../public");
for (const file of ["pieceup-app.js", "pieceup-app.css"]) {
  await copyFile(resolve(assets, file), resolve(publicDir, file));
}

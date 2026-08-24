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
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [
    resolve(here, "src/entry.tsx"),
    // The component stylesheet pulls in every sub-component's via @import, so
    // this single entry produces the whole widget's CSS.
    resolve(here, "src/components/PuzzleKampanya/styles.css"),
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

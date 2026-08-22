import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    // Playwright's own spec files (extensions/pieceup-widget/tests/playwright/**)
    // call `test()` from @playwright/test, which is not a valid Vitest test
    // and must only run under `playwright test` (see playwright.config.ts /
    // the `test:e2e` script), not under Vitest's default *.spec.ts discovery.
    //
    // .shopify/dev-bundle/** is a build output `shopify app dev` writes at
    // runtime (gitignored) containing a copy of the extension's source —
    // without this exclude, Vitest picks up that copy too and runs every
    // extension test twice.
    exclude: [
      ...configDefaults.exclude,
      "extensions/pieceup-widget/tests/playwright/**",
      ".shopify/**",
    ],
  },
});

/**
 * Headers for the storefront JSON endpoints.
 *
 * `no-store` because these answers are per-shopper and short-lived. The config
 * endpoint returns a different puzzle depending on who is asking once an A/B
 * test is running, and it changes the instant a merchant edits a campaign,
 * activates another one or stops a test. A cached copy — in the browser, in a
 * proxy, anywhere — shows a shopper a puzzle the shop has already moved on
 * from, and the merchant sees their own change apparently ignored.
 *
 * Without an explicit directive a GET with a 200 is heuristically cacheable,
 * so silence here is not neutral.
 */
export const JSON_NO_STORE = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
} as const;

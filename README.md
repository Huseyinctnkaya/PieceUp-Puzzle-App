# PieceUp

A Shopify app that turns a discount into a game. Shoppers solve a jigsaw puzzle
on the storefront, pick a prize, and get a real Shopify discount code for it.

<br>

## For merchants

- **Build a puzzle** from any image — 2×2 up to 4×4 pieces, three difficulty
  levels, an optional time limit.
- **Choose the prizes** — a percentage off, an amount off, or a "try again"
  that costs nothing. Prizes can be limited to certain products or collections.
- **Decide when it appears** — from a button, on its own after a delay, or
  both; on every page, product pages, or the cart.
- **Set how often someone can play** — once ever, once a day, or unlimited.
- **See what it earned** — opens, completions and rewards, with orders placed
  using a PieceUp code matched back to the puzzle that issued it.
- **Test two puzzles against each other** and keep the one that wins.

Codes are created the moment a shopper wins, are single-use, and appear under
Discounts like any other.

<br>

## How it works

The merchant configures a puzzle in the Shopify admin. The storefront gets the
puzzle through a theme app extension, which the merchant turns on in the theme
editor. When a shopper finishes, the app mints a discount code through the
Admin API and hands it back.

<br>

## Built with

React Router 7 · Shopify App Bridge · Polaris web components · Prisma ·
Preact for the storefront widget · Vitest and Playwright for tests.

<br>

## Development

Requires the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
and Node 20.19+ or 22.12+.

```shell
npm install
echo 'DATABASE_URL="file:dev.sqlite"' > .env
npm run setup
npm run dev
```

| Command | |
| --- | --- |
| `npm run dev` | Run the app against a development store |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests for the storefront puzzle |
| `npm run typecheck` | Types |
| `npm run lint` | Lint |
| `npm run build` | Production build |
| `npm run build:widget` | Rebuild the storefront bundle after changing `widget/src` |

The storefront puzzle is built from `widget/src` into
`extensions/pieceup-widget/assets`, and the bundle is committed — a theme app
extension has no build step of its own.

<br>

## Support

info@34devs.com

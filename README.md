# PieceUp

A Shopify app that puts a jigsaw puzzle on a storefront. A shopper drags the
pieces into place, picks a prize, and walks away with a real Shopify discount
code — created at the moment they win, not handed out in advance.

The merchant builds the puzzle in the Shopify admin: an image, a piece count, a
set of prizes, and the rules about when the popup appears and how often someone
may play.

---

## How it fits together

Three pieces, each with its own deployment path.

| Part | Lives in | Runs where |
| --- | --- | --- |
| **Admin app** | `app/` | Embedded in the Shopify admin, served by React Router |
| **Storefront widget** | `widget/src/` → `extensions/pieceup-widget/` | The merchant's theme, as a theme app extension |
| **App Proxy API** | `app/routes/apps.pieceup.*` | Same server as the admin app, reached through Shopify |

The widget never talks to our domain directly. Shopify proxies
`{shop}/apps/pieceup/*` through to the app, which is what keeps the requests
first-party and lets the storefront read config and claim rewards without CORS
or an API key.

```
shopper → theme extension → /apps/pieceup/config   → active puzzle + settings
                          → /apps/pieceup/complete → mints the discount code
                          → /apps/pieceup/track    → funnel counters

merchant → embedded admin → Prisma → SQLite
Shopify  → /webhooks/*    → order attribution, uninstall, GDPR
```

### Stack

React Router 7 · `@shopify/shopify-app-react-router` · Polaris web components
(`s-page`, `s-section`, …) · App Bridge 4 · Prisma + SQLite · Vite 6 · Preact
for the widget bundle · Vitest + Playwright.

---

## Getting started

You need the [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started)
and Node 20.19+ or 22.12+.

```shell
npm install
echo 'DATABASE_URL="file:dev.sqlite"' > .env
npm run setup      # prisma generate && prisma migrate deploy
npm run dev        # shopify app dev
```

`.env` is gitignored and `DATABASE_URL` is the only key it needs locally —
`shopify app dev` supplies the API credentials, the tunnel and the app URLs
itself.

Press `p` in the dev terminal to open the app, install it on the dev store
(`puzzle-test.myshopify.com`), and you are in.

> **The puzzle will not appear on the storefront** until the PieceUp app embed
> is turned on in the theme editor (Online Store → Themes → Customize → App
> embeds). This catches everyone once, including reviewers.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | `shopify app dev` — tunnel, env, hot reload |
| `npm test` | Vitest, the whole unit suite |
| `npm run test:e2e` | Playwright, the widget in a real browser |
| `npm run typecheck` | `react-router typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build of the admin app |
| `npm run build:widget` | Rebuild the storefront bundle (see below) |
| `npm run deploy` | `shopify app deploy` — releases config + extensions |
| `npm run setup` | Prisma client + migrations |

The gate before committing is all four: `typecheck`, `lint`, `test`, `build`.

---

## The storefront widget

The puzzle's source is a Preact app under `widget/src/`, bundled by
`widget/build.mjs` (esbuild) into `extensions/pieceup-widget/assets/`.

The reason for the split: a theme app extension has no build step of its own.
Shopify serves whatever files sit in `assets/` and allows no subdirectories
there, so the sources live outside the extension and **the built bundle is
committed**. Change anything under `widget/src/` and you must run:

```shell
npm run build:widget
```

…and commit the regenerated `assets/pieceup-app.js` and `.css` along with it.
The admin's live preview loads the same bundle rather than drawing its own
approximation, so the two can never disagree about how a puzzle looks.

---

## Layout

```
app/
  routes/          admin pages (app.*), proxy endpoints (apps.pieceup.*), webhooks
  models/          everything that touches the database
  services/        Shopify API work — billing, discounts, image upload, attribution
  lib/             pure logic, no I/O: plans, gift selection, A/B assignment
  components/      shared admin UI
widget/src/        the storefront puzzle, built into the extension
extensions/pieceup-widget/
  blocks/          the app embed Liquid block
  assets/          built bundle + hand-written widget.js / api.js / identity.js
  tests/playwright/
prisma/            schema + 14 migrations
docs/              privacy policy
```

`models/` vs `services/` is the useful line: if it reads or writes our own
database it is a model, if it calls Shopify it is a service, and if it does
neither it belongs in `lib/` where it can be tested without either.

---

## Tests

```shell
npm test         # ~250 unit tests, a few seconds
npm run test:e2e # 32 Playwright tests
```

Vitest runs in a `node` environment; the one file that needs a DOM
(`extensions/pieceup-widget/assets/widget.test.js`) opts into jsdom itself.
Playwright's specs are excluded from Vitest discovery — they call `test()` from
`@playwright/test` and only run under `npm run test:e2e`.

The Playwright suite serves the widget's fixture page over a local static
server on port 4173 and stubs the App Proxy endpoints with `page.route()`. There
is no backend and no Shopify involved.

> A `page.route()` pattern must end in `*` — `fetchConfig()` appends
> `?identityKey=`, and a pattern without the wildcard silently stops matching.
> That once cost a day: 26 tests timed out at 30 seconds each with no useful
> error.

---

## Database

SQLite through Prisma, in WAL mode. The file is gitignored, which is what makes
a plain `git pull` safe on the server — deploying never touches the data.

```shell
npx prisma migrate dev --name what_changed   # create a migration
npx prisma migrate deploy                    # apply (also part of npm run setup)
npx prisma studio                            # browse the data
```

> **Restart the dev server after any migration.** Prisma's generated client is
> loaded into the running process and goes stale; the next query crashes with a
> confusing error that looks nothing like "your schema moved".

---

## Configuration

`shopify.app.toml` is the authority for everything Shopify holds about the app,
and `shopify app deploy` writes it to the Dev Dashboard. Editing a value in the
dashboard instead means the two drift apart — which is exactly how the App
settings link ended up pointing at a route that did not exist.

Worth knowing:

- **`[app_preferences]`** — where the admin's "App settings" link lands. Points
  at the app home, because nothing configurable is shop-wide; every setting
  belongs to an individual puzzle.
- **`[app_proxy]`** — `apps/pieceup`, the storefront's only route to the app.
- **`read_orders`** — a protected customer data scope, used for revenue
  attribution and approved separately in the Partner Dashboard. `read_all_orders`
  is deliberately not requested.
- **Webhooks** — `orders/create` rather than `orders/paid`, so cash-on-delivery
  and bank transfer shops still get attribution; cancellations are subtracted
  separately.

Config changes only reach merchants after `npm run deploy`.

---

## Production

Runs on a VPS at **piece-up.app**. No Docker — the server pulls from git.

```
/var/www/pieceup      the checkout
pm2                   process manager, app name "pieceup"
port 3004             behind nginx, TLS via certbot
```

Deploying a code change:

```shell
cd /var/www/pieceup && git pull && npm run build && pm2 restart pieceup
```

Add `npx prisma migrate deploy` when the schema changed, and
`npm ci --engine-strict=false` when dependencies did — a devDependency wants a
newer Node than the server runs, and it never executes in production anyway.

Two traps worth writing down:

- **The `.env` file does not reach the app by itself.** There is no dotenv, and
  `react-router-serve` does not read one. `ecosystem.config.cjs` on the server
  calls `process.loadEnvFile()` and re-exports the values explicitly. If you
  change that file, `pm2 restart` is not enough — pm2 keeps the old environment.
  Use `pm2 delete pieceup && pm2 start ecosystem.config.cjs`.
- **Upload errors that never reach the logs.** nginx rejects bodies over its
  limit before Node ever sees them, so a 413 on image upload shows up nowhere in
  `pm2 logs`. `client_max_body_size` has to allow more than the app's own 10 MB
  cap.

---

## Plans

Defined once in `app/lib/plans.ts`, which the billing config in
`shopify.server.ts` is built from — so the price a merchant approves is always
the price the plan page showed.

| | Free | Pro | Premium |
| --- | --- | --- | --- |
| Rewards / month | 100 | 1,000 | unlimited |
| Puzzles | 1 | unlimited | unlimited |
| Analytics | — | ✓ | ✓ |
| A/B testing | — | — | ✓ |
| PieceUp badge | shown | — | — |

---

## Support

info@34devs.com

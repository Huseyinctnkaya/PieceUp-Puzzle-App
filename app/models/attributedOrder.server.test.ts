import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-attributed-order.sqlite";
// Prisma resolves relative sqlite URLs against prisma/schema.prisma's own
// directory, while node:fs resolves against the process cwd — hence the two
// different-looking paths for the same file.
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// Loaded dynamically so the Prisma client binds to the test database: static
// imports are hoisted above the DATABASE_URL assignment above.
let db: typeof import("../db.server").default;
let model: typeof import("./attributedOrder.server");

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  model = await import("./attributedOrder.server");
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await db.attributedOrder.deleteMany();
  await db.playRecord.deleteMany();
});

const SHOP = "shop-revenue.myshopify.com";

function attribution(overrides: Partial<Parameters<typeof model.recordAttributedOrder>[1]> = {}) {
  return {
    orderId: "gid://shopify/Order/1001",
    discountCode: "PIECEUP-AAA111",
    totalCents: 41495,
    currency: "TRY",
    orderedAt: new Date("2026-08-26T10:00:00Z"),
    ...overrides,
  };
}

/** A completed play holding the code an order will later be matched against. */
async function givenPlay(code: string, puzzleId: string, prizeTitle: string) {
  await db.playRecord.create({
    data: {
      shopDomain: SHOP,
      identityKey: `device:${code}`,
      puzzleId,
      playDate: "2026-08-25",
      limitKey: `ever:${code}`,
      completed: true,
      discountCode: code,
      prizeTitle,
    },
  });
}

describe("recordAttributedOrder", () => {
  it("stores the order and stamps it with the puzzle that earned it", async () => {
    await givenPlay("PIECEUP-AAA111", "puzzle-1", "%15 indirim");

    await model.recordAttributedOrder(SHOP, attribution());

    const [row] = await db.attributedOrder.findMany();
    expect(row).toMatchObject({
      orderId: "gid://shopify/Order/1001",
      discountCode: "PIECEUP-AAA111",
      puzzleId: "puzzle-1",
      prizeTitle: "%15 indirim",
      totalCents: 41495,
      currency: "TRY",
      cancelled: false,
    });
  });

  it("still records revenue when no play matches the code", async () => {
    // A code can outlive its play record — the merchant may have cleared data,
    // or the code was issued before per-puzzle tracking. The sale is real
    // either way, so it counts towards the total with the puzzle left unknown.
    await model.recordAttributedOrder(SHOP, attribution());

    const [row] = await db.attributedOrder.findMany();
    expect(row.totalCents).toBe(41495);
    expect(row.puzzleId).toBeNull();
  });

  it("counts a redelivered webhook once", async () => {
    // Shopify retries deliveries, and the same order arriving twice must not
    // double the merchant's reported revenue.
    await model.recordAttributedOrder(SHOP, attribution());
    await model.recordAttributedOrder(SHOP, attribution());

    expect(await db.attributedOrder.count()).toBe(1);
    const totals = await model.getRevenueTotals(SHOP);
    expect(totals.orders).toBe(1);
    expect(totals.revenueCents).toBe(41495);
  });

  it("updates the total when a redelivery carries an edited amount", async () => {
    await model.recordAttributedOrder(SHOP, attribution());
    await model.recordAttributedOrder(SHOP, attribution({ totalCents: 20000 }));

    const totals = await model.getRevenueTotals(SHOP);
    expect(totals.revenueCents).toBe(20000);
  });

  it("does not resurrect a cancelled order on redelivery", async () => {
    // orders/cancelled can arrive before a retried orders/create. If the
    // upsert reset the flag, a cancelled sale would silently rejoin the total.
    await model.recordAttributedOrder(SHOP, attribution());
    await model.markOrderCancelled(SHOP, "gid://shopify/Order/1001");
    await model.recordAttributedOrder(SHOP, attribution());

    const [row] = await db.attributedOrder.findMany();
    expect(row.cancelled).toBe(true);
    expect((await model.getRevenueTotals(SHOP)).revenueCents).toBe(0);
  });

  it("keeps each shop's orders to itself", async () => {
    await model.recordAttributedOrder(SHOP, attribution());
    await model.recordAttributedOrder("other.myshopify.com", attribution());

    expect((await model.getRevenueTotals(SHOP)).orders).toBe(1);
    expect(
      (await model.getRevenueTotals("other.myshopify.com")).orders,
    ).toBe(1);
  });
});

describe("markOrderCancelled", () => {
  it("takes a cancelled order out of the totals without deleting it", async () => {
    await model.recordAttributedOrder(SHOP, attribution());
    await model.recordAttributedOrder(
      SHOP,
      attribution({ orderId: "gid://shopify/Order/1002", totalCents: 10000 }),
    );

    await model.markOrderCancelled(SHOP, "gid://shopify/Order/1001");

    const totals = await model.getRevenueTotals(SHOP);
    expect(totals.orders).toBe(1);
    expect(totals.revenueCents).toBe(10000);
    // The history stays intact, so past reports do not change shape.
    expect(await db.attributedOrder.count()).toBe(2);
  });

  it("shrugs at an order it never recorded", async () => {
    // Most cancellations are for orders that used no PieceUp code at all.
    await expect(
      model.markOrderCancelled(SHOP, "gid://shopify/Order/9999"),
    ).resolves.not.toThrow();
  });
});

describe("getRevenueTotals", () => {
  it("reports zero and no currency for a shop with no attributed orders", async () => {
    expect(await model.getRevenueTotals(SHOP)).toEqual({
      orders: 0,
      revenueCents: 0,
      currency: null,
    });
  });

  it("sums exactly across many orders", async () => {
    // Cents are integers precisely so this sum cannot drift; 0.1 + 0.2 in
    // floating point is the failure this guards against.
    for (let i = 0; i < 3; i++) {
      await model.recordAttributedOrder(
        SHOP,
        attribution({ orderId: `gid://shopify/Order/${i}`, totalCents: 10 }),
      );
    }

    expect((await model.getRevenueTotals(SHOP)).revenueCents).toBe(30);
  });
});

describe("getRevenueByPuzzle", () => {
  it("splits revenue between the campaigns that earned it", async () => {
    await givenPlay("PIECEUP-AAA111", "puzzle-1", "%15");
    await givenPlay("PIECEUP-BBB222", "puzzle-2", "Kargo bedava");
    await givenPlay("PIECEUP-CCC333", "puzzle-1", "%15");

    await model.recordAttributedOrder(SHOP, attribution());
    await model.recordAttributedOrder(
      SHOP,
      attribution({
        orderId: "gid://shopify/Order/1002",
        discountCode: "PIECEUP-BBB222",
        totalCents: 10000,
      }),
    );
    await model.recordAttributedOrder(
      SHOP,
      attribution({
        orderId: "gid://shopify/Order/1003",
        discountCode: "PIECEUP-CCC333",
        totalCents: 5000,
      }),
    );

    const byPuzzle = await model.getRevenueByPuzzle(SHOP);

    expect(byPuzzle.get("puzzle-1")).toEqual({ orders: 2, revenueCents: 46495 });
    expect(byPuzzle.get("puzzle-2")).toEqual({ orders: 1, revenueCents: 10000 });
  });

  it("leaves out cancelled orders and orders with no known puzzle", async () => {
    await givenPlay("PIECEUP-AAA111", "puzzle-1", "%15");
    await model.recordAttributedOrder(SHOP, attribution());
    await model.recordAttributedOrder(
      SHOP,
      attribution({
        orderId: "gid://shopify/Order/1002",
        discountCode: "PIECEUP-UNKNOWN",
        totalCents: 999,
      }),
    );
    await model.markOrderCancelled(SHOP, "gid://shopify/Order/1001");

    expect(await model.getRevenueByPuzzle(SHOP)).toEqual(new Map());
  });
});

import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-shop-data.sqlite";
// Prisma resolves relative sqlite URLs against prisma/schema.prisma's own
// directory, while node:fs resolves against the process cwd — hence the two
// different-looking paths for the same file.
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// Loaded dynamically so the Prisma client binds to the test database: static
// imports are hoisted above the DATABASE_URL assignment above.
let db: typeof import("../db.server").default;
let model: typeof import("./shopData.server");

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  model = await import("./shopData.server");
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

const SHOP = "shop-gdpr.myshopify.com";
const OTHER = "other-shop.myshopify.com";

/** Fills both shops with one of everything, so deletions can be scoped. */
async function seed() {
  for (const shopDomain of [SHOP, OTHER]) {
    const config = await db.puzzleConfig.create({
      data: { shopDomain, name: "Campaign" },
    });
    await db.puzzleGift.create({
      data: { puzzleConfigId: config.id, title: "%10" },
    });
    await db.puzzleStat.create({
      data: { shopDomain, puzzleId: config.id, date: "2026-08-26", opened: 5 },
    });
    await db.shopSetup.create({ data: { shopDomain, themeEmbedDone: true } });
    await db.session.create({
      data: {
        id: `offline_${shopDomain}`,
        shop: shopDomain,
        state: "",
        accessToken: "token",
      },
    });
    await db.playRecord.create({
      data: {
        shopDomain,
        identityKey: "customer:451",
        puzzleId: config.id,
        playDate: "2026-08-26",
        limitKey: "ever",
        completed: true,
        discountCode: "PIECEUP-AAA111",
        prizeTitle: "%10",
      },
    });
    await db.playRecord.create({
      data: {
        shopDomain,
        identityKey: "device:anon",
        puzzleId: config.id,
        playDate: "2026-08-26",
        limitKey: "ever2",
        completed: true,
        discountCode: "PIECEUP-BBB222",
        prizeTitle: "%10",
      },
    });
    await db.attributedOrder.create({
      data: {
        shopDomain,
        orderId: `gid://shopify/Order/${shopDomain}`,
        discountCode: "PIECEUP-AAA111",
        puzzleId: config.id,
        totalCents: 10000,
        currency: "TRY",
        orderedAt: new Date("2026-08-26T10:00:00Z"),
      },
    });
  }
}

beforeEach(async () => {
  await db.attributedOrder.deleteMany();
  await db.playRecord.deleteMany();
  await db.puzzleStat.deleteMany();
  await db.puzzleGift.deleteMany();
  await db.puzzleConfig.deleteMany();
  await db.shopSetup.deleteMany();
  await db.session.deleteMany();
  await seed();
});

describe("deleteAllShopData", () => {
  it("removes every trace of the shop", async () => {
    await model.deleteAllShopData(SHOP);

    expect(await db.puzzleConfig.count({ where: { shopDomain: SHOP } })).toBe(0);
    expect(await db.puzzleStat.count({ where: { shopDomain: SHOP } })).toBe(0);
    expect(await db.playRecord.count({ where: { shopDomain: SHOP } })).toBe(0);
    expect(await db.attributedOrder.count({ where: { shopDomain: SHOP } })).toBe(0);
    expect(await db.shopSetup.count({ where: { shopDomain: SHOP } })).toBe(0);
    expect(await db.session.count({ where: { shop: SHOP } })).toBe(0);
  });

  it("takes the gifts down with their puzzle", async () => {
    // Gifts hang off a puzzle rather than a shop, so a shop-scoped delete only
    // reaches them through the cascade. If that ever stopped working, a
    // redacted shop would leave its prize list behind.
    await model.deleteAllShopData(SHOP);

    expect(await db.puzzleGift.count()).toBe(1);
  });

  it("leaves every other shop untouched", async () => {
    await model.deleteAllShopData(SHOP);

    expect(await db.puzzleConfig.count({ where: { shopDomain: OTHER } })).toBe(1);
    expect(await db.playRecord.count({ where: { shopDomain: OTHER } })).toBe(2);
    expect(await db.attributedOrder.count({ where: { shopDomain: OTHER } })).toBe(1);
    expect(await db.session.count({ where: { shop: OTHER } })).toBe(1);
  });

  it("is safe to run twice", async () => {
    // shop/redact can be delivered more than once, and may arrive after the
    // uninstall handler has already cleared the same data.
    await model.deleteAllShopData(SHOP);
    await expect(model.deleteAllShopData(SHOP)).resolves.not.toThrow();
  });
});

describe("collectCustomerData", () => {
  it("returns what the app holds about one customer", async () => {
    const data = await model.collectCustomerData(SHOP, "451");

    expect(data).toEqual([
      {
        playedAt: expect.any(Date),
        puzzleId: expect.any(String),
        prizeTitle: "%10",
        discountCode: "PIECEUP-AAA111",
      },
    ]);
  });

  it("returns nothing for a customer who never played", async () => {
    expect(await model.collectCustomerData(SHOP, "999")).toEqual([]);
  });

  it("does not reach into another shop's records", async () => {
    const data = await model.collectCustomerData(OTHER, "451");
    expect(data).toHaveLength(1);
  });
});

describe("redactCustomer", () => {
  it("deletes the customer's plays", async () => {
    await model.redactCustomer(SHOP, "451");

    expect(
      await db.playRecord.count({
        where: { shopDomain: SHOP, identityKey: "customer:451" },
      }),
    ).toBe(0);
  });

  it("leaves other shoppers' plays alone", async () => {
    await model.redactCustomer(SHOP, "451");

    expect(
      await db.playRecord.count({
        where: { shopDomain: SHOP, identityKey: "device:anon" },
      }),
    ).toBe(1);
  });

  it("keeps the revenue but severs its link to the person", async () => {
    // The merchant's books should not change because a shopper exercised their
    // right to be forgotten — the sale still happened. Deleting the play breaks
    // the only path from an order back to an individual, which is what erasure
    // requires; the order row itself holds no personal data at all.
    await model.redactCustomer(SHOP, "451");

    const order = await db.attributedOrder.findFirst({
      where: { shopDomain: SHOP },
    });
    expect(order?.totalCents).toBe(10000);
    expect(
      await db.playRecord.findFirst({
        where: { shopDomain: SHOP, discountCode: order?.discountCode },
      }),
    ).toBeNull();
  });

  it("is safe to run for a customer with nothing stored", async () => {
    await expect(model.redactCustomer(SHOP, "999")).resolves.not.toThrow();
  });
});

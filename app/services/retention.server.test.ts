import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-retention.sqlite";
// Prisma resolves relative sqlite URLs against prisma/schema.prisma's own
// directory, while node:fs resolves against the process cwd — hence the two
// different-looking paths for the same file.
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// Loaded dynamically so the Prisma client binds to the test database: static
// imports are hoisted above the DATABASE_URL assignment above.
let db: typeof import("../db.server").default;
let service: typeof import("./retention.server");

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  service = await import("./retention.server");
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await db.attributedOrder.deleteMany();
  await db.playRecord.deleteMany();
});

const SHOP = "shop-retention.myshopify.com";

/** A date `months` before now, nudged by a day to sit clear of the boundary. */
function monthsAgo(months: number, extraDays = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  date.setDate(date.getDate() - extraDays);
  return date;
}

let n = 0;
async function givenPlay(playedAt: Date) {
  await db.playRecord.create({
    data: {
      shopDomain: SHOP,
      identityKey: `device:${n++}`,
      puzzleId: "puzzle-1",
      playDate: playedAt.toISOString().slice(0, 10),
      limitKey: `ever:${n}`,
      completed: true,
      discountCode: `PIECEUP-${n}`,
      prizeTitle: "%10",
      playedAt,
    },
  });
}

async function givenOrder(orderedAt: Date) {
  await db.attributedOrder.create({
    data: {
      shopDomain: SHOP,
      orderId: `gid://shopify/Order/${n++}`,
      discountCode: `PIECEUP-${n}`,
      totalCents: 10000,
      currency: "TRY",
      orderedAt,
    },
  });
}

describe("purgeExpiredRecords", () => {
  it("deletes plays past the retention window", async () => {
    await givenPlay(monthsAgo(14));

    const result = await service.purgeExpiredRecords();

    expect(result.plays).toBe(1);
    expect(await db.playRecord.count()).toBe(0);
  });

  it("keeps plays inside the window", async () => {
    // 13 months is chosen so a merchant can still compare this month against
    // the same month last year. Anything that would break that comparison is
    // the wrong cutoff.
    await givenPlay(monthsAgo(12));
    await givenPlay(new Date());

    const result = await service.purgeExpiredRecords();

    expect(result.plays).toBe(0);
    expect(await db.playRecord.count()).toBe(2);
  });

  it("deletes orders past the window and keeps the rest", async () => {
    await givenOrder(monthsAgo(14));
    await givenOrder(monthsAgo(2));

    const result = await service.purgeExpiredRecords();

    expect(result.orders).toBe(1);
    expect(await db.attributedOrder.count()).toBe(1);
  });

  it("holds on to a record sitting just inside the boundary", async () => {
    // A record exactly at the edge must survive: an off-by-one here silently
    // shortens the window the merchant was promised.
    await givenPlay(monthsAgo(13, -1));

    await service.purgeExpiredRecords();

    expect(await db.playRecord.count()).toBe(1);
  });

  it("reports zero rather than failing when there is nothing to purge", async () => {
    expect(await service.purgeExpiredRecords()).toEqual({
      plays: 0,
      orders: 0,
    });
  });
});

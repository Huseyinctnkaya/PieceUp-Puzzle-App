import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-play-record.sqlite";
// Prisma resolves sqlite datasource URLs relative to prisma/schema.prisma's
// own directory (not the process cwd), so a bare filename here ends up at
// prisma/<filename>. (Verified empirically: "./prisma/<filename>" resolves
// to the nested prisma/prisma/<filename>, which the fs cleanup below would
// never find — leaving stale state to leak across test runs.)
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
// node:fs functions resolve relative to the process cwd (project root), so
// the equivalent path there needs the "prisma/" prefix.
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// NOTE: static `import` declarations are hoisted by the ESM loader and are
// evaluated before this file's own top-level statements — including the
// process.env.DATABASE_URL assignment above. That means a static import of
// "./playRecord.server" (which imports the Prisma client) would construct
// the client against whatever DATABASE_URL was set *before* this file ran
// (verified empirically: it silently connected to the real dev.sqlite). We
// load the module dynamically inside beforeAll, after DATABASE_URL is set
// and migrated, so the Prisma client binds to the isolated test database.
let hasAlreadyPlayed: typeof import("./playRecord.server").hasAlreadyPlayed;
let recordCompletion: typeof import("./playRecord.server").recordCompletion;
let countRewardsThisMonth: typeof import("./playRecord.server").countRewardsThisMonth;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  ({ hasAlreadyPlayed, recordCompletion, countRewardsThisMonth } = await import(
    "./playRecord.server"
  ));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

/** A completed play, with only the fields a given test cares about spelled out. */
function play(
  overrides: Partial<Parameters<typeof recordCompletion>[0]> = {},
): Parameters<typeof recordCompletion>[0] {
  return {
    shopDomain: "shop-e.myshopify.com",
    identityKey: "device:xyz",
    puzzleId: "puzzle-1",
    discountCode: "PIECEUP-ABC123",
    prizeTitle: "Prize",
    ...overrides,
  };
}

describe("hasAlreadyPlayed / recordCompletion", () => {
  it("is false before any play, true after recordCompletion (ONCE_EVER)", async () => {
    expect(await hasAlreadyPlayed("shop-e.myshopify.com", "device:xyz", "ONCE_EVER")).toBe(false);
    await recordCompletion(play());
    expect(await hasAlreadyPlayed("shop-e.myshopify.com", "device:xyz", "ONCE_EVER")).toBe(true);
  });

  it("rejects a second recordCompletion for the same identity on the same day", async () => {
    await recordCompletion(play({ shopDomain: "shop-f.myshopify.com", discountCode: "PIECEUP-A" }));
    await expect(
      recordCompletion(play({ shopDomain: "shop-f.myshopify.com", discountCode: "PIECEUP-B" })),
    ).rejects.toThrow();
  });

  it("records which puzzle was played, so revenue can be traced back to it", async () => {
    await recordCompletion(
      play({ shopDomain: "shop-p.myshopify.com", puzzleId: "puzzle-42" }),
    );

    const db = (await import("../db.server")).default;
    const row = await db.playRecord.findFirst({
      where: { shopDomain: "shop-p.myshopify.com" },
    });
    expect(row?.puzzleId).toBe("puzzle-42");
  });
});

describe("countRewardsThisMonth", () => {
  it("counts a play that was given a code", async () => {
    const shop = "shop-q1.myshopify.com";
    await recordCompletion(play({ shopDomain: shop, discountCode: "PIECEUP-Q1" }));

    expect(await countRewardsThisMonth(shop)).toBe(1);
  });

  it("does not spend the shop's allowance on a prize that awarded nothing", async () => {
    // A "try again" gift mints no code. It used to be stored as the empty
    // string, which passes a `not: null` filter — so prizes worth nothing were
    // eating a Free shop's 100 monthly rewards. Null is the honest value and
    // the only one the count excludes.
    const shop = "shop-q2.myshopify.com";
    await recordCompletion(play({ shopDomain: shop, discountCode: null }));

    expect(await countRewardsThisMonth(shop)).toBe(0);
  });
});

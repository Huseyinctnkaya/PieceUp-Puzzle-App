import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-puzzle-stat.sqlite";
// Prisma resolves relative sqlite URLs against prisma/schema.prisma's own
// directory, while node:fs resolves against the process cwd — hence the two
// different-looking paths for the same file.
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// Loaded dynamically so the Prisma client binds to the test database: static
// imports are hoisted above the DATABASE_URL assignment above.
let db: typeof import("../db.server").default;
let recordStat: typeof import("./puzzleStat.server").recordStat;
let getFunnelTotals: typeof import("./puzzleStat.server").getFunnelTotals;
let getDailyStats: typeof import("./puzzleStat.server").getDailyStats;
let getTotalsByPuzzle: typeof import("./puzzleStat.server").getTotalsByPuzzle;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  ({ recordStat, getFunnelTotals, getDailyStats, getTotalsByPuzzle } =
    await import("./puzzleStat.server"));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await db.puzzleStat.deleteMany();
});

const SHOP = "shop-stats.myshopify.com";

describe("recordStat", () => {
  it("creates the day's row on first event, then increments it", async () => {
    await recordStat(SHOP, "puzzle-1", "opened");
    await recordStat(SHOP, "puzzle-1", "opened");
    await recordStat(SHOP, "puzzle-1", "completed");

    const totals = await getFunnelTotals(SHOP);
    expect(totals).toEqual({ opened: 2, completed: 1, rewarded: 0 });
    // One row per shop/puzzle/day — the whole point of aggregating.
    expect(await db.puzzleStat.count()).toBe(1);
  });

  it("keeps stages independent so completed-without-reward is visible", async () => {
    await recordStat(SHOP, "puzzle-1", "completed");
    await recordStat(SHOP, "puzzle-1", "completed");
    await recordStat(SHOP, "puzzle-1", "rewarded");

    const { completed, rewarded } = await getFunnelTotals(SHOP);
    // This gap is what tells a merchant the plan limit cost them a customer.
    expect(completed - rewarded).toBe(1);
  });

  it("keeps separate rows per puzzle", async () => {
    await recordStat(SHOP, "puzzle-1", "opened");
    await recordStat(SHOP, "puzzle-2", "opened");
    await recordStat(SHOP, "puzzle-2", "opened");

    const byPuzzle = await getTotalsByPuzzle(SHOP);
    expect(byPuzzle).toHaveLength(2);
    expect(byPuzzle.find((row) => row.puzzleId === "puzzle-2")?.opened).toBe(2);
  });

  it("does not leak stats between shops", async () => {
    await recordStat(SHOP, "puzzle-1", "opened");
    await recordStat("other-shop.myshopify.com", "puzzle-1", "opened");

    expect((await getFunnelTotals(SHOP)).opened).toBe(1);
  });
});

describe("getDailyStats", () => {
  it("returns a row for every day in range, including silent ones", async () => {
    await recordStat(SHOP, "puzzle-1", "opened");

    const daily = await getDailyStats(SHOP, 7);
    expect(daily).toHaveLength(7);
    // Gaps must be zeroes rather than missing entries, or a chart would
    // silently compress quiet days and misrepresent the trend.
    expect(daily.filter((day) => day.opened === 0)).toHaveLength(6);
    expect(daily[daily.length - 1].opened).toBe(1);
  });

  it("sums across puzzles for a shared date", async () => {
    await recordStat(SHOP, "puzzle-1", "opened");
    await recordStat(SHOP, "puzzle-2", "opened");

    const daily = await getDailyStats(SHOP, 7);
    expect(daily[daily.length - 1].opened).toBe(2);
  });

  it("can be narrowed to a single puzzle", async () => {
    await recordStat(SHOP, "puzzle-1", "opened");
    await recordStat(SHOP, "puzzle-2", "opened");

    const daily = await getDailyStats(SHOP, 7, "puzzle-1");
    expect(daily[daily.length - 1].opened).toBe(1);
  });
});

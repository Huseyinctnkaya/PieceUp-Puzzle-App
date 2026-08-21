import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-puzzle-config.sqlite";
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
// process.env.DATABASE_URL assignment above. That means a static
// `import db from "../db.server"` would construct the Prisma client against
// whatever DATABASE_URL was set *before* this file ran (verified empirically:
// it silently connected to the real dev.sqlite). We load these modules
// dynamically inside beforeAll, after DATABASE_URL is set and migrated,
// so the Prisma client binds to the isolated test database.
let db: typeof import("../db.server").default;
let getPuzzleConfig: typeof import("./puzzleConfig.server").getPuzzleConfig;
let upsertPuzzleConfig: typeof import("./puzzleConfig.server").upsertPuzzleConfig;
let getActivePuzzleConfig: typeof import("./puzzleConfig.server").getActivePuzzleConfig;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  ({ getPuzzleConfig, upsertPuzzleConfig, getActivePuzzleConfig } = await import(
    "./puzzleConfig.server"
  ));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await db.puzzleConfig.deleteMany();
});

const baseInput = {
  imageUrl: "https://cdn.example/a.jpg",
  pieceCount: 9,
  rewardType: "PERCENTAGE_DISCOUNT" as const,
  rewardValue: "10",
  triggerMode: "BUTTON" as const,
  triggerPage: "ALL" as const,
  triggerDelaySeconds: null,
  playLimitType: "ONCE_EVER" as const,
  isActive: true,
  startDate: null,
  endDate: null,
};

describe("upsertPuzzleConfig / getPuzzleConfig", () => {
  it("creates a config when none exists, then updates it on a second call", async () => {
    await upsertPuzzleConfig("shop-a.myshopify.com", baseInput);
    let config = await getPuzzleConfig("shop-a.myshopify.com");
    expect(config?.pieceCount).toBe(9);

    await upsertPuzzleConfig("shop-a.myshopify.com", { ...baseInput, pieceCount: 16 });
    config = await getPuzzleConfig("shop-a.myshopify.com");
    expect(config?.pieceCount).toBe(16);
  });
});

describe("getActivePuzzleConfig", () => {
  it("returns null when isActive is false", async () => {
    await upsertPuzzleConfig("shop-b.myshopify.com", { ...baseInput, isActive: false });
    expect(await getActivePuzzleConfig("shop-b.myshopify.com")).toBeNull();
  });

  it("returns null when startDate is in the future", async () => {
    const future = new Date(Date.now() + 86400000);
    await upsertPuzzleConfig("shop-c.myshopify.com", { ...baseInput, startDate: future });
    expect(await getActivePuzzleConfig("shop-c.myshopify.com")).toBeNull();
  });

  it("returns the config when active and within date range", async () => {
    await upsertPuzzleConfig("shop-d.myshopify.com", baseInput);
    const config = await getActivePuzzleConfig("shop-d.myshopify.com");
    expect(config?.shopDomain).toBe("shop-d.myshopify.com");
  });
});

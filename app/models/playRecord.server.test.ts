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

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  ({ hasAlreadyPlayed, recordCompletion } = await import("./playRecord.server"));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

describe("hasAlreadyPlayed / recordCompletion", () => {
  it("is false before any play, true after recordCompletion (ONCE_EVER)", async () => {
    expect(await hasAlreadyPlayed("shop-e.myshopify.com", "device:xyz", "ONCE_EVER")).toBe(false);
    await recordCompletion("shop-e.myshopify.com", "device:xyz", "PIECEUP-ABC123", "Prize");
    expect(await hasAlreadyPlayed("shop-e.myshopify.com", "device:xyz", "ONCE_EVER")).toBe(true);
  });

  it("rejects a second recordCompletion for the same identity on the same day", async () => {
    await recordCompletion("shop-f.myshopify.com", "device:xyz", "PIECEUP-A", "Prize");
    await expect(
      recordCompletion("shop-f.myshopify.com", "device:xyz", "PIECEUP-B", "Prize"),
    ).rejects.toThrow();
  });
});

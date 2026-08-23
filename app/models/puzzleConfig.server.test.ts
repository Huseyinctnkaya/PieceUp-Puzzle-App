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
let listPuzzleConfigs: typeof import("./puzzleConfig.server").listPuzzleConfigs;
let getPuzzleConfigById: typeof import("./puzzleConfig.server").getPuzzleConfigById;
let createPuzzleConfig: typeof import("./puzzleConfig.server").createPuzzleConfig;
let updatePuzzleConfig: typeof import("./puzzleConfig.server").updatePuzzleConfig;
let deletePuzzleConfig: typeof import("./puzzleConfig.server").deletePuzzleConfig;
let getActivePuzzleConfig: typeof import("./puzzleConfig.server").getActivePuzzleConfig;
let AlreadyActiveError: typeof import("./puzzleConfig.server").AlreadyActiveError;
let PuzzleIsActiveError: typeof import("./puzzleConfig.server").PuzzleIsActiveError;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  ({
    listPuzzleConfigs,
    getPuzzleConfigById,
    createPuzzleConfig,
    updatePuzzleConfig,
    deletePuzzleConfig,
    getActivePuzzleConfig,
    AlreadyActiveError,
    PuzzleIsActiveError,
  } = await import("./puzzleConfig.server"));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  await db.puzzleConfig.deleteMany();
});

const baseInput = {
  name: "Test Puzzle",
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

describe("createPuzzleConfig / listPuzzleConfigs / getPuzzleConfigById", () => {
  it("creates multiple puzzles for the same shop and lists them all", async () => {
    await createPuzzleConfig("shop-a.myshopify.com", { ...baseInput, name: "A", isActive: false });
    await createPuzzleConfig("shop-a.myshopify.com", { ...baseInput, name: "B", isActive: false });
    const list = await listPuzzleConfigs("shop-a.myshopify.com");
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name).sort()).toEqual(["A", "B"]);
  });

  it("scopes getPuzzleConfigById to the given shop", async () => {
    const created = await createPuzzleConfig("shop-a.myshopify.com", {
      ...baseInput,
      isActive: false,
    });
    expect(await getPuzzleConfigById("shop-a.myshopify.com", created.id)).not.toBeNull();
    expect(await getPuzzleConfigById("shop-other.myshopify.com", created.id)).toBeNull();
  });
});

describe("activation guard", () => {
  it("allows creating the first active puzzle for a shop", async () => {
    const created = await createPuzzleConfig("shop-b.myshopify.com", {
      ...baseInput,
      isActive: true,
    });
    expect(created.isActive).toBe(true);
  });

  it("rejects creating a second active puzzle while one is already active", async () => {
    await createPuzzleConfig("shop-c.myshopify.com", { ...baseInput, name: "First", isActive: true });
    await expect(
      createPuzzleConfig("shop-c.myshopify.com", { ...baseInput, name: "Second", isActive: true }),
    ).rejects.toThrow(AlreadyActiveError);
  });

  it("rejects activating an existing inactive puzzle while another is active", async () => {
    await createPuzzleConfig("shop-d.myshopify.com", { ...baseInput, name: "First", isActive: true });
    const second = await createPuzzleConfig("shop-d.myshopify.com", {
      ...baseInput,
      name: "Second",
      isActive: false,
    });
    await expect(
      updatePuzzleConfig("shop-d.myshopify.com", second.id, { ...baseInput, name: "Second", isActive: true }),
    ).rejects.toThrow(AlreadyActiveError);
  });

  it("allows re-saving the currently active puzzle without tripping its own guard", async () => {
    const created = await createPuzzleConfig("shop-e.myshopify.com", { ...baseInput, isActive: true });
    const updated = await updatePuzzleConfig("shop-e.myshopify.com", created.id, {
      ...baseInput,
      pieceCount: 16,
      isActive: true,
    });
    expect(updated.pieceCount).toBe(16);
    expect(updated.isActive).toBe(true);
  });

  it("allows activating a puzzle once the previously active one is deactivated", async () => {
    const first = await createPuzzleConfig("shop-f.myshopify.com", {
      ...baseInput,
      name: "First",
      isActive: true,
    });
    const second = await createPuzzleConfig("shop-f.myshopify.com", {
      ...baseInput,
      name: "Second",
      isActive: false,
    });
    await updatePuzzleConfig("shop-f.myshopify.com", first.id, { ...baseInput, name: "First", isActive: false });
    const activated = await updatePuzzleConfig("shop-f.myshopify.com", second.id, {
      ...baseInput,
      name: "Second",
      isActive: true,
    });
    expect(activated.isActive).toBe(true);
  });
});

describe("deletePuzzleConfig", () => {
  it("deletes an inactive puzzle", async () => {
    const created = await createPuzzleConfig("shop-g.myshopify.com", {
      ...baseInput,
      isActive: false,
    });
    await deletePuzzleConfig("shop-g.myshopify.com", created.id);
    expect(await getPuzzleConfigById("shop-g.myshopify.com", created.id)).toBeNull();
  });

  it("refuses to delete an active puzzle", async () => {
    const created = await createPuzzleConfig("shop-h.myshopify.com", {
      ...baseInput,
      isActive: true,
    });
    await expect(deletePuzzleConfig("shop-h.myshopify.com", created.id)).rejects.toThrow(
      PuzzleIsActiveError,
    );
    expect(await getPuzzleConfigById("shop-h.myshopify.com", created.id)).not.toBeNull();
  });
});

describe("getActivePuzzleConfig", () => {
  it("returns null when no puzzle is active", async () => {
    await createPuzzleConfig("shop-i.myshopify.com", { ...baseInput, isActive: false });
    expect(await getActivePuzzleConfig("shop-i.myshopify.com")).toBeNull();
  });

  it("returns null when the active puzzle's startDate is in the future", async () => {
    const future = new Date(Date.now() + 86400000);
    await createPuzzleConfig("shop-j.myshopify.com", { ...baseInput, isActive: true, startDate: future });
    expect(await getActivePuzzleConfig("shop-j.myshopify.com")).toBeNull();
  });

  it("returns the active puzzle when within date range, ignoring inactive ones", async () => {
    await createPuzzleConfig("shop-k.myshopify.com", { ...baseInput, name: "Inactive", isActive: false });
    await createPuzzleConfig("shop-k.myshopify.com", { ...baseInput, name: "Active", isActive: true });
    const config = await getActivePuzzleConfig("shop-k.myshopify.com");
    expect(config?.name).toBe("Active");
  });
});

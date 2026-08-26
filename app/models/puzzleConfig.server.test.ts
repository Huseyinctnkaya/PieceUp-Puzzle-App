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
let PuzzleInExperimentError: typeof import("./puzzleConfig.server").PuzzleInExperimentError;
let NotFoundError: typeof import("./puzzleConfig.server").NotFoundError;
let PuzzleLimitReachedError: typeof import("./puzzleConfig.server").PuzzleLimitReachedError;

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
    PuzzleInExperimentError,
    NotFoundError,
    PuzzleLimitReachedError,
  } = await import("./puzzleConfig.server"));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

beforeEach(async () => {
  // Experiments first: they reference puzzles, and one left running would
  // make the delete guard fire in a later test that never asked for it.
  await db.experiment.deleteMany();
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
    await createPuzzleConfig("shop-a.myshopify.com", {
      ...baseInput,
      name: "A",
      isActive: false,
    });
    await createPuzzleConfig("shop-a.myshopify.com", {
      ...baseInput,
      name: "B",
      isActive: false,
    });
    const list = await listPuzzleConfigs("shop-a.myshopify.com");
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.name).sort()).toEqual(["A", "B"]);
  });

  it("scopes getPuzzleConfigById to the given shop", async () => {
    const created = await createPuzzleConfig("shop-a.myshopify.com", {
      ...baseInput,
      isActive: false,
    });
    expect(
      await getPuzzleConfigById("shop-a.myshopify.com", created.id),
    ).not.toBeNull();
    expect(
      await getPuzzleConfigById("shop-other.myshopify.com", created.id),
    ).toBeNull();
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
    await createPuzzleConfig("shop-c.myshopify.com", {
      ...baseInput,
      name: "First",
      isActive: true,
    });
    await expect(
      createPuzzleConfig("shop-c.myshopify.com", {
        ...baseInput,
        name: "Second",
        isActive: true,
      }),
    ).rejects.toThrow(AlreadyActiveError);
  });

  it("rejects activating an existing inactive puzzle while another is active", async () => {
    await createPuzzleConfig("shop-d.myshopify.com", {
      ...baseInput,
      name: "First",
      isActive: true,
    });
    const second = await createPuzzleConfig("shop-d.myshopify.com", {
      ...baseInput,
      name: "Second",
      isActive: false,
    });
    await expect(
      updatePuzzleConfig("shop-d.myshopify.com", second.id, {
        ...baseInput,
        name: "Second",
        isActive: true,
      }),
    ).rejects.toThrow(AlreadyActiveError);
  });

  it("allows re-saving the currently active puzzle without tripping its own guard", async () => {
    const created = await createPuzzleConfig("shop-e.myshopify.com", {
      ...baseInput,
      isActive: true,
    });
    const updated = await updatePuzzleConfig(
      "shop-e.myshopify.com",
      created.id,
      {
        ...baseInput,
        pieceCount: 16,
        isActive: true,
      },
    );
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
    await updatePuzzleConfig("shop-f.myshopify.com", first.id, {
      ...baseInput,
      name: "First",
      isActive: false,
    });
    const activated = await updatePuzzleConfig(
      "shop-f.myshopify.com",
      second.id,
      {
        ...baseInput,
        name: "Second",
        isActive: true,
      },
    );
    expect(activated.isActive).toBe(true);
  });
});

describe("plan puzzle limit", () => {
  it("refuses to create beyond the limit the caller passes in", async () => {
    await createPuzzleConfig(
      "shop-limit.myshopify.com",
      { ...baseInput, name: "First", isActive: false },
      1,
    );
    await expect(
      createPuzzleConfig(
        "shop-limit.myshopify.com",
        { ...baseInput, name: "Second", isActive: false },
        1,
      ),
    ).rejects.toThrow(PuzzleLimitReachedError);
    expect(await listPuzzleConfigs("shop-limit.myshopify.com")).toHaveLength(1);
  });

  it("does not cap creation when no limit is given", async () => {
    for (const name of ["A", "B", "C"]) {
      await createPuzzleConfig("shop-unmetered.myshopify.com", {
        ...baseInput,
        name,
        isActive: false,
      });
    }
    expect(
      await listPuzzleConfigs("shop-unmetered.myshopify.com"),
    ).toHaveLength(3);
  });

  it("counts only the caller's own shop toward the limit", async () => {
    await createPuzzleConfig(
      "shop-mine.myshopify.com",
      { ...baseInput, isActive: false },
      1,
    );
    // A different shop being at its limit must not block this one.
    await expect(
      createPuzzleConfig(
        "shop-theirs.myshopify.com",
        { ...baseInput, isActive: false },
        1,
      ),
    ).resolves.toBeTruthy();
  });
});

describe("cross-tenant protection", () => {
  it("refuses to update a puzzle belonging to a different shop", async () => {
    const created = await createPuzzleConfig("shop-victim.myshopify.com", {
      ...baseInput,
      name: "Victim's puzzle",
      isActive: false,
    });
    await expect(
      updatePuzzleConfig("shop-attacker.myshopify.com", created.id, {
        ...baseInput,
        name: "Hijacked",
      }),
    ).rejects.toThrow(NotFoundError);
    // The row must be completely untouched — not partially written before failing.
    const stillOwned = await getPuzzleConfigById(
      "shop-victim.myshopify.com",
      created.id,
    );
    expect(stillOwned?.name).toBe("Victim's puzzle");
  });

  it("refuses to delete a puzzle belonging to a different shop", async () => {
    const created = await createPuzzleConfig("shop-victim2.myshopify.com", {
      ...baseInput,
      isActive: false,
    });
    await expect(
      deletePuzzleConfig("shop-attacker2.myshopify.com", created.id),
    ).rejects.toThrow(NotFoundError);
    expect(
      await getPuzzleConfigById("shop-victim2.myshopify.com", created.id),
    ).not.toBeNull();
  });
});

describe("deletePuzzleConfig", () => {
  it("deletes an inactive puzzle", async () => {
    const created = await createPuzzleConfig("shop-g.myshopify.com", {
      ...baseInput,
      isActive: false,
    });
    await deletePuzzleConfig("shop-g.myshopify.com", created.id);
    expect(
      await getPuzzleConfigById("shop-g.myshopify.com", created.id),
    ).toBeNull();
  });

  it("refuses to delete an active puzzle", async () => {
    const created = await createPuzzleConfig("shop-h.myshopify.com", {
      ...baseInput,
      isActive: true,
    });
    await expect(
      deletePuzzleConfig("shop-h.myshopify.com", created.id),
    ).rejects.toThrow(PuzzleIsActiveError);
    expect(
      await getPuzzleConfigById("shop-h.myshopify.com", created.id),
    ).not.toBeNull();
  });

  it("refuses to delete a puzzle that is in a running A/B test", async () => {
    // A variant deleted mid-test leaves half the shoppers with no puzzle at
    // all, and the experiment measuring against nothing.
    const shop = "shop-exp-delete.myshopify.com";
    const { startExperiment } = await import("./experiment.server");
    const a = await createPuzzleConfig(shop, { ...baseInput, isActive: false });
    const b = await createPuzzleConfig(shop, { ...baseInput, isActive: false });
    await startExperiment(shop, {
      name: "Test",
      variantAId: a.id,
      variantBId: b.id,
      splitPercent: 50,
    });

    await expect(deletePuzzleConfig(shop, a.id)).rejects.toThrow(
      PuzzleInExperimentError,
    );
    expect(await getPuzzleConfigById(shop, a.id)).not.toBeNull();
  });

  it("allows the delete once the test has stopped", async () => {
    const shop = "shop-exp-delete2.myshopify.com";
    const { startExperiment, stopExperiment } = await import(
      "./experiment.server"
    );
    const a = await createPuzzleConfig(shop, { ...baseInput, isActive: false });
    const b = await createPuzzleConfig(shop, { ...baseInput, isActive: false });
    const experiment = await startExperiment(shop, {
      name: "Test",
      variantAId: a.id,
      variantBId: b.id,
      splitPercent: 50,
    });
    await stopExperiment(shop, experiment.id);

    await deletePuzzleConfig(shop, a.id);
    expect(await getPuzzleConfigById(shop, a.id)).toBeNull();
  });
});

describe("getActivePuzzleConfig", () => {
  it("returns null when no puzzle is active", async () => {
    await createPuzzleConfig("shop-i.myshopify.com", {
      ...baseInput,
      isActive: false,
    });
    expect(await getActivePuzzleConfig("shop-i.myshopify.com")).toBeNull();
  });

  it("returns null when the active puzzle's startDate is in the future", async () => {
    const future = new Date(Date.now() + 86400000);
    await createPuzzleConfig("shop-j.myshopify.com", {
      ...baseInput,
      isActive: true,
      startDate: future,
    });
    expect(await getActivePuzzleConfig("shop-j.myshopify.com")).toBeNull();
  });

  it("returns the active puzzle when within date range, ignoring inactive ones", async () => {
    await createPuzzleConfig("shop-k.myshopify.com", {
      ...baseInput,
      name: "Inactive",
      isActive: false,
    });
    await createPuzzleConfig("shop-k.myshopify.com", {
      ...baseInput,
      name: "Active",
      isActive: true,
    });
    const config = await getActivePuzzleConfig("shop-k.myshopify.com");
    expect(config?.name).toBe("Active");
  });
});

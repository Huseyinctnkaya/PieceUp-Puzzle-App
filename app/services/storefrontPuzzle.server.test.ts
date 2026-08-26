import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-storefront-puzzle.sqlite";
// Prisma resolves relative sqlite URLs against prisma/schema.prisma's own
// directory, while node:fs resolves against the process cwd — hence the two
// different-looking paths for the same file.
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// Loaded dynamically so the Prisma client binds to the test database: static
// imports are hoisted above the DATABASE_URL assignment above.
let db: typeof import("../db.server").default;
let getPuzzleForShopper: typeof import("./storefrontPuzzle.server").getPuzzleForShopper;
let startExperiment: typeof import("../models/experiment.server").startExperiment;

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  ({ getPuzzleForShopper } = await import("./storefrontPuzzle.server"));
  ({ startExperiment } = await import("../models/experiment.server"));
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

const SHOP = "shop-front.myshopify.com";
let puzzleA = "";
let puzzleB = "";
let activeId = "";

beforeEach(async () => {
  await db.experiment.deleteMany();
  await db.puzzleConfig.deleteMany();

  puzzleA = (
    await db.puzzleConfig.create({ data: { shopDomain: SHOP, name: "Variant A" } })
  ).id;
  puzzleB = (
    await db.puzzleConfig.create({ data: { shopDomain: SHOP, name: "Variant B" } })
  ).id;
  activeId = (
    await db.puzzleConfig.create({
      data: { shopDomain: SHOP, name: "The usual one", isActive: true },
    })
  ).id;
});

describe("getPuzzleForShopper", () => {
  it("serves the shop's active puzzle when no experiment is running", async () => {
    const config = await getPuzzleForShopper(SHOP, "device:abc");
    expect(config?.id).toBe(activeId);
  });

  it("serves a variant while an experiment is running", async () => {
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 50,
    });

    const config = await getPuzzleForShopper(SHOP, "device:abc");

    // Never the shop's own active puzzle: a running experiment is the
    // storefront's authority, or its traffic would leak to a third campaign.
    expect([puzzleA, puzzleB]).toContain(config?.id);
    expect(config?.id).not.toBe(activeId);
  });

  it("gives the same shopper the same variant across every request", async () => {
    // config, track and complete each resolve the puzzle independently. If
    // they could disagree, a shopper would be shown one puzzle, counted
    // against a second and rewarded from a third.
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 50,
    });

    const first = await getPuzzleForShopper(SHOP, "device:steady");
    for (let i = 0; i < 5; i++) {
      expect((await getPuzzleForShopper(SHOP, "device:steady"))?.id).toBe(
        first?.id,
      );
    }
  });

  it("sends different shoppers to both variants", async () => {
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 50,
    });

    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const config = await getPuzzleForShopper(SHOP, `device:${i}`);
      if (config) seen.add(config.id);
    }

    expect(seen).toEqual(new Set([puzzleA, puzzleB]));
  });

  it("honours a one-sided split", async () => {
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 100,
    });

    for (let i = 0; i < 20; i++) {
      expect((await getPuzzleForShopper(SHOP, `device:${i}`))?.id).toBe(puzzleA);
    }
  });

  it("falls back to the active puzzle for a request with no identity", async () => {
    // An older widget cached by a theme does not send one. Serving the usual
    // puzzle keeps that shopper playing; only the experiment misses them.
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 50,
    });

    expect((await getPuzzleForShopper(SHOP, null))?.id).toBe(activeId);
  });

  it("returns the variant with its gifts attached", async () => {
    // The storefront renders the gift step straight from this, and the
    // completion route reads the chosen gift's discount off it.
    await db.puzzleGift.create({
      data: { puzzleConfigId: puzzleA, title: "%20" },
    });
    await db.puzzleGift.create({
      data: { puzzleConfigId: puzzleB, title: "Free shipping" },
    });
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 50,
    });

    const config = await getPuzzleForShopper(SHOP, "device:abc");
    expect(config?.gifts).toHaveLength(1);
  });

  it("goes back to the active puzzle once the experiment stops", async () => {
    const { stopExperiment } = await import("../models/experiment.server");
    const experiment = await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 50,
    });
    await stopExperiment(SHOP, experiment.id);

    expect((await getPuzzleForShopper(SHOP, "device:abc"))?.id).toBe(activeId);
  });

  it("returns nothing when a variant has been deleted underneath it", async () => {
    await startExperiment(SHOP, {
      name: "Test",
      variantAId: puzzleA,
      variantBId: puzzleB,
      splitPercent: 100,
    });
    await db.puzzleConfig.delete({ where: { id: puzzleA } });

    // Not silently the active puzzle: that would quietly pour the experiment's
    // traffic into a third campaign and corrupt the result being measured.
    expect(await getPuzzleForShopper(SHOP, "device:abc")).toBeNull();
  });
});

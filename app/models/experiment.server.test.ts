import { execSync } from "node:child_process";
import { unlinkSync, existsSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";

const TEST_DB_FILENAME = "test-experiment.sqlite";
// Prisma resolves relative sqlite URLs against prisma/schema.prisma's own
// directory, while node:fs resolves against the process cwd — hence the two
// different-looking paths for the same file.
process.env.DATABASE_URL = `file:${TEST_DB_FILENAME}`;
const TEST_DB_PATH = `./prisma/${TEST_DB_FILENAME}`;

// Loaded dynamically so the Prisma client binds to the test database: static
// imports are hoisted above the DATABASE_URL assignment above.
let db: typeof import("../db.server").default;
let model: typeof import("./experiment.server");

beforeAll(async () => {
  execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
  db = (await import("../db.server")).default;
  model = await import("./experiment.server");
});

afterAll(() => {
  if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
});

const SHOP = "shop-ab.myshopify.com";
let puzzleA = "";
let puzzleB = "";

beforeEach(async () => {
  await db.experiment.deleteMany();
  await db.attributedOrder.deleteMany();
  await db.puzzleStat.deleteMany();
  await db.puzzleConfig.deleteMany();

  puzzleA = (
    await db.puzzleConfig.create({ data: { shopDomain: SHOP, name: "A" } })
  ).id;
  puzzleB = (
    await db.puzzleConfig.create({ data: { shopDomain: SHOP, name: "B" } })
  ).id;
});

function start(overrides: Record<string, unknown> = {}) {
  return model.startExperiment(SHOP, {
    name: "Piece count",
    variantAId: puzzleA,
    variantBId: puzzleB,
    splitPercent: 50,
    ...overrides,
  });
}

describe("startExperiment", () => {
  it("starts an experiment over two puzzles", async () => {
    const experiment = await start();

    expect(experiment.status).toBe("RUNNING");
    expect(experiment.variantAId).toBe(puzzleA);
    expect(experiment.variantBId).toBe(puzzleB);
  });

  it("refuses to test a puzzle against itself", async () => {
    await expect(start({ variantBId: puzzleA })).rejects.toThrow();
  });

  it("refuses a puzzle belonging to another shop", async () => {
    const foreign = await db.puzzleConfig.create({
      data: { shopDomain: "other.myshopify.com", name: "Theirs" },
    });

    await expect(start({ variantBId: foreign.id })).rejects.toThrow();
  });

  it("allows only one experiment at a time", async () => {
    // Two experiments at once would split the same traffic twice over, and
    // neither set of results would mean anything.
    await start();
    await expect(start({ name: "Second" })).rejects.toThrow();
  });

  it("lets a new experiment start once the last one stopped", async () => {
    const first = await start();
    await model.stopExperiment(SHOP, first.id);

    await expect(start({ name: "Second" })).resolves.toBeTruthy();
  });
});

describe("getRunningExperiment", () => {
  it("returns nothing when no experiment is running", async () => {
    expect(await model.getRunningExperiment(SHOP)).toBeNull();
  });

  it("returns the running experiment", async () => {
    const started = await start();
    expect((await model.getRunningExperiment(SHOP))?.id).toBe(started.id);
  });

  it("stops returning it once stopped", async () => {
    const started = await start();
    await model.stopExperiment(SHOP, started.id);

    expect(await model.getRunningExperiment(SHOP)).toBeNull();
  });

  it("does not leak another shop's experiment", async () => {
    await start();
    expect(await model.getRunningExperiment("other.myshopify.com")).toBeNull();
  });
});

describe("stopExperiment", () => {
  it("records when it stopped, so results stay readable", async () => {
    const started = await start();
    const stopped = await model.stopExperiment(SHOP, started.id);

    expect(stopped.status).toBe("STOPPED");
    expect(stopped.stoppedAt).toBeInstanceOf(Date);
  });

  it("refuses to stop another shop's experiment", async () => {
    const started = await start();
    await expect(
      model.stopExperiment("other.myshopify.com", started.id),
    ).rejects.toThrow();
  });
});

describe("isPuzzleInRunningExperiment", () => {
  it("is true for both variants and false for anything else", async () => {
    await start();
    const other = await db.puzzleConfig.create({
      data: { shopDomain: SHOP, name: "C" },
    });

    expect(await model.isPuzzleInRunningExperiment(SHOP, puzzleA)).toBe(true);
    expect(await model.isPuzzleInRunningExperiment(SHOP, puzzleB)).toBe(true);
    expect(await model.isPuzzleInRunningExperiment(SHOP, other.id)).toBe(false);
  });

  it("is false again once the experiment stops", async () => {
    const started = await start();
    await model.stopExperiment(SHOP, started.id);

    expect(await model.isPuzzleInRunningExperiment(SHOP, puzzleA)).toBe(false);
  });
});

describe("getExperimentResults", () => {
  /** Counters and orders for one variant, dated inside the experiment window. */
  async function givenTraffic(
    puzzleId: string,
    opened: number,
    completed: number,
    orderTotals: number[],
  ) {
    await db.puzzleStat.create({
      data: {
        shopDomain: SHOP,
        puzzleId,
        date: new Date().toISOString().slice(0, 10),
        opened,
        completed,
        rewarded: completed,
      },
    });
    for (const [i, totalCents] of orderTotals.entries()) {
      await db.attributedOrder.create({
        data: {
          shopDomain: SHOP,
          orderId: `gid://shopify/Order/${puzzleId}-${i}`,
          discountCode: `PIECEUP-${puzzleId}-${i}`,
          puzzleId,
          totalCents,
          currency: "TRY",
          orderedAt: new Date(),
        },
      });
    }
  }

  it("reports each variant's traffic and revenue", async () => {
    const started = await start();
    await givenTraffic(puzzleA, 500, 100, [10000, 20000]);
    await givenTraffic(puzzleB, 500, 150, [30000]);

    const results = await model.getExperimentResults(SHOP, started.id);

    expect(results.a.opened).toBe(500);
    expect(results.a.completed).toBe(100);
    expect(results.a.revenueCents).toBe(30000);
    expect(results.b.revenueCents).toBe(30000);
    expect(results.b.completed).toBe(150);
  });

  it("calls a clear revenue win significant", async () => {
    const started = await start();
    // Same visitors, B earning steadily more across many orders.
    await givenTraffic(puzzleA, 1000, 200, Array(100).fill(10000));
    await givenTraffic(puzzleB, 1000, 200, Array(200).fill(10000));

    const results = await model.getExperimentResults(SHOP, started.id);

    expect(results.revenue.leader).toBe("B");
    expect(results.revenue.significant).toBe(true);
  });

  it("withholds a verdict while the sample is small", async () => {
    const started = await start();
    await givenTraffic(puzzleA, 20, 5, [10000]);
    await givenTraffic(puzzleB, 20, 15, [50000]);

    const results = await model.getExperimentResults(SHOP, started.id);

    expect(results.revenue.enoughData).toBe(false);
    expect(results.revenue.significant).toBe(false);
  });

  it("ignores orders placed before the experiment began", async () => {
    // A puzzle that ran on its own for months would otherwise carry all of
    // that history into the comparison and win before the test started.
    const started = await db.experiment.create({
      data: {
        shopDomain: SHOP,
        name: "Late start",
        variantAId: puzzleA,
        variantBId: puzzleB,
        startedAt: new Date("2026-08-20T00:00:00Z"),
      },
    });
    await db.attributedOrder.create({
      data: {
        shopDomain: SHOP,
        orderId: "gid://shopify/Order/old",
        discountCode: "PIECEUP-OLD",
        puzzleId: puzzleA,
        totalCents: 999999,
        currency: "TRY",
        orderedAt: new Date("2026-08-01T00:00:00Z"),
      },
    });

    const results = await model.getExperimentResults(SHOP, started.id);

    expect(results.a.revenueCents).toBe(0);
  });

  it("stops counting after the experiment was stopped", async () => {
    const started = await db.experiment.create({
      data: {
        shopDomain: SHOP,
        name: "Finished",
        variantAId: puzzleA,
        variantBId: puzzleB,
        status: "STOPPED",
        startedAt: new Date("2026-08-01T00:00:00Z"),
        stoppedAt: new Date("2026-08-10T00:00:00Z"),
      },
    });
    await db.attributedOrder.create({
      data: {
        shopDomain: SHOP,
        orderId: "gid://shopify/Order/after",
        discountCode: "PIECEUP-AFTER",
        puzzleId: puzzleA,
        totalCents: 999999,
        currency: "TRY",
        orderedAt: new Date("2026-08-20T00:00:00Z"),
      },
    });

    const results = await model.getExperimentResults(SHOP, started.id);

    expect(results.a.revenueCents).toBe(0);
  });

  it("throws for an experiment belonging to another shop", async () => {
    const started = await start();
    await expect(
      model.getExperimentResults("other.myshopify.com", started.id),
    ).rejects.toThrow();
  });
});

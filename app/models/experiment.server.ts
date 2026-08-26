import db from "../db.server";
import {
  compareMeans,
  compareProportions,
  visitorsNeededForProportions,
  type Comparison,
} from "../lib/significance";

export class ExperimentNotFoundError extends Error {
  constructor() {
    super("experiment_not_found");
  }
}

export class ExperimentAlreadyRunningError extends Error {
  constructor(public readonly runningName: string) {
    super(`experiment_already_running:${runningName}`);
  }
}

export class InvalidVariantsError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type StartExperimentInput = {
  name: string;
  variantAId: string;
  variantBId: string;
  splitPercent: number;
};

/**
 * Puts two puzzles head to head.
 *
 * Only one experiment may run at a time. Two would split the same traffic
 * twice over, and a shopper sitting in a cell of both would make each result
 * depend on the other — neither number would mean anything on its own.
 */
export async function startExperiment(
  shopDomain: string,
  input: StartExperimentInput,
) {
  if (input.variantAId === input.variantBId) {
    throw new InvalidVariantsError("variants_must_differ");
  }

  const running = await getRunningExperiment(shopDomain);
  if (running) {
    throw new ExperimentAlreadyRunningError(running.name);
  }

  // Both puzzles are confirmed to belong to this shop before anything is
  // written, so an id from elsewhere cannot be tested or read back.
  const owned = await db.puzzleConfig.count({
    where: { shopDomain, id: { in: [input.variantAId, input.variantBId] } },
  });
  if (owned !== 2) {
    throw new InvalidVariantsError("unknown_puzzle");
  }

  return db.experiment.create({
    data: {
      shopDomain,
      name: input.name,
      variantAId: input.variantAId,
      variantBId: input.variantBId,
      splitPercent: input.splitPercent,
      status: "RUNNING",
    },
  });
}

/** The shop's live experiment, if it has one. */
export async function getRunningExperiment(shopDomain: string) {
  return db.experiment.findFirst({
    where: { shopDomain, status: "RUNNING" },
  });
}

export async function stopExperiment(shopDomain: string, id: string) {
  const experiment = await db.experiment.findFirst({ where: { id, shopDomain } });
  if (!experiment) throw new ExperimentNotFoundError();

  return db.experiment.update({
    where: { id },
    // The stop time is kept because the results are read from it: counting
    // traffic a puzzle picked up after the test ended would rewrite a
    // finished experiment's conclusion every time the page was opened.
    data: { status: "STOPPED", stoppedAt: new Date() },
  });
}

export async function listExperiments(shopDomain: string) {
  return db.experiment.findMany({
    where: { shopDomain },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Whether a puzzle is one of the variants of a live experiment.
 *
 * Used to stop a merchant deleting a puzzle out from under a running test,
 * which would leave the experiment comparing against nothing.
 */
export async function isPuzzleInRunningExperiment(
  shopDomain: string,
  puzzleId: string,
): Promise<boolean> {
  const running = await getRunningExperiment(shopDomain);
  if (!running) return false;
  return running.variantAId === puzzleId || running.variantBId === puzzleId;
}

export type VariantResult = {
  puzzleId: string;
  name: string;
  opened: number;
  completed: number;
  rewarded: number;
  revenueCents: number;
  orders: number;
  /** Revenue per visitor, in minor units — the number the test is decided on. */
  revenuePerVisitorCents: number;
};

export type ExperimentResults = {
  id: string;
  name: string;
  status: string;
  startedAt: Date;
  stoppedAt: Date | null;
  splitPercent: number;
  a: VariantResult;
  b: VariantResult;
  /** The decision metric: revenue per visitor, by Welch's t-test. */
  revenue: Comparison;
  /** A faster but weaker signal, shown alongside rather than decided on. */
  completion: Comparison;
  /**
   * Visitors still needed per variant for the completion gap to be provable,
   * or null when the two rates are identical and no wait would settle it.
   */
  visitorsNeeded: number | null;
  currency: string | null;
};

/** A day string, matching how PuzzleStat records its date. */
function dayOf(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Reads a variant's traffic and earnings over the experiment's window.
 *
 * Counters are bucketed by day, so the first and last days are included whole
 * — an experiment started at noon counts that morning's opens too. Over a test
 * long enough to be worth reading this is a rounding error, and both variants
 * are treated identically, so it cannot favour one.
 */
async function variantResult(
  shopDomain: string,
  puzzleId: string,
  from: Date,
  to: Date,
): Promise<VariantResult & { sum: number; sumOfSquares: number }> {
  const [puzzle, stats, orders] = await Promise.all([
    db.puzzleConfig.findFirst({
      where: { id: puzzleId, shopDomain },
      select: { name: true },
    }),
    db.puzzleStat.aggregate({
      where: {
        shopDomain,
        puzzleId,
        date: { gte: dayOf(from), lte: dayOf(to) },
      },
      _sum: { opened: true, completed: true, rewarded: true },
    }),
    // Individual totals rather than an aggregate: the t-test needs the sum of
    // squares to recover the variance, and no aggregate provides it. Bounded
    // by the experiment window and by the 13-month retention sweep.
    db.attributedOrder.findMany({
      where: {
        shopDomain,
        puzzleId,
        cancelled: false,
        orderedAt: { gte: from, lte: to },
      },
      select: { totalCents: true },
    }),
  ]);

  const opened = stats._sum.opened ?? 0;
  const sum = orders.reduce((total, order) => total + order.totalCents, 0);
  const sumOfSquares = orders.reduce(
    (total, order) => total + order.totalCents * order.totalCents,
    0,
  );

  return {
    puzzleId,
    name: puzzle?.name ?? "Deleted puzzle",
    opened,
    completed: stats._sum.completed ?? 0,
    rewarded: stats._sum.rewarded ?? 0,
    revenueCents: sum,
    orders: orders.length,
    revenuePerVisitorCents: opened > 0 ? sum / opened : 0,
    sum,
    sumOfSquares,
  };
}

/**
 * Everything the results page shows, including whether to believe it.
 *
 * The verdict rests on revenue per visitor rather than completion rate. An
 * easier puzzle wins on completions almost by definition, and a merchant who
 * followed that signal would hand out more discounts for the same baskets;
 * revenue per visitor is the number that answers what they actually asked.
 */
export async function getExperimentResults(
  shopDomain: string,
  id: string,
): Promise<ExperimentResults> {
  const experiment = await db.experiment.findFirst({ where: { id, shopDomain } });
  if (!experiment) throw new ExperimentNotFoundError();

  const from = experiment.startedAt;
  const to = experiment.stoppedAt ?? new Date();

  const [a, b, latestOrder] = await Promise.all([
    variantResult(shopDomain, experiment.variantAId, from, to),
    variantResult(shopDomain, experiment.variantBId, from, to),
    db.attributedOrder.findFirst({
      where: { shopDomain },
      orderBy: { orderedAt: "desc" },
      select: { currency: true },
    }),
  ]);

  const revenue = compareMeans(
    { n: a.opened, sum: a.sum, sumOfSquares: a.sumOfSquares },
    { n: b.opened, sum: b.sum, sumOfSquares: b.sumOfSquares },
  );
  const completion = compareProportions(
    { successes: a.completed, total: a.opened },
    { successes: b.completed, total: b.opened },
  );

  return {
    id: experiment.id,
    name: experiment.name,
    status: experiment.status,
    startedAt: experiment.startedAt,
    stoppedAt: experiment.stoppedAt,
    splitPercent: experiment.splitPercent,
    a,
    b,
    revenue,
    completion,
    visitorsNeeded: completion.significant
      ? 0
      : visitorsNeededForProportions(
          completion.rateA,
          completion.rateB,
          Math.min(a.opened, b.opened),
        ),
    currency: latestOrder?.currency ?? null,
  };
}

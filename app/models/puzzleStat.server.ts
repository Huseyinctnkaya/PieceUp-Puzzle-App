import db from "../db.server";
import { todayDateString } from "./playRecord.server";

export type FunnelStage = "opened" | "completed" | "rewarded";

/**
 * Bumps one stage of today's funnel for a puzzle.
 *
 * Uses an upsert so the first event of the day creates the row and the rest
 * increment it — no separate "has today started yet" check, which would race
 * under concurrent shoppers.
 */
export async function recordStat(
  shopDomain: string,
  puzzleId: string,
  stage: FunnelStage,
) {
  const date = todayDateString();
  await db.puzzleStat.upsert({
    where: { shopDomain_puzzleId_date: { shopDomain, puzzleId, date } },
    create: { shopDomain, puzzleId, date, [stage]: 1 },
    update: { [stage]: { increment: 1 } },
  });
}

export type DailyStat = {
  date: string;
  opened: number;
  completed: number;
  rewarded: number;
};

export type FunnelTotals = {
  opened: number;
  completed: number;
  rewarded: number;
};

function startOfDayString(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

/**
 * Daily rows for the last `days` days, oldest first, with days that saw no
 * activity filled in as zeroes so a chart doesn't silently compress gaps.
 */
export async function getDailyStats(
  shopDomain: string,
  days: number,
  puzzleId?: string,
): Promise<DailyStat[]> {
  const since = startOfDayString(days - 1);
  const rows = await db.puzzleStat.findMany({
    where: {
      shopDomain,
      date: { gte: since },
      ...(puzzleId ? { puzzleId } : {}),
    },
  });

  // Several puzzles can share a date, so sum rather than index by date.
  const byDate = new Map<string, DailyStat>();
  for (let i = days - 1; i >= 0; i--) {
    const date = startOfDayString(i);
    byDate.set(date, { date, opened: 0, completed: 0, rewarded: 0 });
  }
  for (const row of rows) {
    const day = byDate.get(row.date);
    if (!day) continue;
    day.opened += row.opened;
    day.completed += row.completed;
    day.rewarded += row.rewarded;
  }
  return [...byDate.values()];
}

export async function getFunnelTotals(
  shopDomain: string,
  puzzleId?: string,
): Promise<FunnelTotals> {
  const totals = await db.puzzleStat.aggregate({
    where: { shopDomain, ...(puzzleId ? { puzzleId } : {}) },
    _sum: { opened: true, completed: true, rewarded: true },
  });
  return {
    opened: totals._sum.opened ?? 0,
    completed: totals._sum.completed ?? 0,
    rewarded: totals._sum.rewarded ?? 0,
  };
}

/** Per-puzzle totals, so campaigns can be compared against each other. */
export async function getTotalsByPuzzle(shopDomain: string) {
  const rows = await db.puzzleStat.groupBy({
    by: ["puzzleId"],
    where: { shopDomain },
    _sum: { opened: true, completed: true, rewarded: true },
  });
  return rows.map((row) => ({
    puzzleId: row.puzzleId,
    opened: row._sum.opened ?? 0,
    completed: row._sum.completed ?? 0,
    rewarded: row._sum.rewarded ?? 0,
  }));
}

import db from "../db.server";

/**
 * How long a play or an attributed order is kept.
 *
 * Thirteen months rather than twelve so a merchant looking at this month can
 * still see the same month a year ago — a year exactly would delete the
 * comparison the day they came to make it. Past that the row has no purpose,
 * and data without a purpose is data that should not be held.
 */
export const RETENTION_MONTHS = 13;

/** How often the sweep runs once the server is up. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function retentionCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  return cutoff;
}

export type PurgeResult = { plays: number; orders: number };

/**
 * Deletes records that have outlived the retention window, across all shops.
 *
 * Only these two tables hold anything time-bound and shopper-linked.
 * `PuzzleConfig` is the merchant's own campaign setup rather than data about
 * anybody, and `PuzzleStat` is daily counters with no link to a person, so
 * neither expires — deleting them would destroy the merchant's own history for
 * no privacy gain.
 */
export async function purgeExpiredRecords(): Promise<PurgeResult> {
  const cutoff = retentionCutoff();

  const [plays, orders] = await Promise.all([
    db.playRecord.deleteMany({ where: { playedAt: { lt: cutoff } } }),
    db.attributedOrder.deleteMany({ where: { orderedAt: { lt: cutoff } } }),
  ]);

  return { plays: plays.count, orders: orders.count };
}

let sweeping: NodeJS.Timeout | null = null;

/**
 * Starts the daily retention sweep, once per process.
 *
 * An in-process timer rather than a cron job because the app ships as a single
 * container with no scheduler beside it. The trade-off is honest: if the
 * process is down at the moment a sweep is due, that day's sweep is skipped
 * and the next one catches everything anyway, since the cutoff is computed
 * fresh each time rather than tracking what was last deleted.
 *
 * `unref` so a pending timer never holds the process open during a deploy.
 */
export function startRetentionSweep() {
  if (sweeping) return;

  const sweep = () => {
    purgeExpiredRecords()
      .then(({ plays, orders }) => {
        if (plays || orders) {
          console.log(
            `[PieceUp] retention sweep removed ${plays} plays and ${orders} orders`,
          );
        }
      })
      // Logged and swallowed: a failed sweep must not take the server with it,
      // and the next run will delete whatever this one missed.
      .catch((error) =>
        console.error("[PieceUp] retention sweep failed:", error),
      );
  };

  sweep();
  sweeping = setInterval(sweep, SWEEP_INTERVAL_MS);
  sweeping.unref?.();
}

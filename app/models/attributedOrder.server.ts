import db from "../db.server";
import type { OrderAttribution } from "../services/orderAttribution.server";

/**
 * Records an order that was placed with a PieceUp code.
 *
 * The puzzle and prize are copied off the play the code came from rather than
 * joined at read time, so deleting a campaign leaves its earnings intact and
 * correctly labelled. A code with no surviving play still counts towards the
 * shop's total — the sale happened — it just cannot say which puzzle earned it.
 */
export async function recordAttributedOrder(
  shopDomain: string,
  attribution: OrderAttribution,
): Promise<void> {
  const play = await db.playRecord.findFirst({
    where: { shopDomain, discountCode: attribution.discountCode },
    select: { puzzleId: true, prizeTitle: true },
  });

  const details = {
    discountCode: attribution.discountCode,
    puzzleId: play?.puzzleId ?? null,
    prizeTitle: play?.prizeTitle ?? null,
    totalCents: attribution.totalCents,
    currency: attribution.currency,
    orderedAt: attribution.orderedAt,
  };

  await db.attributedOrder.upsert({
    where: {
      shopDomain_orderId: { shopDomain, orderId: attribution.orderId },
    },
    create: { shopDomain, orderId: attribution.orderId, ...details },
    // `cancelled` is deliberately not in the update. Shopify redelivers
    // webhooks out of order, so a retried orders/create can land after the
    // orders/cancelled for the same order — and resetting the flag here would
    // quietly put a cancelled sale back into the merchant's revenue.
    update: details,
  });
}

/**
 * Marks an order cancelled so it stops counting towards revenue.
 *
 * Flagged rather than deleted: a merchant comparing this month with last needs
 * the cancellation to change the total without the history changing shape.
 *
 * `updateMany` rather than `update` because the overwhelming majority of
 * cancelled orders never used a PieceUp code and so were never recorded here —
 * that is the normal case, not an error, and it must not throw.
 */
export async function markOrderCancelled(
  shopDomain: string,
  orderId: string,
): Promise<void> {
  await db.attributedOrder.updateMany({
    where: { shopDomain, orderId },
    data: { cancelled: true },
  });
}

export type RevenueTotals = {
  orders: number;
  revenueCents: number;
  /** Null when there is nothing to report, so the page can say so. */
  currency: string | null;
};

/** What PieceUp has earned the shop, cancellations excluded. */
export async function getRevenueTotals(
  shopDomain: string,
): Promise<RevenueTotals> {
  const where = { shopDomain, cancelled: false };

  const [totals, latest] = await Promise.all([
    db.attributedOrder.aggregate({
      where,
      _sum: { totalCents: true },
      _count: { _all: true },
    }),
    // A shop trades in one currency, so the most recent order's is the shop's.
    // Read rather than assumed, so a shop that has changed currency reports the
    // one its numbers are actually in.
    db.attributedOrder.findFirst({
      where,
      orderBy: { orderedAt: "desc" },
      select: { currency: true },
    }),
  ]);

  return {
    orders: totals._count._all,
    revenueCents: totals._sum.totalCents ?? 0,
    currency: latest?.currency ?? null,
  };
}

export type PuzzleRevenue = { orders: number; revenueCents: number };

/**
 * Revenue per puzzle, keyed by id, for comparing campaigns against each other.
 *
 * Orders whose puzzle is unknown are left out entirely rather than bucketed
 * under a placeholder: they belong in the shop total, but attributing them to
 * any particular campaign would be a guess.
 */
export async function getRevenueByPuzzle(
  shopDomain: string,
): Promise<Map<string, PuzzleRevenue>> {
  const rows = await db.attributedOrder.groupBy({
    by: ["puzzleId"],
    where: { shopDomain, cancelled: false, NOT: { puzzleId: null } },
    _sum: { totalCents: true },
    _count: { _all: true },
  });

  return new Map(
    rows.map((row) => [
      row.puzzleId as string,
      { orders: row._count._all, revenueCents: row._sum.totalCents ?? 0 },
    ]),
  );
}

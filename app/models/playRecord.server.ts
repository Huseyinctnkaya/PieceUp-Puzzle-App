import db from "../db.server";

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function hasAlreadyPlayed(
  shopDomain: string,
  identityKey: string,
  playLimitType: "ONCE_EVER" | "ONCE_PER_DAY",
): Promise<boolean> {
  if (playLimitType === "ONCE_PER_DAY") {
    const record = await db.playRecord.findUnique({
      where: {
        shopDomain_identityKey_playDate: {
          shopDomain,
          identityKey,
          playDate: todayDateString(),
        },
      },
    });
    return record !== null;
  }
  const record = await db.playRecord.findFirst({
    where: { shopDomain, identityKey },
  });
  return record !== null;
}

/**
 * Rewards handed out this calendar month, used to enforce the plan's monthly
 * allowance. Counts rows that actually carry a discount code, so a play that
 * failed before a code was issued doesn't burn the merchant's quota.
 */
export async function countRewardsThisMonth(
  shopDomain: string,
): Promise<number> {
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  return db.playRecord.count({
    where: {
      shopDomain,
      discountCode: { not: null },
      playedAt: { gte: monthStart },
    },
  });
}

export async function recordCompletion(
  shopDomain: string,
  identityKey: string,
  discountCode: string,
  prizeTitle: string,
): Promise<void> {
  await db.playRecord.create({
    data: {
      shopDomain,
      identityKey,
      playDate: todayDateString(),
      completed: true,
      discountCode,
      prizeTitle,
    },
  });
}

/** How many times each prize has been won, most won first. */
export async function getPrizeWins(shopDomain: string) {
  const rows = await db.playRecord.groupBy({
    by: ["prizeTitle"],
    where: { shopDomain, completed: true, NOT: { prizeTitle: null } },
    _count: { _all: true },
  });

  return rows
    .map((row) => ({
      title: row.prizeTitle as string,
      // A prize that awards nothing still leaves a record, so wins and codes
      // issued are not the same number.
      won: row._count._all,
    }))
    .sort((a, b) => b.won - a.won);
}

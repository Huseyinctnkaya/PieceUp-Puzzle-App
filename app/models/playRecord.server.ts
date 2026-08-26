import { randomUUID } from "node:crypto";
import db from "../db.server";

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export type PlayLimitType = "ONCE_EVER" | "ONCE_PER_DAY" | "UNLIMITED";

/**
 * What a play is counted against, which is what makes the limit enforceable.
 *
 * The unique index on (shop, identity, key) is the guarantee — the check below
 * can lose a race with itself, the index cannot. With no limit each play needs
 * a key nothing else will ever hold, or the database would refuse the second
 * one regardless of what the merchant asked for.
 */
export function limitKeyFor(playLimitType: PlayLimitType): string {
  if (playLimitType === "ONCE_PER_DAY") return todayDateString();
  if (playLimitType === "UNLIMITED") return `free:${randomUUID()}`;
  return "ever";
}

export async function hasAlreadyPlayed(
  shopDomain: string,
  identityKey: string,
  playLimitType: PlayLimitType,
): Promise<boolean> {
  if (playLimitType === "UNLIMITED") return false;

  if (playLimitType === "ONCE_PER_DAY") {
    const record = await db.playRecord.findUnique({
      where: {
        shopDomain_identityKey_limitKey: {
          shopDomain,
          identityKey,
          limitKey: todayDateString(),
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
 *
 * "Carries a code" means a non-null one. A "try again" prize issues nothing,
 * and storing the empty string for it — as this once did — made it pass the
 * `not: null` test below and quietly consume a slot the shop had paid for.
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

export type CompletedPlay = {
  shopDomain: string;
  identityKey: string;
  /** The campaign that was played, so its revenue can be traced back to it. */
  puzzleId: string;
  /**
   * The code the shopper won, or null when the prize was "try again".
   *
   * Null rather than an empty string on purpose: the monthly allowance counts
   * rows with a code, and an empty string counts as one.
   */
  discountCode: string | null;
  prizeTitle: string;
  playLimitType?: PlayLimitType;
};

/**
 * Takes the fields as one object rather than in a row.
 *
 * With six of them, four being strings, positional arguments were one
 * transposition away from filing a play under the wrong shop or prize — and
 * nothing about the types would have caught it.
 */
export async function recordCompletion(play: CompletedPlay): Promise<void> {
  await db.playRecord.create({
    data: {
      shopDomain: play.shopDomain,
      identityKey: play.identityKey,
      puzzleId: play.puzzleId,
      playDate: todayDateString(),
      limitKey: limitKeyFor(play.playLimitType ?? "ONCE_EVER"),
      completed: true,
      discountCode: play.discountCode,
      prizeTitle: play.prizeTitle,
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

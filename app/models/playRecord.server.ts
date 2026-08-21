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
  const record = await db.playRecord.findFirst({ where: { shopDomain, identityKey } });
  return record !== null;
}

export async function recordCompletion(
  shopDomain: string,
  identityKey: string,
  discountCode: string,
): Promise<void> {
  await db.playRecord.create({
    data: {
      shopDomain,
      identityKey,
      playDate: todayDateString(),
      completed: true,
      discountCode,
    },
  });
}

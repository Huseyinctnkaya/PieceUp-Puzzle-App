import db from "../db.server";

export type PuzzleConfigInput = {
  imageUrl: string;
  pieceCount: number;
  rewardType: "PERCENTAGE_DISCOUNT" | "FREE_PRODUCT_DISCOUNT";
  rewardValue: string;
  triggerMode: "BUTTON" | "AUTO" | "BOTH";
  triggerPage: "CART" | "PRODUCT" | "ALL";
  triggerDelaySeconds: number | null;
  playLimitType: "ONCE_EVER" | "ONCE_PER_DAY";
  isActive: boolean;
  startDate: Date | null;
  endDate: Date | null;
};

export async function getPuzzleConfig(shopDomain: string) {
  return db.puzzleConfig.findUnique({ where: { shopDomain } });
}

export async function upsertPuzzleConfig(shopDomain: string, input: PuzzleConfigInput) {
  return db.puzzleConfig.upsert({
    where: { shopDomain },
    create: { shopDomain, ...input },
    update: { ...input },
  });
}

export async function getActivePuzzleConfig(shopDomain: string) {
  const config = await db.puzzleConfig.findUnique({ where: { shopDomain } });
  if (!config || !config.isActive) return null;
  const now = new Date();
  if (config.startDate && now < config.startDate) return null;
  if (config.endDate && now > config.endDate) return null;
  return config;
}

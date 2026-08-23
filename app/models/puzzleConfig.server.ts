import db from "../db.server";

export type PuzzleConfigInput = {
  name: string;
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

export class AlreadyActiveError extends Error {
  constructor(public readonly activeName: string) {
    super(`already_active:${activeName}`);
  }
}

export class PuzzleIsActiveError extends Error {
  constructor() {
    super("cannot_delete_active_puzzle");
  }
}

async function assertCanActivate(shopDomain: string, excludeId?: string) {
  const other = await db.puzzleConfig.findFirst({
    where: {
      shopDomain,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (other) {
    throw new AlreadyActiveError(other.name);
  }
}

export async function listPuzzleConfigs(shopDomain: string) {
  return db.puzzleConfig.findMany({
    where: { shopDomain },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPuzzleConfigById(shopDomain: string, id: string) {
  return db.puzzleConfig.findFirst({ where: { id, shopDomain } });
}

export async function createPuzzleConfig(shopDomain: string, input: PuzzleConfigInput) {
  if (input.isActive) {
    await assertCanActivate(shopDomain);
  }
  return db.puzzleConfig.create({ data: { shopDomain, ...input } });
}

export async function updatePuzzleConfig(
  shopDomain: string,
  id: string,
  input: PuzzleConfigInput,
) {
  if (input.isActive) {
    await assertCanActivate(shopDomain, id);
  }
  return db.puzzleConfig.update({ where: { id }, data: { ...input } });
}

export async function deletePuzzleConfig(shopDomain: string, id: string) {
  const config = await getPuzzleConfigById(shopDomain, id);
  if (config?.isActive) {
    throw new PuzzleIsActiveError();
  }
  await db.puzzleConfig.delete({ where: { id } });
}

export async function getActivePuzzleConfig(shopDomain: string) {
  const config = await db.puzzleConfig.findFirst({ where: { shopDomain, isActive: true } });
  if (!config) return null;
  const now = new Date();
  if (config.startDate && now < config.startDate) return null;
  if (config.endDate && now > config.endDate) return null;
  return config;
}

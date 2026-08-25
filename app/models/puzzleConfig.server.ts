import db from "../db.server";

export type PuzzleConfigInput = {
  name: string;
  // Optional: the popup renders fine with none of them, and leaving a key out
  // of an update means "don't touch it" rather than "clear it".
  badgeLabel?: string | null;
  headline?: string | null;
  description?: string | null;
  imageUrl: string;
  pieceCount: number;
  knobSize?: number;
  difficulty?: "easy" | "medium" | "hard";
  trayPosition?: "right" | "left" | "bottom";
  accentColor?: string;
  timeLimitSeconds?: number | null;
  shuffleLimit?: number;
  giftStep?: boolean;
  giftBoxMode?: boolean;
  // Optional because the puzzle form no longer edits them — discounts and
  // triggering get their own section. Leaving a key out of an update means
  // "don't touch it", so an existing puzzle keeps what it was given.
  rewardType?: "PERCENTAGE_DISCOUNT" | "FREE_PRODUCT_DISCOUNT";
  rewardValue?: string;
  triggerMode?: "BUTTON" | "AUTO" | "BOTH";
  triggerPage?: "CART" | "PRODUCT" | "ALL";
  triggerDelaySeconds?: number | null;
  playLimitType?: "ONCE_EVER" | "ONCE_PER_DAY";
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

export class NotFoundError extends Error {
  constructor() {
    super("not_found");
  }
}

export class PuzzleLimitReachedError extends Error {
  constructor(public readonly limit: number) {
    super(`puzzle_limit_reached:${limit}`);
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

export async function createPuzzleConfig(
  shopDomain: string,
  input: PuzzleConfigInput,
  // null means the caller's plan doesn't cap puzzle count. Passed in rather
  // than looked up here so this module stays free of billing concerns.
  puzzleLimit: number | null = null,
) {
  if (puzzleLimit !== null) {
    const existing = await db.puzzleConfig.count({ where: { shopDomain } });
    if (existing >= puzzleLimit) {
      throw new PuzzleLimitReachedError(puzzleLimit);
    }
  }
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
  // Scoped lookup first: confirms `id` actually belongs to `shopDomain`
  // before any write, so a caller can never mutate another shop's row by
  // guessing/reusing an id — the update below is only reachable once
  // ownership is confirmed.
  const existing = await db.puzzleConfig.findFirst({
    where: { id, shopDomain },
  });
  if (!existing) {
    throw new NotFoundError();
  }
  if (input.isActive) {
    await assertCanActivate(shopDomain, id);
  }
  return db.puzzleConfig.update({ where: { id }, data: { ...input } });
}

export async function deletePuzzleConfig(shopDomain: string, id: string) {
  const config = await getPuzzleConfigById(shopDomain, id);
  if (!config) {
    throw new NotFoundError();
  }
  if (config.isActive) {
    throw new PuzzleIsActiveError();
  }
  await db.puzzleConfig.delete({ where: { id } });
}

export async function getActivePuzzleConfig(shopDomain: string) {
  const config = await db.puzzleConfig.findFirst({
    where: { shopDomain, isActive: true },
  });
  if (!config) return null;
  const now = new Date();
  if (config.startDate && now < config.startDate) return null;
  if (config.endDate && now > config.endDate) return null;
  return config;
}

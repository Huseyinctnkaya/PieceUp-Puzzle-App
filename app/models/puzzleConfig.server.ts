import db from "../db.server";

export type PuzzleGiftInput = {
  title: string;
  description: string | null;
  badgeLabel: string | null;
  imageUrl: string | null;
  // Required rather than optional: a gift is a prize, and a prize with no
  // discount behind it silently falls back to the column default — which is
  // how three gifts once saved as "10% off" whatever the merchant chose.
  discountType: string;
  discountValue: string;
  /** Shopify gids, as JSON. */
  productIds: string;
  collectionIds: string;
};

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
  /**
   * The gifts a shopper picks between. Optional so a caller that isn't editing
   * them leaves them alone; passing an array replaces the lot, which is how the
   * form submits a list that may have had rows added, removed and reordered.
   */
  gifts?: PuzzleGiftInput[];
  // Optional because the puzzle form no longer edits them. Leaving a key out
  // of an update means "don't touch it", so an existing puzzle keeps what it
  // was given. The reward pair is gone entirely: prizes are gifts now, each
  // with its own discount.
  triggerMode?: "BUTTON" | "AUTO" | "BOTH";
  triggerPage?: "CART" | "PRODUCT" | "ALL";
  triggerDelaySeconds?: number | null;
  playLimitType?: "ONCE_EVER" | "ONCE_PER_DAY" | "UNLIMITED";
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
    include: withGifts,
  });
}

/** Gifts always travel with their puzzle: nothing reads one without the other. */
const withGifts = {
  gifts: { orderBy: { position: "asc" } },
} as const;

export async function getPuzzleConfigById(shopDomain: string, id: string) {
  return db.puzzleConfig.findFirst({
    where: { id, shopDomain },
    include: withGifts,
  });
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
  const { gifts, ...fields } = input;
  return db.puzzleConfig.create({
    data: {
      shopDomain,
      ...fields,
      ...(gifts ? { gifts: { create: gifts.map(withPosition) } } : {}),
    },
  });
}

/** Positions come from array order — the merchant's arrangement is the list. */
function withPosition(gift: PuzzleGiftInput, index: number) {
  return { ...gift, position: index };
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
  const { gifts, ...fields } = input;
  if (!gifts) {
    return db.puzzleConfig.update({ where: { id }, data: fields });
  }

  // Replaced wholesale rather than diffed: the form submits the list as it
  // stands, and matching rows up would mean tracking ids through a UI where a
  // gift's identity is only ever its place in the list. Done in a transaction so
  // a failure can't leave a puzzle with its gifts deleted and none written.
  return db.$transaction(async (tx) => {
    await tx.puzzleGift.deleteMany({ where: { puzzleConfigId: id } });
    return tx.puzzleConfig.update({
      where: { id },
      data: { ...fields, gifts: { create: gifts.map(withPosition) } },
    });
  });
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
    include: withGifts,
  });
  if (!config) return null;
  const now = new Date();
  if (config.startDate && now < config.startDate) return null;
  if (config.endDate && now > config.endDate) return null;
  return config;
}

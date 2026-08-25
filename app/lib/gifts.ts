import type { PuzzleGiftInput } from "../models/puzzleConfig.server";

/** Keeps only the gids from a submitted list. */
function idList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

export function parseGifts(raw: FormDataEntryValue | null): PuzzleGiftInput[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (gift) => gift && typeof gift.title === "string" && gift.title.trim(),
      )
      .map((gift) => ({
        title: String(gift.title).trim(),
        description: String(gift.description ?? "").trim() || null,
        badgeLabel: String(gift.badgeLabel ?? "").trim() || null,
        imageUrl: String(gift.imageUrl ?? "").trim() || null,
        discountType: String(gift.discountType ?? "PERCENTAGE_OFF_ORDER"),
        discountValue: String(gift.discountValue ?? "10"),
        // Re-serialised rather than passed through, so a malformed field
        // cannot reach the column that the reward service parses back.
        productIds: JSON.stringify(idList(gift.productIds)),
        collectionIds: JSON.stringify(idList(gift.collectionIds)),
      }));
  } catch {
    return [];
  }
}

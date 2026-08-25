import type { PuzzleGiftInput } from "../models/puzzleConfig.server";

/**
 * A gift as the edit form holds it: every field a string or a list, because
 * that is what the inputs bind to. The stored shape differs — ids are JSON
 * there — so the two conversions below are the only places that bridge them.
 *
 * They are here together on purpose. Written out by hand at each call site,
 * the discount fields were dropped twice: once saving, so every prize became
 * "10% off", and once loading, so choosing a type and coming back showed the
 * default again.
 */
export type GiftDraft = {
  title: string;
  description: string;
  badgeLabel: string;
  imageUrl: string;
  discountType: string;
  discountValue: string;
  productIds: string[];
  collectionIds: string[];
};

/** What a prize starts as before the merchant has said anything about it. */
export const EMPTY_GIFT: GiftDraft = {
  title: "",
  description: "",
  badgeLabel: "",
  imageUrl: "",
  discountType: "PERCENTAGE_OFF_ORDER",
  discountValue: "10",
  productIds: [],
  collectionIds: [],
};

/** Keeps only the gids from a list, whatever else it arrived holding. */
function idList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

/** Parses a stored gid list, treating anything malformed as empty. */
function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return idList(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** A stored gift, as the loader hands it over. */
export type StoredGift = {
  title: string;
  description: string | null;
  badgeLabel: string | null;
  imageUrl: string | null;
  discountType: string;
  discountValue: string;
  productIds: string;
  collectionIds: string;
};

/** Turns stored gifts into the drafts the form edits. */
export function toDrafts(gifts: StoredGift[]): GiftDraft[] {
  return gifts.map((gift) => ({
    title: gift.title,
    description: gift.description ?? "",
    badgeLabel: gift.badgeLabel ?? "",
    imageUrl: gift.imageUrl ?? "",
    discountType: gift.discountType,
    discountValue: gift.discountValue,
    productIds: parseIds(gift.productIds),
    collectionIds: parseIds(gift.collectionIds),
  }));
}

/**
 * Reads the gift list the form submitted.
 *
 * Anything unparseable becomes an empty list rather than throwing: a malformed
 * field should not cost the merchant the rest of their edits, and the list is
 * replaced wholesale on save anyway.
 */
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
        discountType: String(
          gift.discountType ?? EMPTY_GIFT.discountType,
        ),
        discountValue: String(gift.discountValue ?? EMPTY_GIFT.discountValue),
        // Re-serialised rather than passed through, so a malformed field
        // cannot reach the column the reward service parses back.
        productIds: JSON.stringify(idList(gift.productIds)),
        collectionIds: JSON.stringify(idList(gift.collectionIds)),
      }));
  } catch {
    return [];
  }
}

import { describe, it, expect, beforeEach } from "vitest";
import db from "../db.server";
import {
  createPuzzleConfig,
  updatePuzzleConfig,
  getPuzzleConfigById,
} from "./puzzleConfig.server";

const SHOP = "gift-test.myshopify.com";

const base = {
  name: "Puzzle",
  badgeLabel: null,
  headline: null,
  description: null,
  imageUrl: "https://example.com/i.png",
  pieceCount: 9,
  isActive: false,
  startDate: null,
  endDate: null,
};

beforeEach(async () => {
  await db.puzzleConfig.deleteMany({ where: { shopDomain: SHOP } });
});

describe("puzzle gifts", () => {
  it("stores the gifts a puzzle is created with, in order", async () => {
    const created = await createPuzzleConfig(SHOP, {
      ...base,
      gifts: [
        { title: "Free shipping", description: null, badgeLabel: null, imageUrl: null },
        { title: "10% off", description: "Next order", badgeLabel: "Popular", imageUrl: null },
      ],
    });

    const loaded = await getPuzzleConfigById(SHOP, created.id);
    expect(loaded?.gifts.map((gift) => gift.title)).toEqual([
      "Free shipping",
      "10% off",
    ]);
    expect(loaded?.gifts[1].badgeLabel).toBe("Popular");
  });

  it("replaces the list on update rather than appending to it", async () => {
    const created = await createPuzzleConfig(SHOP, {
      ...base,
      gifts: [
        { title: "One", description: null, badgeLabel: null, imageUrl: null },
        { title: "Two", description: null, badgeLabel: null, imageUrl: null },
      ],
    });

    await updatePuzzleConfig(SHOP, created.id, {
      ...base,
      gifts: [{ title: "Only", description: null, badgeLabel: null, imageUrl: null }],
    });

    const loaded = await getPuzzleConfigById(SHOP, created.id);
    // Editing a list is how a merchant removes a gift; appending would make
    // removal impossible and duplicate everything they kept.
    expect(loaded?.gifts.map((gift) => gift.title)).toEqual(["Only"]);
  });

  it("leaves the gifts alone when an update doesn't mention them", async () => {
    const created = await createPuzzleConfig(SHOP, {
      ...base,
      gifts: [{ title: "Kept", description: null, badgeLabel: null, imageUrl: null }],
    });

    await updatePuzzleConfig(SHOP, created.id, { ...base, name: "Renamed" });

    const loaded = await getPuzzleConfigById(SHOP, created.id);
    expect(loaded?.name).toBe("Renamed");
    expect(loaded?.gifts.map((gift) => gift.title)).toEqual(["Kept"]);
  });

  it("deletes a puzzle's gifts along with it", async () => {
    const created = await createPuzzleConfig(SHOP, {
      ...base,
      gifts: [{ title: "Gone", description: null, badgeLabel: null, imageUrl: null }],
    });

    await db.puzzleConfig.delete({ where: { id: created.id } });

    // Orphaned rows would accumulate for every puzzle a merchant ever removed.
    const orphans = await db.puzzleGift.count({
      where: { puzzleConfigId: created.id },
    });
    expect(orphans).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { parseGifts } from "./gifts";

/** The form submits its gift list as one JSON string. */
function submitted(gifts: unknown[]) {
  return JSON.stringify(gifts);
}

describe("parseGifts", () => {
  it("keeps the discount a merchant chose", () => {
    const [gift] = parseGifts(
      submitted([
        {
          title: "Kargo Bedava",
          discountType: "FREE_SHIPPING",
          discountValue: "",
          productIds: [],
          collectionIds: [],
        },
      ]),
    );

    // Dropping these let every prize fall back to the column default, so three
    // gifts saved as "10% off the order" whatever the merchant picked.
    expect(gift.discountType).toBe("FREE_SHIPPING");
  });

  it("keeps the products a discount was limited to", () => {
    const [gift] = parseGifts(
      submitted([
        {
          title: "Half off",
          discountType: "PERCENTAGE_OFF_PRODUCTS",
          discountValue: "50",
          productIds: ["gid://shopify/Product/1"],
          collectionIds: ["gid://shopify/Collection/2"],
        },
      ]),
    );

    // Stored as JSON, since that is what the reward service reads back.
    expect(JSON.parse(gift.productIds)).toEqual(["gid://shopify/Product/1"]);
    expect(JSON.parse(gift.collectionIds)).toEqual([
      "gid://shopify/Collection/2",
    ]);
  });

  it("falls back to a percentage off the order when nothing was chosen", () => {
    const [gift] = parseGifts(submitted([{ title: "Prize" }]));
    expect(gift.discountType).toBe("PERCENTAGE_OFF_ORDER");
    expect(gift.discountValue).toBe("10");
  });

  it("drops anything that isn't a gid from the selection", () => {
    const [gift] = parseGifts(
      submitted([
        {
          title: "Prize",
          productIds: ["gid://shopify/Product/1", 42, null, { id: "x" }],
        },
      ]),
    );
    expect(JSON.parse(gift.productIds)).toEqual(["gid://shopify/Product/1"]);
  });

  it("skips a gift with no name", () => {
    // A nameless prize is a blank card to the shopper.
    expect(parseGifts(submitted([{ title: "   " }, { title: "Real" }]))).toHaveLength(1);
  });

  it("treats a malformed field as an empty list", () => {
    // Better than throwing: a bad field should not cost the merchant the rest
    // of their edits, and the list is replaced wholesale on save anyway.
    expect(parseGifts("not json")).toEqual([]);
    expect(parseGifts(null)).toEqual([]);
    expect(parseGifts(submitted([]))).toEqual([]);
  });
});

import { describe, it, expect, vi } from "vitest";
import { issueRewardCode } from "./rewardService.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/** An admin that records what it was asked to send and reports success. */
function fakeAdmin(field = "discountCodeBasicCreate") {
  const graphql = vi.fn().mockResolvedValue({
    json: async () => ({
      data: { [field]: { codeDiscountNode: { id: "gid://1" }, userErrors: [] } },
    }),
  });
  return { admin: { graphql } as unknown as AdminApiContext, graphql };
}

/** The variables the mutation was called with. */
function sentInput(graphql: ReturnType<typeof vi.fn>) {
  const variables = graphql.mock.calls[0][1].variables;
  return variables.basicCodeDiscount ?? variables.freeShippingCodeDiscount;
}

describe("issueRewardCode", () => {
  it("mints a percentage off the whole order", async () => {
    const { admin, graphql } = fakeAdmin();
    const code = await issueRewardCode(admin, {
      discountType: "PERCENTAGE_OFF_ORDER",
      discountValue: "20",
    });

    const input = sentInput(graphql);
    // Shopify takes a fraction, not a percentage: 0.2 is 20% and 20 would be
    // 2000% off, which the API accepts.
    expect(input.customerGets.value.percentage).toBe(0.2);
    expect(input.customerGets.items).toEqual({ all: true });
    expect(input.code).toBe(code);
  });

  it("mints a fixed amount off the whole order", async () => {
    const { admin, graphql } = fakeAdmin();
    await issueRewardCode(admin, {
      discountType: "AMOUNT_OFF_ORDER",
      discountValue: "15",
    });

    const input = sentInput(graphql);
    expect(input.customerGets.value.discountAmount).toEqual({
      amount: "15",
      appliesOnEachItem: false,
    });
  });

  it("limits a discount to the products the merchant picked", async () => {
    const { admin, graphql } = fakeAdmin();
    await issueRewardCode(admin, {
      discountType: "PERCENTAGE_OFF_PRODUCTS",
      discountValue: "50",
      productIds: ["gid://shopify/Product/1"],
      collectionIds: ["gid://shopify/Collection/2"],
    });

    const input = sentInput(graphql);
    expect(input.customerGets.items).toEqual({
      products: { productsToAdd: ["gid://shopify/Product/1"] },
      collections: { add: ["gid://shopify/Collection/2"] },
    });
  });

  it("falls back to the whole order when nothing was picked", async () => {
    const { admin, graphql } = fakeAdmin();
    await issueRewardCode(admin, {
      discountType: "PERCENTAGE_OFF_PRODUCTS",
      discountValue: "50",
      productIds: [],
      collectionIds: [],
    });

    // A products discount with no products would be a code that discounts
    // nothing, which reads to a shopper as a broken prize.
    expect(sentInput(graphql).customerGets.items).toEqual({ all: true });
  });

  it("uses the free shipping mutation for free shipping", async () => {
    const { admin, graphql } = fakeAdmin("discountCodeFreeShippingCreate");
    await issueRewardCode(admin, {
      discountType: "FREE_SHIPPING",
      discountValue: "",
    });

    expect(graphql.mock.calls[0][0]).toContain("discountCodeFreeShippingCreate");
    expect(sentInput(graphql).destination).toEqual({ all: true });
  });

  it("mints nothing at all for a try-again prize", async () => {
    const { admin, graphql } = fakeAdmin();
    const code = await issueRewardCode(admin, {
      discountType: "NONE",
      discountValue: "",
    });

    // Not a failure: the shopper landed on "try again", and creating a code
    // worth nothing would clutter the merchant's discount list.
    expect(code).toBeNull();
    expect(graphql).not.toHaveBeenCalled();
  });

  it("limits a code to one use, once per customer", async () => {
    const { admin, graphql } = fakeAdmin();
    await issueRewardCode(admin, {
      discountType: "PERCENTAGE_OFF_ORDER",
      discountValue: "10",
    });

    const input = sentInput(graphql);
    // A puzzle is won once; a shareable code would be won once and spent by
    // everyone the winner sends it to.
    expect(input.usageLimit).toBe(1);
    expect(input.appliesOncePerCustomer).toBe(true);
  });

  it("throws when Shopify reports an error", async () => {
    const graphql = vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          discountCodeBasicCreate: {
            codeDiscountNode: null,
            userErrors: [{ message: "Code already exists" }],
          },
        },
      }),
    });

    await expect(
      issueRewardCode({ graphql } as unknown as AdminApiContext, {
        discountType: "PERCENTAGE_OFF_ORDER",
        discountValue: "10",
      }),
    ).rejects.toThrow("Code already exists");
  });
});

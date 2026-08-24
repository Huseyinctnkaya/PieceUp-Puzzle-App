import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { issueRewardCode } from "./rewardService.server";

function jsonResponse(data: unknown) {
  return { json: async () => ({ data }) } as Response;
}

describe("issueRewardCode", () => {
  it("returns a PIECEUP-prefixed code on success", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue(
        jsonResponse({
          discountCodeBasicCreate: {
            codeDiscountNode: { id: "gid://1" },
            userErrors: [],
          },
        }),
      ),
    };
    const code = await issueRewardCode(admin as unknown as AdminApiContext, {
      rewardType: "PERCENTAGE_DISCOUNT",
      rewardValue: "10",
    });
    expect(code).toMatch(/^PIECEUP-[A-Z0-9]{12}$/);
  });

  it("throws when the mutation reports user errors", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue(
        jsonResponse({
          discountCodeBasicCreate: {
            codeDiscountNode: null,
            userErrors: [{ field: "code", message: "already taken" }],
          },
        }),
      ),
    };
    await expect(
      issueRewardCode(admin as unknown as AdminApiContext, {
        rewardType: "PERCENTAGE_DISCOUNT",
        rewardValue: "10",
      }),
    ).rejects.toThrow("Discount code creation failed");
  });

  it("throws when codeDiscountNode is absent (top-level GraphQL error)", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue(
        jsonResponse({
          discountCodeBasicCreate: {
            codeDiscountNode: null,
            userErrors: [],
          },
        }),
      ),
    };
    await expect(
      issueRewardCode(admin as unknown as AdminApiContext, {
        rewardType: "PERCENTAGE_DISCOUNT",
        rewardValue: "10",
      }),
    ).rejects.toThrow("Discount code creation failed");
  });
});

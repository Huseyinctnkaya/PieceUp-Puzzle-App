import { describe, it, expect, vi } from "vitest";
import { issueRewardCode } from "./rewardService.server";

function jsonResponse(data: unknown) {
  return { json: async () => ({ data }) } as Response;
}

describe("issueRewardCode", () => {
  it("returns a PIECEUP-prefixed code on success", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValue(
        jsonResponse({
          discountCodeBasicCreate: { codeDiscountNode: { id: "gid://1" }, userErrors: [] },
        }),
      ),
    };
    const code = await issueRewardCode(admin as any, {
      rewardType: "PERCENTAGE_DISCOUNT",
      rewardValue: "10",
    });
    expect(code).toMatch(/^PIECEUP-[A-Z0-9]{6}$/);
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
      issueRewardCode(admin as any, { rewardType: "PERCENTAGE_DISCOUNT", rewardValue: "10" }),
    ).rejects.toThrow("Discount code creation failed");
  });
});

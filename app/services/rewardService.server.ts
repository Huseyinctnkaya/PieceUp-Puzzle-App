import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { randomInt } from "node:crypto";

const DISCOUNT_CODE_CREATE = `#graphql
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

export type RewardConfig = {
  rewardType: "PERCENTAGE_DISCOUNT" | "FREE_PRODUCT_DISCOUNT";
  rewardValue: string;
};

function randomCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[randomInt(chars.length)];
  }
  return `${prefix}-${suffix}`;
}

export async function issueRewardCode(admin: AdminApiContext, reward: RewardConfig): Promise<string> {
  const code = randomCode("PIECEUP");
  const now = new Date();
  const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const customerGets =
    reward.rewardType === "PERCENTAGE_DISCOUNT"
      ? { value: { percentage: Number(reward.rewardValue) / 100 }, items: { all: true } }
      : {
          value: { percentage: 1.0 },
          items: { products: { productsToAdd: [reward.rewardValue] } },
        };

  const response = await admin.graphql(DISCOUNT_CODE_CREATE, {
    variables: {
      basicCodeDiscount: {
        title: code,
        code,
        startsAt: now.toISOString(),
        endsAt: endsAt.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { all: true },
        customerGets,
      },
    },
  });

  const json = await response.json();
  const userErrors = json.data?.discountCodeBasicCreate?.userErrors ?? [];
  if (!json.data?.discountCodeBasicCreate?.codeDiscountNode || userErrors.length > 0) {
    throw new Error(`Discount code creation failed: ${userErrors.map((e: any) => e.message).join(", ")}`);
  }
  return code;
}

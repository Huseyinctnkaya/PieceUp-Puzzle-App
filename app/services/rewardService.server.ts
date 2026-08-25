import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { randomInt } from "node:crypto";

/** The shape Shopify returns for GraphQL userErrors. */
type UserError = { field?: string[] | null; message: string };

const DISCOUNT_CODE_CREATE = `#graphql
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

const FREE_SHIPPING_CREATE = `#graphql
  mutation discountCodeFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
    discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message }
    }
  }
`;

/**
 * What a shopper can win.
 *
 * NONE is a real option, not an absence: a "try again" prize that shows on the
 * board like any other and mints no code.
 */
export type DiscountType =
  | "PERCENTAGE_OFF_ORDER"
  | "AMOUNT_OFF_ORDER"
  | "PERCENTAGE_OFF_PRODUCTS"
  | "AMOUNT_OFF_PRODUCTS"
  | "FREE_SHIPPING"
  | "NONE";

export type RewardConfig = {
  discountType: DiscountType;
  /** A percentage (1-100) or a money amount, by type. */
  discountValue: string;
  /** Shopify product gids the discount is limited to. */
  productIds?: string[];
  /** Shopify collection gids the discount is limited to. */
  collectionIds?: string[];
};

/** How long a won code stays usable. */
const VALID_FOR_DAYS = 7;

function randomCode(prefix: string): string {
  // No I, O, 0 or 1: the code gets read off a screen and typed at checkout.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[randomInt(chars.length)];
  }
  return `${prefix}-${suffix}`;
}

/** Which items the discount applies to, from the merchant's selection. */
function itemsFor(reward: RewardConfig) {
  const products = reward.productIds ?? [];
  const collections = reward.collectionIds ?? [];
  if (products.length === 0 && collections.length === 0) {
    return { all: true };
  }
  return {
    ...(products.length ? { products: { productsToAdd: products } } : {}),
    ...(collections.length ? { collections: { add: collections } } : {}),
  };
}

function customerGetsFor(reward: RewardConfig) {
  const percentage = Number(reward.discountValue) / 100;
  const amount = { amount: reward.discountValue, appliesOnEachItem: false };

  switch (reward.discountType) {
    case "AMOUNT_OFF_ORDER":
      return { value: { discountAmount: amount }, items: { all: true } };
    case "PERCENTAGE_OFF_PRODUCTS":
      return { value: { percentage }, items: itemsFor(reward) };
    case "AMOUNT_OFF_PRODUCTS":
      return { value: { discountAmount: amount }, items: itemsFor(reward) };
    default:
      // Percentage off the whole order.
      return { value: { percentage }, items: { all: true } };
  }
}

/** What either discount mutation returns, as far as this file cares. */
type DiscountResponse = {
  data?: Record<
    string,
    { codeDiscountNode?: { id: string } | null; userErrors?: UserError[] }
  >;
};

function assertNoErrors(
  json: DiscountResponse,
  field: "discountCodeBasicCreate" | "discountCodeFreeShippingCreate",
) {
  const result = json.data?.[field];
  const userErrors = result?.userErrors ?? [];
  if (!result?.codeDiscountNode || userErrors.length > 0) {
    throw new Error(
      `Discount code creation failed: ${userErrors
        .map((error) => error.message)
        .join(", ")}`,
    );
  }
}

/**
 * Creates the discount a shopper won, and returns the code to show them.
 *
 * Every code is a real Shopify discount: it shows up under Discounts in the
 * admin, reports like any other, and the merchant can edit or delete it.
 * Single-use and once per customer, because a puzzle is won once.
 *
 * Returns null for a NONE prize, which is not a failure — it is the shopper
 * having landed on "try again".
 */
export async function issueRewardCode(
  admin: AdminApiContext,
  reward: RewardConfig,
): Promise<string | null> {
  if (reward.discountType === "NONE") return null;

  const code = randomCode("PIECEUP");
  const now = new Date();
  const endsAt = new Date(
    now.getTime() + VALID_FOR_DAYS * 24 * 60 * 60 * 1000,
  );

  const common = {
    title: code,
    code,
    startsAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection: { all: true },
  };

  if (reward.discountType === "FREE_SHIPPING") {
    const response = await admin.graphql(FREE_SHIPPING_CREATE, {
      variables: {
        freeShippingCodeDiscount: { ...common, destination: { all: true } },
      },
    });
    assertNoErrors(await response.json(), "discountCodeFreeShippingCreate");
    return code;
  }

  const response = await admin.graphql(DISCOUNT_CODE_CREATE, {
    variables: {
      basicCodeDiscount: { ...common, customerGets: customerGetsFor(reward) },
    },
  });
  assertNoErrors(await response.json(), "discountCodeBasicCreate");
  return code;
}

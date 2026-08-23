import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { FREE_PLAN, planFromShopifyName, type Plan } from "../lib/plans";

const ACTIVE_SUBSCRIPTION_QUERY = `#graphql
  query PieceUpActiveSubscription {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        trialDays
        currentPeriodEnd
      }
    }
  }
`;

export type Subscription = {
  plan: Plan;
  status: string | null;
  trialDays: number | null;
  currentPeriodEnd: string | null;
};

/**
 * Resolves the shop's current plan from its active Shopify subscription.
 *
 * Managed pricing means Shopify owns the subscription record, so this reads it
 * rather than tracking plan state ourselves — there's no local copy that can
 * drift out of sync with what the merchant is actually being charged.
 *
 * Any failure resolves to Free rather than throwing: a transient Admin API
 * error should degrade a merchant's limits, never take the whole admin down.
 */
export async function getSubscription(
  admin: AdminApiContext,
): Promise<Subscription> {
  try {
    const response = await admin.graphql(ACTIVE_SUBSCRIPTION_QUERY);
    const json = await response.json();
    const active =
      json.data?.currentAppInstallation?.activeSubscriptions?.find(
        (subscription: { status?: string }) =>
          subscription?.status === "ACTIVE",
      ) ?? null;

    if (!active) {
      return {
        plan: FREE_PLAN,
        status: null,
        trialDays: null,
        currentPeriodEnd: null,
      };
    }

    return {
      plan: planFromShopifyName(active.name),
      status: active.status ?? null,
      trialDays: active.trialDays ?? null,
      currentPeriodEnd: active.currentPeriodEnd ?? null,
    };
  } catch {
    return {
      plan: FREE_PLAN,
      status: null,
      trialDays: null,
      currentPeriodEnd: null,
    };
  }
}

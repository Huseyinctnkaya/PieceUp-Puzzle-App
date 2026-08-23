import { describe, it, expect, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getSubscription } from "./billing.server";

// getSubscription only ever calls admin.graphql, so a stub with just that
// method is enough — the cast keeps the tests from having to fake the rest of
// the Admin context surface.
type AdminStub = Pick<AdminApiContext, "graphql">;

function adminReturning(data: unknown): AdminApiContext {
  const stub: AdminStub = {
    graphql: vi.fn().mockResolvedValue({ json: async () => ({ data }) }),
  } as unknown as AdminStub;
  return stub as AdminApiContext;
}

describe("getSubscription", () => {
  it("reports Free when the shop has no active subscription", async () => {
    const subscription = await getSubscription(
      adminReturning({ currentAppInstallation: { activeSubscriptions: [] } }),
    );
    expect(subscription.plan.key).toBe("free");
    expect(subscription.id).toBeNull();
    // Free is the absence of a subscription on the Billing API, so its limits
    // must still apply rather than being treated as "unknown, allow anything".
    expect(subscription.plan.monthlyRewardLimit).toBe(100);
  });

  it("maps an active subscription back to its plan", async () => {
    const subscription = await getSubscription(
      adminReturning({
        currentAppInstallation: {
          activeSubscriptions: [
            {
              id: "gid://shopify/AppSubscription/1",
              name: "Pro",
              status: "ACTIVE",
              trialDays: 7,
              currentPeriodEnd: "2026-09-23T00:00:00Z",
            },
          ],
        },
      }),
    );
    expect(subscription.plan.key).toBe("pro");
    expect(subscription.id).toBe("gid://shopify/AppSubscription/1");
    expect(subscription.trialDays).toBe(7);
  });

  it("ignores subscriptions that aren't ACTIVE", async () => {
    const subscription = await getSubscription(
      adminReturning({
        currentAppInstallation: {
          activeSubscriptions: [
            { id: "gid://1", name: "Premium", status: "CANCELLED" },
          ],
        },
      }),
    );
    expect(subscription.plan.key).toBe("free");
  });

  it("falls back to Free for a plan name it doesn't recognise", async () => {
    // A rename on Shopify's side must never unlock more than the free tier.
    const subscription = await getSubscription(
      adminReturning({
        currentAppInstallation: {
          activeSubscriptions: [
            { id: "gid://1", name: "Enterprise Deluxe", status: "ACTIVE" },
          ],
        },
      }),
    );
    expect(subscription.plan.key).toBe("free");
  });

  it("falls back to Free when the Admin API call fails", async () => {
    const admin = {
      graphql: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as AdminApiContext;
    const subscription = await getSubscription(admin);
    expect(subscription.plan.key).toBe("free");
  });
});

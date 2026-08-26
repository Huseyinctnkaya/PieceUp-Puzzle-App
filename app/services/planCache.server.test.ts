import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getSubscription = vi.fn();
vi.mock("./billing.server", () => ({
  getSubscription: (...args: unknown[]) => getSubscription(...args),
}));

const { getCachedPlan, clearPlanCache, PLAN_CACHE_TTL_MS } = await import(
  "./planCache.server"
);

const SHOP = "shop-cache.myshopify.com";
const admin = {} as never;

const PRO = { key: "pro", title: "Pro", showsBranding: false };
const FREE = { key: "free", title: "Free", showsBranding: true };

beforeEach(() => {
  vi.clearAllMocks();
  clearPlanCache();
  vi.useFakeTimers();
  getSubscription.mockResolvedValue({ plan: PRO });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getCachedPlan", () => {
  it("asks Shopify the first time", async () => {
    expect(await getCachedPlan(SHOP, admin)).toBe(PRO);
    expect(getSubscription).toHaveBeenCalledTimes(1);
  });

  it("serves later requests from cache", async () => {
    // The storefront config endpoint runs on every page view a shopper loads.
    // An Admin API call there would add a round trip to each one and burn the
    // shop's rate limit for an answer that changes at most monthly.
    await getCachedPlan(SHOP, admin);
    await getCachedPlan(SHOP, admin);
    await getCachedPlan(SHOP, admin);

    expect(getSubscription).toHaveBeenCalledTimes(1);
  });

  it("asks again once the entry has expired", async () => {
    await getCachedPlan(SHOP, admin);
    vi.advanceTimersByTime(PLAN_CACHE_TTL_MS + 1);
    await getCachedPlan(SHOP, admin);

    expect(getSubscription).toHaveBeenCalledTimes(2);
  });

  it("picks up a plan change within the TTL", async () => {
    await getCachedPlan(SHOP, admin);
    getSubscription.mockResolvedValue({ plan: FREE });
    vi.advanceTimersByTime(PLAN_CACHE_TTL_MS + 1);

    expect(await getCachedPlan(SHOP, admin)).toBe(FREE);
  });

  it("keeps each shop's plan to itself", async () => {
    getSubscription.mockResolvedValueOnce({ plan: PRO });
    expect(await getCachedPlan(SHOP, admin)).toBe(PRO);

    getSubscription.mockResolvedValueOnce({ plan: FREE });
    expect(await getCachedPlan("other.myshopify.com", admin)).toBe(FREE);

    // And the first shop's entry was not overwritten by the second.
    expect(await getCachedPlan(SHOP, admin)).toBe(PRO);
  });

  it("falls back to a stale entry when the lookup fails", async () => {
    // A transient Admin API error must not make a paying merchant's storefront
    // suddenly wear our badge. The last known answer is far better than a
    // wrong one, and it is at most one TTL old.
    await getCachedPlan(SHOP, admin);
    vi.advanceTimersByTime(PLAN_CACHE_TTL_MS + 1);
    getSubscription.mockRejectedValueOnce(new Error("429 throttled"));

    expect(await getCachedPlan(SHOP, admin)).toBe(PRO);
  });

  it("returns null when it fails with nothing cached", async () => {
    // Null means "unknown", which callers must not read as "Free" — that is
    // the reading that would put a badge on a paying shop's storefront.
    getSubscription.mockRejectedValueOnce(new Error("down"));

    expect(await getCachedPlan(SHOP, admin)).toBeNull();
  });
});

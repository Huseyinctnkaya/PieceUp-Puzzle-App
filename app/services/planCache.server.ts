import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { getSubscription } from "./billing.server";
import type { Plan } from "../lib/plans";

/**
 * How long a shop's plan is trusted before it is looked up again.
 *
 * A plan changes at most monthly, and the only thing this cache feeds is
 * whether the storefront popup wears our badge. Five minutes bounds how long a
 * merchant who has just upgraded keeps seeing it — short enough that they
 * won't write in about it, long enough that a busy shop makes one Admin API
 * call instead of one per page view.
 */
export const PLAN_CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = { plan: Plan; expires: number };

// Per-process, which is the right scope for this: it is a cache, not state, so
// several instances each holding their own copy costs nothing but a few extra
// lookups. Bounded by the number of shops one process serves.
const cache = new Map<string, Entry>();

/** For tests. Production never needs to drop the cache by hand. */
export function clearPlanCache() {
  cache.clear();
}

/**
 * The shop's plan, cached.
 *
 * Exists because the storefront config endpoint needs the plan and runs on
 * every page view a shopper loads. Asking Shopify each time would put an
 * Admin API round trip in front of every visitor and spend the shop's rate
 * limit on an answer that barely ever changes.
 *
 * Returns null when the plan genuinely cannot be determined — a first lookup
 * that failed, with nothing cached to fall back on. Callers must treat that as
 * "unknown" rather than as Free: reading it as Free is what would put our
 * badge on a paying merchant's storefront over a transient API error.
 */
export async function getCachedPlan(
  shopDomain: string,
  admin: AdminApiContext,
): Promise<Plan | null> {
  const hit = cache.get(shopDomain);
  if (hit && Date.now() < hit.expires) return hit.plan;

  try {
    const { plan } = await getSubscription(admin);
    cache.set(shopDomain, { plan, expires: Date.now() + PLAN_CACHE_TTL_MS });
    return plan;
  } catch (error) {
    console.warn("[PieceUp] could not read the shop's plan:", error);
    // A stale answer beats a wrong one. `hit` here is expired but was true
    // within the last TTL, which is far closer to the truth than a guess.
    return hit?.plan ?? null;
  }
}

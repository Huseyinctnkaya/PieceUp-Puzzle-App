// The plan catalogue. These entries must mirror the plans configured in the
// Partner Dashboard, because Shopify's managed pricing owns the actual billing
// and only hands us back the plan's *name* on the subscription. `shopifyName`
// is the matching key: if it drifts from the dashboard, a paying merchant
// silently falls back to Free, so treat it as a contract, not a label.
export const PLAN_KEYS = ["free", "pro", "premium"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export type Plan = {
  key: PlanKey;
  shopifyName: string;
  title: string;
  /** Monthly price in USD. 0 means the plan costs nothing. */
  price: number;
  /** Rewards a shop may hand out per calendar month. null means unmetered. */
  monthlyRewardLimit: number | null;
  /** Puzzles a shop may keep. null means unmetered. */
  puzzleLimit: number | null;
  showsBranding: boolean;
  hasAnalytics: boolean;
  features: string[];
};

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free",
    shopifyName: "Free",
    title: "Free",
    price: 0,
    monthlyRewardLimit: 100,
    puzzleLimit: 1,
    showsBranding: true,
    hasAnalytics: false,
    features: [
      "Ayda 100 ödül",
      "1 puzzle",
      "Tüm ödül tipleri",
      "PieceUp markası görünür",
    ],
  },
  pro: {
    key: "pro",
    shopifyName: "Pro",
    title: "Pro",
    price: 14.99,
    monthlyRewardLimit: 1000,
    puzzleLimit: null,
    showsBranding: false,
    hasAnalytics: true,
    features: [
      "Ayda 1.000 ödül",
      "Sınırsız puzzle",
      "PieceUp markası kaldırılabilir",
      "İstatistikler",
    ],
  },
  premium: {
    key: "premium",
    shopifyName: "Premium",
    title: "Premium",
    price: 39.99,
    monthlyRewardLimit: null,
    puzzleLimit: null,
    showsBranding: false,
    hasAnalytics: true,
    features: [
      "Sınırsız ödül",
      "Sınırsız puzzle",
      "PieceUp markası kaldırılabilir",
      "İstatistikler",
      "Öncelikli destek",
    ],
  },
};

export const FREE_PLAN = PLANS.free;
export const TRIAL_DAYS = 7;

/**
 * Maps a Shopify subscription name back to a plan. Falls back to Free for an
 * unknown name so an unrecognised subscription can never unlock more than the
 * free tier.
 */
export function planFromShopifyName(name: string | null | undefined): Plan {
  if (!name) return FREE_PLAN;
  const normalised = name.trim().toLowerCase();
  return (
    Object.values(PLANS).find(
      (plan) => plan.shopifyName.toLowerCase() === normalised,
    ) ?? FREE_PLAN
  );
}

/** The Shopify-hosted plan selection page for managed pricing. */
export function pricingPlansUrl(shopDomain: string, appHandle = "pieceup") {
  const storeHandle = shopDomain.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

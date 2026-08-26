// The plan catalogue, and the single source of truth for pricing: the billing
// config in shopify.server.ts is built from these entries, so the charge a
// merchant approves is always the price shown on the plan page. `shopifyName`
// is the key Shopify stores on the subscription and that getSubscription maps
// back, so treat it as a contract rather than a label.
export const PLAN_KEYS = ["free", "pro", "premium"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/**
 * Names of the plans that carry a charge, kept as literal types so the billing
 * config's keys and `billing.request({ plan })` typecheck against each other —
 * a typo becomes a compile error rather than a failed charge at runtime.
 */
export const PAID_PLAN_NAMES = { pro: "Pro", premium: "Premium" } as const;
export type PaidPlanName =
  (typeof PAID_PLAN_NAMES)[keyof typeof PAID_PLAN_NAMES];

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
  /**
   * Whether the shop may run A/B tests.
   *
   * Premium only, and not merely to give the tier something to sell: a test
   * needs at least a hundred visitors per variant before it will name a
   * winner, and a shop with that traffic passes Pro's monthly reward
   * allowance anyway. The gate lands on the shops that can actually use it.
   */
  hasABTesting: boolean;
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
    hasABTesting: false,
    features: [
      "100 rewards a month",
      "1 puzzle",
      "Every reward type",
      "PieceUp badge on the popup",
    ],
  },
  pro: {
    key: "pro",
    shopifyName: PAID_PLAN_NAMES.pro,
    title: "Pro",
    price: 9.99,
    monthlyRewardLimit: 1000,
    puzzleLimit: null,
    showsBranding: false,
    hasAnalytics: true,
    hasABTesting: false,
    features: [
      "1,000 rewards a month",
      "Unlimited puzzles",
      "No PieceUp badge",
      "Analytics, with the revenue each puzzle earned",
    ],
  },
  premium: {
    key: "premium",
    shopifyName: PAID_PLAN_NAMES.premium,
    title: "Premium",
    price: 19.99,
    monthlyRewardLimit: null,
    puzzleLimit: null,
    showsBranding: false,
    hasAnalytics: true,
    hasABTesting: true,
    features: [
      "Unlimited rewards",
      "Unlimited puzzles",
      "No PieceUp badge",
      "Analytics, with the revenue each puzzle earned",
      "A/B testing — run two puzzles and keep the one that earns more",
      "Priority support",
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

/** The billing name for a paid plan, or null for Free (which has no charge). */
export function paidPlanName(key: PlanKey): PaidPlanName | null {
  return key === "pro" || key === "premium" ? PAID_PLAN_NAMES[key] : null;
}

import { REWARD_CODE_PREFIX } from "./rewardService.server";

/**
 * What an order tells us about a reward that was actually spent.
 *
 * Note what is absent. The `orders/create` payload is protected customer data
 * — it carries the shopper's email, name, phone and both addresses — and none
 * of it is any of PieceUp's business. This type is the boundary: it is the
 * only thing that leaves this module, so the fields it does not have are
 * fields nothing downstream can accidentally persist.
 */
export type OrderAttribution = {
  /** The order's gid, used as the idempotency key for repeated deliveries. */
  orderId: string;
  /** The PieceUp code the shopper redeemed, in its canonical upper case. */
  discountCode: string;
  /**
   * The order total in minor units of the shop's currency.
   *
   * Integers because these get summed: a float would drift, and money that
   * drifts in a revenue report is worse than no report. Always the amount
   * multiplied by 100, including for currencies that have no minor unit —
   * consistency across the sum matters more than matching each currency's
   * real subdivision, and every row in a shop shares one currency anyway.
   */
  totalCents: number;
  currency: string;
  orderedAt: Date;
};

/** Reads a `{ shop_money: { amount, currency_code } }` block, if it is one. */
function shopMoney(value: unknown): { amount: string; currency: string } | null {
  if (!value || typeof value !== "object") return null;
  const money = (value as { shop_money?: unknown }).shop_money;
  if (!money || typeof money !== "object") return null;
  const { amount, currency_code: currency } = money as {
    amount?: unknown;
    currency_code?: unknown;
  };
  if (typeof amount !== "string") return null;
  return { amount, currency: typeof currency === "string" ? currency : "" };
}

/**
 * Turns a decimal money string into whole minor units.
 *
 * Done on the string rather than through `parseFloat`, because 414.95 is not
 * representable in binary floating point: multiplying it by 100 yields
 * 41494.999…, and truncating that loses a cent on a large share of real
 * orders. Splitting on the decimal point cannot lose anything.
 */
function toCents(amount: string): number | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return null;
  const [, sign, whole, fraction = ""] = match;
  const minor = `${fraction}00`.slice(0, 2);
  const cents = Number(whole) * 100 + Number(minor);
  return sign === "-" ? -cents : cents;
}

/** The order's total and currency, preferring the value edits keep current. */
function totalOf(order: Record<string, unknown>) {
  const money =
    shopMoney(order.current_total_price_set) ??
    shopMoney(order.total_price_set) ??
    (typeof order.total_price === "string"
      ? { amount: order.total_price, currency: "" }
      : null);
  if (!money) return null;

  const totalCents = toCents(money.amount);
  if (totalCents === null) return null;

  const currency =
    money.currency || (typeof order.currency === "string" ? order.currency : "");
  return { totalCents, currency };
}

/** The PieceUp code among the order's discounts, or null if there wasn't one. */
function pieceUpCode(discountCodes: unknown): string | null {
  if (!Array.isArray(discountCodes)) return null;
  for (const entry of discountCodes) {
    const code = (entry as { code?: unknown })?.code;
    if (typeof code !== "string") continue;
    // Upper-cased before the prefix test and before it is returned: shoppers
    // type codes in any case, Shopify echoes back what they typed, and the
    // code we hold in PlayRecord is the canonical upper-case one.
    const canonical = code.toUpperCase();
    if (canonical.startsWith(REWARD_CODE_PREFIX)) return canonical;
  }
  return null;
}

/**
 * Reads what a webhook order says about a PieceUp reward, or null if it says
 * nothing — the overwhelmingly common case, since most orders use no code.
 *
 * Total rather than partial attribution: the whole order counts, not just the
 * discounted line. A shopper who came for the reward and filled a basket
 * earned the shop the basket, and crediting only the discounted item would
 * understate the campaign. The report says so in as many words.
 *
 * Never throws. A handler that throws makes Shopify retry the same
 * undeliverable payload for days, so anything unreadable is treated as an
 * order that simply isn't ours.
 */
export function extractAttribution(payload: unknown): OrderAttribution | null {
  if (!payload || typeof payload !== "object") return null;
  const order = payload as Record<string, unknown>;

  const discountCode = pieceUpCode(order.discount_codes);
  if (!discountCode) return null;

  const total = totalOf(order);
  if (!total) return null;

  // Only ever the gid, never the numeric `id` beside it. Shopify order ids are
  // around 8.2e17, far past Number.MAX_SAFE_INTEGER, so JSON.parse rounds the
  // low digits off the numeric field before this function ever sees it —
  // 820982911946154508 arrives as ...500. That rounded value can equal a
  // different real order's rounded id, and since this is the uniqueness key,
  // one order's revenue would overwrite another's. The gid is a string, which
  // JSON.parse leaves alone, so it is the only exact identifier available.
  const orderId =
    typeof order.admin_graphql_api_id === "string"
      ? order.admin_graphql_api_id
      : null;
  if (!orderId) return null;

  const createdAt =
    typeof order.created_at === "string" ? new Date(order.created_at) : null;

  return {
    orderId,
    discountCode,
    totalCents: total.totalCents,
    currency: total.currency,
    // An unparseable timestamp falls back to now: the order did happen, and
    // dropping the row over a bad date would lose real revenue.
    orderedAt:
      createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date(),
  };
}

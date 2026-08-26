import db from "../db.server";

/**
 * How the widget identifies a logged-in shopper.
 *
 * Mirrors `getIdentityKey` in the theme extension, which prefixes a Shopify
 * customer id this way to keep it distinct from the anonymous device ids used
 * for shoppers who aren't signed in. GDPR requests arrive with a customer id,
 * so this is the bridge between Shopify's idea of a person and ours.
 */
function identityKeyFor(customerId: string) {
  return `customer:${customerId}`;
}

/**
 * Everything the app holds that belongs to one customer.
 *
 * Which is very little, and deliberately so: a play, when it happened, what
 * was won. The app never receives a name, an email or an address, so there is
 * nothing else it could return.
 *
 * Anonymous plays cannot be included. A shopper who played without signing in
 * is known only by a random device id that Shopify has never seen, so there is
 * no way to tell that it was the same person — which is the point of it.
 */
export async function collectCustomerData(
  shopDomain: string,
  customerId: string,
) {
  return db.playRecord.findMany({
    where: { shopDomain, identityKey: identityKeyFor(customerId) },
    select: {
      playedAt: true,
      puzzleId: true,
      prizeTitle: true,
      discountCode: true,
    },
  });
}

/**
 * Erases a customer's plays.
 *
 * Their orders stay. An `AttributedOrder` row holds no personal data — an
 * order gid, a total, a currency, a code — and deleting the play removes the
 * only route from that row back to a person, which is what erasure asks for.
 * Wiping the revenue as well would rewrite the merchant's books because a
 * shopper exercised a right, and the sale did still happen.
 */
export async function redactCustomer(shopDomain: string, customerId: string) {
  await db.playRecord.deleteMany({
    where: { shopDomain, identityKey: identityKeyFor(customerId) },
  });
}

/**
 * Removes every record belonging to a shop.
 *
 * Called both when the app is uninstalled and when Shopify asks for the shop
 * to be redacted 48 hours later. Doing it at uninstall rather than waiting is
 * the stricter reading of "don't keep data longer than needed": once the app
 * is gone, none of it has a purpose.
 *
 * Runs in a transaction so a shop is never left half-erased, and deletes are
 * `deleteMany`, which treats "already gone" as success — both webhooks can be
 * delivered more than once, and the second delivery must not throw.
 */
export async function deleteAllShopData(shopDomain: string) {
  await db.$transaction(async (tx) => {
    // Gifts hang off a puzzle, not a shop. The schema cascades them, but they
    // are cleared explicitly first so this does not quietly depend on the
    // database having foreign keys enforced.
    await tx.puzzleGift.deleteMany({
      where: { puzzleConfig: { shopDomain } },
    });
    await tx.puzzleConfig.deleteMany({ where: { shopDomain } });
    await tx.attributedOrder.deleteMany({ where: { shopDomain } });
    await tx.playRecord.deleteMany({ where: { shopDomain } });
    await tx.puzzleStat.deleteMany({ where: { shopDomain } });
    await tx.shopSetup.deleteMany({ where: { shopDomain } });
    // Session uses `shop` rather than `shopDomain` for the same value.
    await tx.session.deleteMany({ where: { shop: shopDomain } });
  });
}

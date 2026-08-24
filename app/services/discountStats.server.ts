import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

const REDEMPTION_QUERY = `#graphql
  query PieceUpRedemptions($issued: String!, $redeemed: String!) {
    issued: discountNodesCount(query: $issued) { count precision }
    redeemed: discountNodesCount(query: $redeemed) { count precision }
  }
`;

export type RedemptionStats = {
  /** Codes Shopify still holds for this app. */
  issued: number;
  /** Of those, how many a shopper actually used at checkout. */
  redeemed: number;
  /**
   * False when the numbers are approximate or couldn't be read at all, so the
   * page can say so instead of presenting a guess as fact.
   */
  exact: boolean;
};

/**
 * Reads how many PieceUp codes have been redeemed, straight from Shopify.
 *
 * Counted on Shopify's side rather than ours because redemption happens at
 * checkout, which the app never sees — our own database only knows a code was
 * handed out, never whether it was used.
 *
 * Returns null rather than zeroes when the lookup fails: "we don't know" and
 * "nobody used a code" look identical in a chart, and only one of them is
 * honest to show.
 */
export async function getRedemptionStats(
  admin: AdminApiContext,
): Promise<RedemptionStats | null> {
  // Matches on the discount title, which issueRewardCode sets to the code
  // itself — so every PieceUp code is found by its shared prefix, and nothing
  // the merchant created by hand is.
  const issuedQuery = "title:PIECEUP-*";
  const redeemedQuery = "title:PIECEUP-* AND times_used:>0";

  try {
    const response = await admin.graphql(REDEMPTION_QUERY, {
      variables: { issued: issuedQuery, redeemed: redeemedQuery },
    });
    const json = await response.json();
    const issued = json.data?.issued;
    const redeemed = json.data?.redeemed;
    if (!issued || !redeemed) return null;

    return {
      issued: issued.count ?? 0,
      redeemed: redeemed.count ?? 0,
      exact: issued.precision === "EXACT" && redeemed.precision === "EXACT",
    };
  } catch {
    return null;
  }
}

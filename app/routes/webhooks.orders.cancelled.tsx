import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { extractAttribution } from "../services/orderAttribution.server";
import { markOrderCancelled } from "../models/attributedOrder.server";

/**
 * Stops a cancelled order counting towards the shop's PieceUp revenue.
 *
 * Without this the report only ever grows, and a merchant who cancels a large
 * order sees the app keep claiming credit for it. Reusing `extractAttribution`
 * rather than reading the id directly keeps two properties: the order gid is
 * still taken from the string field instead of the numeric one JSON.parse
 * rounds, and cancellations for orders that never used a code — the vast
 * majority — cost no database write.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const attribution = extractAttribution(payload);
  if (!attribution) return new Response();

  try {
    await markOrderCancelled(shop, attribution.orderId);
  } catch (error) {
    // As with orders/create: acknowledging a delivery we failed to act on
    // beats having the subscription disabled for repeated failures.
    console.error(
      "[PieceUp] could not mark order cancelled",
      shop,
      attribution.orderId,
      error,
    );
  }

  return new Response();
};

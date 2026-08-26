import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { extractAttribution } from "../services/orderAttribution.server";
import { recordAttributedOrder } from "../models/attributedOrder.server";

/**
 * Credits an order to the puzzle whose reward code paid for it.
 *
 * This is the only place PieceUp learns that a code was actually spent. The
 * app issues discounts but never sees a checkout, so without this the stats
 * page can only report codes handed out — a number that says nothing about
 * whether the campaign made the merchant any money.
 *
 * Every order in the shop arrives here and almost none of them are ours, so
 * the cheap check comes first: no PieceUp code, no database work.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const attribution = extractAttribution(payload);
  if (!attribution) return new Response();

  try {
    await recordAttributedOrder(shop, attribution);
  } catch (error) {
    // Deliberately still a 200. Shopify retries a failed delivery with
    // escalating backoff for two days and disables the subscription if it
    // keeps failing — which would cost the shop every future attribution to
    // recover one. The log is how a lost row gets noticed.
    console.error("[PieceUp] could not attribute order", shop, error);
  }

  return new Response();
};

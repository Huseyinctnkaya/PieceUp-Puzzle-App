import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../models/shopData.server";

/**
 * Clears out a shop that has removed the app.
 *
 * Everything, not just the session. Once the app is uninstalled none of the
 * shop's puzzles, plays, stats or attributed orders has any purpose, and
 * holding data with no purpose is exactly what a retention policy exists to
 * prevent. Shopify sends `shop/redact` 48 hours later as a backstop, but
 * waiting for it would mean keeping the data two days longer than it was
 * needed.
 *
 * Webhooks can be delivered more than once, and after the app is already gone.
 * `deleteAllShopData` treats "already deleted" as success for that reason.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    await deleteAllShopData(shop);
  } catch (error) {
    console.error("[PieceUp] could not clear uninstalled shop", shop, error);
  }

  return new Response();
};

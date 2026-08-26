import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deleteAllShopData } from "../models/shopData.server";

/**
 * Shopify asking, 48 hours after an uninstall, for the shop to be erased.
 *
 * The uninstall handler has usually already done this — waiting two days to
 * delete data that lost its purpose the moment the app was removed would be
 * the wrong reading of "don't keep it longer than needed". This is the
 * backstop for the case where that webhook never arrived, and it has to be
 * safe to run against a shop that is already gone.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  try {
    await deleteAllShopData(shop);
  } catch (error) {
    console.error("[PieceUp] could not redact shop", shop, error);
  }

  return new Response();
};

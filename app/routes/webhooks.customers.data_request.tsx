import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { collectCustomerData } from "../models/shopData.server";

/**
 * A customer has asked, through the merchant, what this app knows about them.
 *
 * One of the three privacy webhooks Shopify requires of every public app. The
 * merchant is the data controller and answers the customer; the app's job is
 * to hand the merchant what it holds, within 30 days.
 *
 * Written to the log rather than emailed because PieceUp has no mailer, and
 * the volume makes that reasonable: the app holds at most a handful of rows
 * per shopper — when they played, which prize, which code — and never a name,
 * an email or an address, because none of those are ever sent to it.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const customerId = (payload as { customer?: { id?: unknown } })?.customer?.id;
  if (customerId == null) return new Response();

  try {
    const plays = await collectCustomerData(shop, String(customerId));

    // Structured on one line so it can be found and handed over whole. The
    // customer id is Shopify's own reference, which the merchant needs in
    // order to match this back to the request they received.
    console.log(
      "[PieceUp] customer data request",
      JSON.stringify({ shop, customerId: String(customerId), plays }),
    );
  } catch (error) {
    console.error("[PieceUp] could not collect customer data", shop, error);
  }

  return new Response();
};

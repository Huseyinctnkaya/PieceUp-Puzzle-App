import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { redactCustomer } from "../models/shopData.server";

/**
 * A customer has asked to be forgotten.
 *
 * Deletes their plays, which is the only place the app links anything to a
 * person. Their orders stay: an attributed order holds a gid, a total and a
 * code — nothing personal — and with the play gone there is no longer any path
 * from it back to them. The merchant's revenue history therefore survives a
 * shopper exercising their rights, which is the correct outcome for both.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const customerId = (payload as { customer?: { id?: unknown } })?.customer?.id;
  if (customerId == null) return new Response();

  try {
    await redactCustomer(shop, String(customerId));
  } catch (error) {
    // A 200 with a logged failure, as everywhere else: repeated non-2xx
    // responses get the subscription disabled, and a disabled privacy webhook
    // is a compliance problem far worse than one retryable deletion.
    console.error("[PieceUp] could not redact customer", shop, error);
  }

  return new Response();
};

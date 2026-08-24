import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";
import { recordStat } from "../models/puzzleStat.server";

/**
 * Records that a shopper opened the puzzle.
 *
 * Only "opened" is accepted here. The later funnel stages are recorded
 * server-side in the completion route, where they can't be inflated by a
 * client posting whatever it likes — this endpoint is unauthenticated beyond
 * the App Proxy signature, so anything it writes is a number a visitor could
 * inflate. That's tolerable for an engagement metric and not for anything
 * tied to a reward.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { session } = await authenticate.public.appProxy(request);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolved server-side rather than taken from the request body, so a client
  // can't attribute opens to a puzzle that isn't the live one.
  const config = await getActivePuzzleConfig(session.shop);
  if (!config) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  await recordStat(session.shop, config.id, "opened");

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

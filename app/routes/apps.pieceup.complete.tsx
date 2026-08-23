import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";
import {
  countRewardsThisMonth,
  hasAlreadyPlayed,
  recordCompletion,
} from "../models/playRecord.server";
import { issueRewardCode } from "../services/rewardService.server";
import { getSubscription } from "../services/billing.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const identityKey = body.identityKey as string | undefined;
  if (!identityKey) {
    return new Response(JSON.stringify({ error: "missing identityKey" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = await getActivePuzzleConfig(session.shop);
  if (!config) {
    return new Response(JSON.stringify({ error: "no_active_puzzle" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const alreadyPlayed = await hasAlreadyPlayed(
    session.shop,
    identityKey,
    config.playLimitType as "ONCE_EVER" | "ONCE_PER_DAY",
  );
  if (alreadyPlayed) {
    return new Response(JSON.stringify({ error: "already_played" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Checked before issuing, not after: issueRewardCode creates a real,
  // redeemable Shopify discount, so going over the plan's allowance has to be
  // stopped before money is on the line.
  const { plan } = await getSubscription(admin);
  if (plan.monthlyRewardLimit !== null) {
    const used = await countRewardsThisMonth(session.shop);
    if (used >= plan.monthlyRewardLimit) {
      return new Response(JSON.stringify({ error: "reward_limit_reached" }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  let code: string;
  try {
    code = await issueRewardCode(admin, {
      rewardType: config.rewardType as
        "PERCENTAGE_DISCOUNT" | "FREE_PRODUCT_DISCOUNT",
      rewardValue: config.rewardValue,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "reward_issuance_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await recordCompletion(session.shop, identityKey, code);
  } catch (error) {
    return new Response(JSON.stringify({ error: "already_played" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ discountCode: code }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

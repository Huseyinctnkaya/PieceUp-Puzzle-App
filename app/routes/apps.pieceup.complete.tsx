import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";
import {
  countRewardsThisMonth,
  hasAlreadyPlayed,
  recordCompletion,
} from "../models/playRecord.server";
import {
  issueRewardCode,
  type DiscountType,
} from "../services/rewardService.server";
import { getSubscription } from "../services/billing.server";
import { recordStat } from "../models/puzzleStat.server";

/** Reads a stored gid list, treating anything malformed as an empty one. */
function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

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
  // Which gift the shopper picked, by its place in the list. Absent when the
  // puzzle has no gift step, in which case the first gift is the prize.
  const giftIndex = typeof body.giftIndex === "number" ? body.giftIndex : null;
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

  // Counted here, after the replay check but before the plan limit: the
  // shopper genuinely finished the puzzle, and whether they end up with a code
  // is a separate question. Keeping the two apart is what makes
  // "completed minus rewarded" mean "finished but the plan had nothing left".
  await recordStat(session.shop, config.id, "completed");

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

  // The prize is the gift they chose. Indexed rather than named because two
  // gifts may share a title, and the index is what the storefront knows. Out of
  // range falls back to the first gift rather than failing: a shopper who
  // finished the puzzle should not be denied a prize over a stale list.
  const gift = config.gifts[giftIndex ?? 0] ?? config.gifts[0];
  if (!gift) {
    return new Response(JSON.stringify({ error: "no_reward_configured" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  let code: string | null;
  try {
    code = await issueRewardCode(admin, {
      discountType: gift.discountType as DiscountType,
      discountValue: gift.discountValue,
      productIds: parseIds(gift.productIds),
      collectionIds: parseIds(gift.collectionIds),
    });
  } catch (error) {
    console.error("Failed to issue reward", session.shop, error);
    return new Response(JSON.stringify({ error: "reward_issuance_failed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // A "try again" prize still counts as a play: it is how the merchant caps
    // one go per shopper, and the absence of a code does not undo that.
    await recordCompletion(session.shop, identityKey, code ?? "", gift.title);
  } catch (error) {
    return new Response(JSON.stringify({ error: "already_played" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Only a real code counts as rewarded, so the funnel keeps meaning what it
  // says: a shopper who won "try again" was not rewarded.
  if (code) await recordStat(session.shop, config.id, "rewarded");

  return new Response(JSON.stringify({ discountCode: code }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

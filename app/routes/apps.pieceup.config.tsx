import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { JSON_NO_STORE } from "./apps.pieceup.headers";
import { getPuzzleForShopper } from "../services/storefrontPuzzle.server";
import { getCachedPlan } from "../services/planCache.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.public.appProxy(request);
  // Carries the shopper's identity so an A/B test can resolve their variant.
  // Absent for an older widget cached by a theme, which simply gets the shop's
  // active puzzle and sits outside the experiment.
  const identityKey = new URL(request.url).searchParams.get("identityKey");
  const config = session
    ? await getPuzzleForShopper(session.shop, identityKey)
    : null;

  if (!config) {
    return new Response(JSON.stringify({ config: null }), {
      status: 200,
      headers: JSON_NO_STORE,
    });
  }

  // Cached, because this endpoint runs on every storefront page view and the
  // answer changes at most monthly. Null means the plan could not be read, and
  // is deliberately not treated as Free: a transient API error must not put
  // our badge on a paying merchant's shop.
  const plan = admin ? await getCachedPlan(session.shop, admin) : null;

  return new Response(
    JSON.stringify({
      config: {
        badgeLabel: config.badgeLabel,
        headline: config.headline,
        description: config.description,
        imageUrl: config.imageUrl,
        pieceCount: config.pieceCount,
        knobSize: config.knobSize,
        difficulty: config.difficulty,
        trayPosition: config.trayPosition,
        accentColor: config.accentColor,
        timeLimitSeconds: config.timeLimitSeconds,
        shuffleLimit: config.shuffleLimit,
        giftStep: config.giftStep,
        giftBoxMode: config.giftBoxMode,
        gifts: config.gifts.map((gift) => ({
          title: gift.title,
          description: gift.description,
          badgeLabel: gift.badgeLabel,
          imageUrl: gift.imageUrl,
          // Whether this one is worth anything. The storefront cannot tell a
          // "try again" from a prize otherwise, and congratulates either way.
          // The discount itself stays here: what a code is worth is the
          // server's business, and a shopper can read the page's source.
          awardsPrize: gift.discountType !== "NONE",
        })),
        // Whether the shopper may go again, so the reward panel can offer it.
        // Sent as the answer rather than the rule: the storefront has no
        // business knowing how the limit is counted, only whether it is spent.
        canReplay: config.playLimitType === "UNLIMITED",
        triggerMode: config.triggerMode,
        triggerPage: config.triggerPage,
        triggerDelaySeconds: config.triggerDelaySeconds,
        // Free shops carry a small PieceUp line under the puzzle; removing it
        // is part of what the paid plans sell. `?? false` so an unreadable
        // plan hides the badge rather than showing it: wrongly branding a
        // paying merchant's storefront is a defect they will notice, wrongly
        // sparing a free shop costs us a little promotion.
        showBranding: plan?.showsBranding ?? false,
      },
    }),
    { status: 200, headers: JSON_NO_STORE },
  );
}

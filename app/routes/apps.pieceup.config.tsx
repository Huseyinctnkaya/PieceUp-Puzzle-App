import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);
  const config = session ? await getActivePuzzleConfig(session.shop) : null;

  if (!config) {
    return new Response(JSON.stringify({ config: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

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
        triggerMode: config.triggerMode,
        triggerPage: config.triggerPage,
        triggerDelaySeconds: config.triggerDelaySeconds,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

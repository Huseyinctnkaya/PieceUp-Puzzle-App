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
        })),
        triggerMode: config.triggerMode,
        triggerPage: config.triggerPage,
        triggerDelaySeconds: config.triggerDelaySeconds,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";
import {
  hasAlreadyPlayed,
  type PlayLimitType,
} from "../models/playRecord.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const identityKey = url.searchParams.get("identityKey");

  if (!session || !identityKey) {
    return new Response(JSON.stringify({ alreadyPlayed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const config = await getActivePuzzleConfig(session.shop);
  if (!config) {
    return new Response(JSON.stringify({ alreadyPlayed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const alreadyPlayed = await hasAlreadyPlayed(
    session.shop,
    identityKey,
    config.playLimitType as PlayLimitType,
  );

  return new Response(JSON.stringify({ alreadyPlayed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

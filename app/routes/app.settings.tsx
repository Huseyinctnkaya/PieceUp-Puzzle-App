import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import {
  isThemeEmbedDone,
  setThemeEmbedDone,
} from "../models/shopSetup.server";

/**
 * The app's Settings destination.
 *
 * Shopify links here from the app's card in the admin, via the
 * `[app_preferences]` url in `shopify.app.toml` — so this route existing is not
 * optional. Without it a merchant clicking "App settings" lands on a raw 404,
 * which is what App Store review 2.1.3 rejects.
 *
 * What belongs here is only what is set once for the whole shop. Everything
 * about how a puzzle looks and plays is per-puzzle and stays on the puzzle,
 * because a shop with two puzzles needs two answers, not one.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const [puzzles, themeEmbedDone] = await Promise.all([
    listPuzzleConfigs(session.shop),
    isThemeEmbedDone(session.shop),
  ]);
  const active = puzzles.find((p) => p.isActive) ?? null;

  return {
    puzzleCount: puzzles.length,
    activePuzzle: active ? { id: active.id, name: active.name } : null,
    themeEmbedDone,
    themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps`,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await setThemeEmbedDone(session.shop, form.get("done") === "true");
  return { ok: true };
}

export default function SettingsPage() {
  const { puzzleCount, activePuzzle, themeEmbedDone, themeEditorUrl } =
    useLoaderData<typeof loader>();
  const embedFetcher = useFetcher<typeof action>();

  // Same optimistic read as the dashboard's setup guide: both write the one
  // ShopSetup row, so the checkbox must not lag a revalidation behind.
  const embedDone = embedFetcher.formData
    ? embedFetcher.formData.get("done") === "true"
    : themeEmbedDone;

  return (
    <s-page heading="Settings">
      <s-stack gap="large">
        <s-section heading="Storefront widget">
          <s-stack gap="base">
            <s-paragraph>
              The puzzle reaches your storefront through the PieceUp app embed
              in your theme. Until that is on, nothing appears however the
              puzzle is configured.
            </s-paragraph>
            {/* The one setting the Admin API can't tell us: reading a theme's
                app embeds needs a themes scope and a settings_data.json fetch,
                so the merchant confirms it and we remember the answer. */}
            <s-checkbox
              label="The PieceUp app embed is turned on"
              details="Tick this once you've enabled it in your theme editor."
              checked={embedDone}
              onChange={(event) =>
                embedFetcher.submit(
                  { done: String(event.currentTarget.checked) },
                  { method: "post" },
                )
              }
            />
            <s-stack direction="inline" gap="small-200">
              <s-button href={themeEditorUrl} target="_blank">
                Open theme editor
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Active puzzle">
          {activePuzzle ? (
            <s-stack gap="base">
              <s-paragraph>
                <s-text type="strong">{activePuzzle.name}</s-text> is live on
                your storefront. How it opens, which pages it appears on, how
                often a shopper can play and what they can win are all set on
                the puzzle itself.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button href={`/app/puzzles/${activePuzzle.id}`}>
                  Edit this puzzle
                </s-button>
                <s-button variant="tertiary" href="/app/puzzles">
                  All puzzles ({puzzleCount})
                </s-button>
              </s-stack>
            </s-stack>
          ) : (
            <s-stack gap="base">
              <s-paragraph>
                No puzzle is active, so shoppers see nothing. Only one puzzle
                can be active at a time.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-button
                  variant="primary"
                  href={puzzleCount > 0 ? "/app/puzzles" : "/app/puzzles/new"}
                >
                  {puzzleCount > 0 ? "Choose a puzzle" : "Create a puzzle"}
                </s-button>
              </s-stack>
            </s-stack>
          )}
        </s-section>

        <s-section heading="Plan and billing">
          <s-stack gap="base">
            <s-paragraph>
              Your plan sets how many rewards you can hand out each month and
              how many puzzles you can keep.
            </s-paragraph>
            <s-stack direction="inline" gap="small-200">
              <s-button href="/app/plan">View plan</s-button>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Help">
          <s-stack gap="base">
            <s-paragraph>
              The <s-link href="/app/docs">documentation</s-link> covers setup,
              prizes, play limits and the things that usually go wrong.
            </s-paragraph>
            <s-paragraph>
              Anything else —{" "}
              <s-link href="mailto:info@34devs.com">info@34devs.com</s-link>.
            </s-paragraph>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getSubscription } from "../services/billing.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import {
  ExperimentAlreadyRunningError,
  ExperimentNotFoundError,
  getExperimentResults,
  getRunningExperiment,
  InvalidVariantsError,
  listExperiments,
  startExperiment,
  stopExperiment,
  type ExperimentResults,
} from "../models/experiment.server";
import { MIN_SAMPLE_PER_VARIANT } from "../lib/significance";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const { plan } = await getSubscription(admin);

  // Same gate as the analytics page: an experiment is only worth running if
  // its results can be read.
  if (!plan.hasAnalytics) {
    return { locked: true as const, planTitle: plan.title };
  }

  const [puzzles, running, past] = await Promise.all([
    listPuzzleConfigs(session.shop),
    getRunningExperiment(session.shop),
    listExperiments(session.shop),
  ]);

  return {
    locked: false as const,
    puzzles: puzzles.map((puzzle) => ({ id: puzzle.id, name: puzzle.name })),
    results: running
      ? await getExperimentResults(session.shop, running.id)
      : null,
    past: past
      .filter((experiment) => experiment.status === "STOPPED")
      .map((experiment) => ({
        id: experiment.id,
        name: experiment.name,
        startedAt: experiment.startedAt,
        stoppedAt: experiment.stoppedAt,
      })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "stop") {
      await stopExperiment(session.shop, String(form.get("id") || ""));
      return { stopped: true };
    }

    const splitPercent = Number(form.get("splitPercent") || 50);
    await startExperiment(session.shop, {
      name: String(form.get("name") || "").trim() || "Untitled test",
      variantAId: String(form.get("variantAId") || ""),
      variantBId: String(form.get("variantBId") || ""),
      splitPercent: Number.isFinite(splitPercent) ? splitPercent : 50,
    });
    return { started: true };
  } catch (error) {
    if (error instanceof ExperimentAlreadyRunningError) {
      return { error: "already_running" };
    }
    if (error instanceof InvalidVariantsError) {
      return { error: error.message };
    }
    if (error instanceof ExperimentNotFoundError) {
      return { error: "not_found" };
    }
    console.error("Experiment action failed", session.shop, error);
    return { error: "failed" };
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  already_running: "You already have a test running. Stop it first.",
  variants_must_differ: "Pick two different puzzles to compare.",
  unknown_puzzle: "That puzzle no longer exists.",
  not_found: "Test not found.",
  failed: "Couldn’t do that. Please try again.",
};

function money(cents: number, currency: string | null) {
  if (!currency) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function percent(part: number, whole: number) {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

/**
 * What the numbers do and do not support, in a sentence.
 *
 * The wording is the point. A test that has not separated its variants must
 * say so plainly — a merchant who reads "B is ahead" and acts on forty
 * visitors has been misled by the tool, not by the data.
 */
function Verdict({ results }: { results: ExperimentResults }) {
  const { revenue, visitorsNeeded, a, b } = results;
  const leaderName = revenue.leader === "A" ? a.name : b.name;

  if (revenue.significant && revenue.leader) {
    return (
      <s-banner tone="success" heading={`${leaderName} is winning`}>
        <s-text>
          It earns more per visitor, and the gap is large enough to be real
          rather than luck. You can stop the test and keep this one.
        </s-text>
      </s-banner>
    );
  }

  if (!revenue.enoughData) {
    return (
      <s-banner tone="info" heading="Too early to call">
        <s-text>
          Each puzzle needs at least {MIN_SAMPLE_PER_VARIANT} visitors before
          the numbers mean anything. Whichever is ahead right now could easily
          swap places tomorrow.
        </s-text>
      </s-banner>
    );
  }

  return (
    <s-banner tone="info" heading="No clear winner yet">
      <s-text>
        {revenue.leader
          ? `${leaderName} is ahead, but not by enough to rule out chance. `
          : "The two are level. "}
        {visitorsNeeded === null
          ? "The two are performing identically, so no amount of waiting will separate them — pick either and move on."
          : visitorsNeeded > 0
            ? `About ${visitorsNeeded.toLocaleString()} more visitors each would settle it.`
            : "Keep it running a little longer."}
      </s-text>
    </s-banner>
  );
}

function VariantCard({
  variant,
  result,
  currency,
  leading,
}: {
  variant: "A" | "B";
  result: ExperimentResults["a"];
  currency: string | null;
  leading: boolean;
}) {
  return (
    <s-grid-item>
      <s-box padding="base" border="base" borderRadius="base" blockSize="100%">
        <s-stack gap="small-200">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-badge tone={leading ? "success" : "neutral"}>{variant}</s-badge>
            <s-text type="strong">{result.name}</s-text>
          </s-stack>

          <s-text color="subdued">Revenue per visitor</s-text>
          <s-heading>
            {money(Math.round(result.revenuePerVisitorCents), currency)}
          </s-heading>

          <s-divider></s-divider>

          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Visitors</s-text>
            <s-text>{result.opened.toLocaleString()}</s-text>
          </s-stack>
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Finished</s-text>
            <s-text>
              {result.completed.toLocaleString()} (
              {percent(result.completed, result.opened)})
            </s-text>
          </s-stack>
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Orders</s-text>
            <s-text>{result.orders.toLocaleString()}</s-text>
          </s-stack>
          <s-stack direction="inline" justifyContent="space-between">
            <s-text color="subdued">Total revenue</s-text>
            <s-text>{money(result.revenueCents, currency)}</s-text>
          </s-stack>
        </s-stack>
      </s-box>
    </s-grid-item>
  );
}

export default function Experiments() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [name, setName] = useState("");
  const [variantAId, setVariantAId] = useState("");
  const [variantBId, setVariantBId] = useState("");

  useEffect(() => {
    if (!fetcher.data || typeof fetcher.data !== "object") return;
    if ("error" in fetcher.data) {
      const key = String(fetcher.data.error);
      shopify.toast.show(ERROR_MESSAGES[key] ?? ERROR_MESSAGES.failed, {
        isError: true,
      });
    } else if ("started" in fetcher.data) {
      shopify.toast.show("Test started");
      setName("");
    } else if ("stopped" in fetcher.data) {
      shopify.toast.show("Test stopped");
    }
  }, [fetcher.data, shopify]);

  if (data.locked) {
    return (
      <s-page heading="A/B tests">
        <s-section>
          <s-stack gap="base" alignItems="start">
            <s-heading>A/B testing is part of the Pro plan</s-heading>
            <s-text color="subdued">
              You’re on the {data.planTitle} plan. Upgrade to run two puzzles
              side by side and find out which one earns more.
            </s-text>
            <s-button variant="primary" href="/app/plan">
              View plans
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const { puzzles, results, past } = data;
  const busy = fetcher.state !== "idle";

  return (
    <s-page heading="A/B tests">
      <s-stack gap="large">
        <s-text color="subdued">
          Run two puzzles at once and find out which earns more. Each shopper
          always sees the same one, so the comparison stays clean.
        </s-text>

        {results ? (
          <>
            <Verdict results={results} />

            <s-section padding="none">
              <s-box padding="base">
                <s-stack direction="inline" justifyContent="space-between">
                  <s-stack gap="small-500">
                    <s-heading>{results.name}</s-heading>
                    <s-text color="subdued">
                      Running since{" "}
                      {new Date(results.startedAt).toLocaleDateString()} ·{" "}
                      {results.splitPercent}% to A
                    </s-text>
                  </s-stack>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="stop" />
                    <input type="hidden" name="id" value={results.id} />
                    <s-button type="submit" tone="critical" disabled={busy}>
                      Stop test
                    </s-button>
                  </fetcher.Form>
                </s-stack>
              </s-box>

              <s-box padding="base">
                <s-grid gridTemplateColumns="1fr 1fr" gap="base" alignItems="stretch">
                  <VariantCard
                    variant="A"
                    result={results.a}
                    currency={results.currency}
                    leading={results.revenue.leader === "A"}
                  />
                  <VariantCard
                    variant="B"
                    result={results.b}
                    currency={results.currency}
                    leading={results.revenue.leader === "B"}
                  />
                </s-grid>
              </s-box>

              <s-box padding="base">
                <s-text color="subdued">
                  The winner is decided on revenue per visitor, not on how many
                  people finish. An easier puzzle is finished more often almost
                  by definition — it just hands out more discounts for the same
                  baskets. Each puzzle needs at least{" "}
                  {MIN_SAMPLE_PER_VARIANT} visitors before a verdict is
                  offered.
                </s-text>
              </s-box>
            </s-section>
          </>
        ) : (
          <s-section heading="Start a test">
            {puzzles.length < 2 ? (
              <s-stack gap="base" alignItems="start">
                <s-text color="subdued">
                  You need two puzzles to compare. Create a second one, change
                  the thing you want to test, then come back.
                </s-text>
                <s-button variant="primary" href="/app/puzzles">
                  Go to puzzles
                </s-button>
              </s-stack>
            ) : (
              <fetcher.Form method="post">
                <s-stack gap="base">
                  <s-text-field
                    label="What are you testing?"
                    name="name"
                    value={name}
                    placeholder="e.g. 4 pieces vs 9 pieces"
                    onInput={(event: { currentTarget: { value: string } }) =>
                      setName(event.currentTarget.value)
                    }
                  ></s-text-field>

                  <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                    <s-select
                      label="Variant A"
                      name="variantAId"
                      value={variantAId}
                      placeholder="Pick a puzzle"
                      onChange={(event: { currentTarget: { value: string } }) =>
                        setVariantAId(event.currentTarget.value)
                      }
                    >
                      {puzzles.map((puzzle) => (
                        <s-option key={puzzle.id} value={puzzle.id}>
                          {puzzle.name}
                        </s-option>
                      ))}
                    </s-select>

                    <s-select
                      label="Variant B"
                      name="variantBId"
                      value={variantBId}
                      placeholder="Pick a puzzle"
                      onChange={(event: { currentTarget: { value: string } }) =>
                        setVariantBId(event.currentTarget.value)
                      }
                    >
                      {puzzles.map((puzzle) => (
                        <s-option key={puzzle.id} value={puzzle.id}>
                          {puzzle.name}
                        </s-option>
                      ))}
                    </s-select>
                  </s-grid>

                  <s-number-field
                    label="Share of shoppers sent to A"
                    name="splitPercent"
                    defaultValue="50"
                    min={0}
                    max={100}
                    step={5}
                    details="Leave at 50 unless you have a reason. An even split settles the question fastest."
                  ></s-number-field>

                  <s-box>
                    <s-button
                      type="submit"
                      variant="primary"
                      disabled={busy || !variantAId || !variantBId}
                    >
                      Start test
                    </s-button>
                  </s-box>

                  <s-text color="subdued">
                    While a test runs it replaces your active puzzle on the
                    storefront. Your other puzzles are left alone.
                  </s-text>
                </s-stack>
              </fetcher.Form>
            )}
          </s-section>
        )}

        {past.length > 0 ? (
          <s-section heading="Finished tests">
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Test</s-table-header>
                <s-table-header listSlot="labeled">Started</s-table-header>
                <s-table-header listSlot="labeled">Stopped</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {past.map((experiment) => (
                  <s-table-row key={experiment.id}>
                    <s-table-cell>
                      <s-text type="strong">{experiment.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {new Date(experiment.startedAt).toLocaleDateString()}
                    </s-table-cell>
                    <s-table-cell>
                      {experiment.stoppedAt
                        ? new Date(experiment.stoppedAt).toLocaleDateString()
                        : "—"}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>
        ) : null}
      </s-stack>
    </s-page>
  );
}

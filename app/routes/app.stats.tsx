import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSubscription } from "../services/billing.server";
import { getRedemptionStats } from "../services/discountStats.server";
import {
  getDailyStats,
  getFunnelTotals,
  getTotalsByPuzzle,
} from "../models/puzzleStat.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import { getPrizeWins } from "../models/playRecord.server";

const RANGE_DAYS = 30;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const { plan } = await getSubscription(admin);

  // Analytics is a paid feature. Bail out before running the queries rather
  // than fetching data the page won't show.
  if (!plan.hasAnalytics) {
    return { locked: true as const, planTitle: plan.title };
  }

  const [totals, daily, byPuzzle, puzzles, redemptions, prizeWins] =
    await Promise.all([
      getFunnelTotals(session.shop),
      getDailyStats(session.shop, RANGE_DAYS),
      getTotalsByPuzzle(session.shop),
      listPuzzleConfigs(session.shop),
      getRedemptionStats(admin),
      getPrizeWins(session.shop),
    ]);

  const names = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle.name]));

  return {
    locked: false as const,
    totals,
    prizeWins,
    daily,
    redemptions,
    rangeDays: RANGE_DAYS,
    perPuzzle: byPuzzle
      .map((row) => ({
        ...row,
        // A puzzle can be deleted while its stats remain; showing the row is
        // more useful than dropping history, so it gets a placeholder name.
        name: names.get(row.puzzleId) ?? "Deleted puzzle",
      }))
      .sort((a, b) => b.opened - a.opened),
  };
}

function percent(part: number, whole: number) {
  if (whole === 0) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <s-grid-item>
      <s-box padding="base" border="base" borderRadius="base" blockSize="100%">
        <s-stack gap="small-200">
          <s-text color="subdued">{label}</s-text>
          <s-heading>{value}</s-heading>
          {hint ? <s-text color="subdued">{hint}</s-text> : null}
        </s-stack>
      </s-box>
    </s-grid-item>
  );
}

/**
 * A bar per day. Deliberately hand-rolled rather than pulling in a chart
 * library: the whole requirement is "show relative volume over 30 days", and
 * a dependency would cost more than it returns.
 */
function DailyChart({
  daily,
}: {
  daily: { date: string; opened: number; rewarded: number }[];
}) {
  const peak = Math.max(1, ...daily.map((day) => day.opened));

  return (
    <div
      style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}
    >
      {daily.map((day) => {
        const openedHeight = Math.round((day.opened / peak) * 100);
        const rewardedHeight = Math.round((day.rewarded / peak) * 100);
        return (
          <div
            key={day.date}
            title={`${day.date}: ${day.opened} opened, ${day.rewarded} rewarded`}
            style={{
              flex: 1,
              height: "100%",
              display: "flex",
              alignItems: "flex-end",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "100%",
                height: `${openedHeight}%`,
                minHeight: day.opened > 0 ? 2 : 0,
                background: "#c9cccf",
                borderRadius: 2,
              }}
            />
            {/* Rewards overlay the same column rather than sitting beside it,
                so the eye reads "of the opens, this many converted". */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                width: "100%",
                height: `${rewardedHeight}%`,
                minHeight: day.rewarded > 0 ? 2 : 0,
                background: "#303030",
                borderRadius: 2,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function StatsPage() {
  const data = useLoaderData<typeof loader>();

  if (data.locked) {
    return (
      <s-page>
        <s-stack gap="large">
          <s-stack gap="small-400">
            <s-heading>Analytics</s-heading>
            <s-text color="subdued">
              Track how your puzzles are performing.
            </s-text>
          </s-stack>

          <s-section>
            <s-stack gap="base" alignItems="center">
              <s-icon type="lock" tone="neutral" />
              <s-heading>Analytics is part of the Pro plan</s-heading>
              <s-text color="subdued">
                You’re on the {data.planTitle} plan. Upgrade to see how many
                shoppers opened the puzzle, how many finished it, and whether
                their codes got used.
              </s-text>
              <s-button variant="primary" href="/app/plan">
                View plans
              </s-button>
            </s-stack>
          </s-section>
        </s-stack>
      </s-page>
    );
  }

  const { totals, daily, perPuzzle, redemptions, rangeDays, prizeWins } = data;
  // The share is of prizes won, not of plays: a "try again" is a prize too,
  // and leaving it out would make the percentages add up to less than a whole.
  const totalWins = prizeWins.reduce((sum, row) => sum + row.won, 0);
  const unrewarded = Math.max(totals.completed - totals.rewarded, 0);

  return (
    <s-page>
      <s-stack gap="large">
        <s-stack gap="small-400">
          <s-heading>Analytics</s-heading>
          <s-text color="subdued">
            Track how your puzzles are performing.
          </s-text>
        </s-stack>

        {unrewarded > 0 ? (
          <s-banner
            tone="warning"
            heading="Some finishers went away empty-handed"
          >
            <s-text>
              {unrewarded} shoppers finished the puzzle but got no code, because
              your monthly reward limit was used up. Upgrade to stop losing
              them.
            </s-text>
          </s-banner>
        ) : null}

        <s-section heading="Overview">
          <s-grid
            gridTemplateColumns="1fr 1fr 1fr 1fr"
            gap="base"
            alignItems="stretch"
          >
            <Metric label="Opened" value={String(totals.opened)} />
            <Metric
              label="Completed"
              value={String(totals.completed)}
              hint={`${percent(totals.completed, totals.opened)} of opens`}
            />
            <Metric
              label="Rewards given"
              value={String(totals.rewarded)}
              hint={`${percent(totals.rewarded, totals.completed)} of finishers`}
            />
            <Metric
              label="Codes redeemed"
              value={redemptions ? String(redemptions.redeemed) : "Unknown"}
              hint={
                redemptions
                  ? `${percent(redemptions.redeemed, redemptions.issued)} of codes given`
                  : "Couldn’t read from Shopify"
              }
            />
          </s-grid>
        </s-section>

        <s-section heading={`Last ${rangeDays} days`}>
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    background: "#c9cccf",
                    borderRadius: 2,
                  }}
                />
                <s-text color="subdued">Opened</s-text>
              </s-stack>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <div
                  style={{
                    width: 12,
                    height: 12,
                    background: "#303030",
                    borderRadius: 2,
                  }}
                />
                <s-text color="subdued">Rewards given</s-text>
              </s-stack>
            </s-stack>

            <DailyChart daily={daily} />

            <s-stack direction="inline" justifyContent="space-between">
              <s-text color="subdued">{daily[0]?.date}</s-text>
              <s-text color="subdued">{daily[daily.length - 1]?.date}</s-text>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section padding="none">
          <s-box padding="base">
            <s-heading>By puzzle</s-heading>
          </s-box>

          {perPuzzle.length === 0 ? (
            <s-box padding="base">
              <s-text color="subdued">
                No data yet. This fills in as shoppers see your puzzle in your
                store.
              </s-text>
            </s-box>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Puzzle</s-table-header>
                <s-table-header listSlot="labeled">Opened</s-table-header>
                <s-table-header listSlot="labeled">Completed</s-table-header>
                <s-table-header listSlot="labeled">Rewarded</s-table-header>
                <s-table-header listSlot="inline">Conversion</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {perPuzzle.map((row) => (
                  <s-table-row key={row.puzzleId}>
                    <s-table-cell>
                      <s-text type="strong">{row.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>{String(row.opened)}</s-table-cell>
                    <s-table-cell>{String(row.completed)}</s-table-cell>
                    <s-table-cell>{String(row.rewarded)}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone="neutral">
                        {percent(row.completed, row.opened)}
                      </s-badge>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>

        <s-section padding="none">
          <s-box padding="base">
            <s-heading>By prize</s-heading>
            <s-text color="subdued">
              Which prizes shoppers are landing on.
            </s-text>
          </s-box>

          {prizeWins.length === 0 ? (
            <s-box padding="base">
              <s-text color="subdued">
                No prizes won yet. This fills in as shoppers finish the puzzle.
              </s-text>
            </s-box>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Prize</s-table-header>
                <s-table-header listSlot="labeled">Won</s-table-header>
                <s-table-header listSlot="inline">Share</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {prizeWins.map((row) => (
                  <s-table-row key={row.title}>
                    <s-table-cell>
                      <s-text type="strong">{row.title}</s-text>
                    </s-table-cell>
                    <s-table-cell>{String(row.won)}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone="neutral">
                        {percent(row.won, totalWins)}
                      </s-badge>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      </s-stack>
    </s-page>
  );
}

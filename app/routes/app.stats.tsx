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

const RANGE_DAYS = 30;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const { plan } = await getSubscription(admin);

  // Analytics is a paid feature. Bail out before running the queries rather
  // than fetching data the page won't show.
  if (!plan.hasAnalytics) {
    return { locked: true as const, planTitle: plan.title };
  }

  const [totals, daily, byPuzzle, puzzles, redemptions] = await Promise.all([
    getFunnelTotals(session.shop),
    getDailyStats(session.shop, RANGE_DAYS),
    getTotalsByPuzzle(session.shop),
    listPuzzleConfigs(session.shop),
    getRedemptionStats(admin),
  ]);

  const names = new Map(puzzles.map((puzzle) => [puzzle.id, puzzle.name]));

  return {
    locked: false as const,
    totals,
    daily,
    redemptions,
    rangeDays: RANGE_DAYS,
    perPuzzle: byPuzzle
      .map((row) => ({
        ...row,
        // A puzzle can be deleted while its stats remain; showing the row is
        // more useful than dropping history, so it gets a placeholder name.
        name: names.get(row.puzzleId) ?? "Silinmiş puzzle",
      }))
      .sort((a, b) => b.opened - a.opened),
  };
}

function percent(part: number, whole: number) {
  if (whole === 0) return "—";
  return `%${Math.round((part / whole) * 100)}`;
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
            title={`${day.date}: ${day.opened} açılma, ${day.rewarded} ödül`}
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
            <s-heading>İstatistikler</s-heading>
            <s-text color="subdued">
              Puzzle&apos;larınızın performansını takip edin.
            </s-text>
          </s-stack>

          <s-section>
            <s-stack gap="base" alignItems="center">
              <s-icon type="lock" tone="neutral" />
              <s-heading>İstatistikler Pro planına dahildir</s-heading>
              <s-text color="subdued">
                Şu anda {data.planTitle} planındasınız. Kaç kişinin
                puzzle&apos;ı açtığını, kaçının tamamladığını ve kodların
                kullanılıp kullanılmadığını görmek için yükseltin.
              </s-text>
              <s-button variant="primary" href="/app/plan">
                Planları görüntüle
              </s-button>
            </s-stack>
          </s-section>
        </s-stack>
      </s-page>
    );
  }

  const { totals, daily, perPuzzle, redemptions, rangeDays } = data;
  const unrewarded = Math.max(totals.completed - totals.rewarded, 0);

  return (
    <s-page>
      <s-stack gap="large">
        <s-stack gap="small-400">
          <s-heading>İstatistikler</s-heading>
          <s-text color="subdued">
            Puzzle&apos;larınızın performansını takip edin.
          </s-text>
        </s-stack>

        {unrewarded > 0 ? (
          <s-banner tone="warning" heading="Ödülsüz kalan tamamlamalar var">
            <s-text>
              {unrewarded} kişi puzzle&apos;ı bitirdi ama aylık ödül limitiniz
              dolduğu için kod alamadı. Planınızı yükselterek bu müşterileri
              kaçırmayı bırakabilirsiniz.
            </s-text>
          </s-banner>
        ) : null}

        <s-section heading="Genel">
          <s-grid
            gridTemplateColumns="1fr 1fr 1fr 1fr"
            gap="base"
            alignItems="stretch"
          >
            <Metric label="Açılma" value={String(totals.opened)} />
            <Metric
              label="Tamamlama"
              value={String(totals.completed)}
              hint={`Açılanların ${percent(totals.completed, totals.opened)}'i`}
            />
            <Metric
              label="Verilen ödül"
              value={String(totals.rewarded)}
              hint={`Tamamlayanların ${percent(totals.rewarded, totals.completed)}'i`}
            />
            <Metric
              label="Kullanılan kod"
              value={redemptions ? String(redemptions.redeemed) : "Bilinmiyor"}
              hint={
                redemptions
                  ? `Verilenlerin ${percent(redemptions.redeemed, redemptions.issued)}'i`
                  : "Shopify'dan okunamadı"
              }
            />
          </s-grid>
        </s-section>

        <s-section heading={`Son ${rangeDays} gün`}>
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
                <s-text color="subdued">Açılma</s-text>
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
                <s-text color="subdued">Verilen ödül</s-text>
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
            <s-heading>Puzzle bazında</s-heading>
          </s-box>

          {perPuzzle.length === 0 ? (
            <s-box padding="base">
              <s-text color="subdued">
                Henüz veri yok. Puzzle&apos;ınız mağazanızda görüntülendikçe
                burası dolacak.
              </s-text>
            </s-box>
          ) : (
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Puzzle</s-table-header>
                <s-table-header listSlot="labeled">Açılma</s-table-header>
                <s-table-header listSlot="labeled">Tamamlama</s-table-header>
                <s-table-header listSlot="labeled">Ödül</s-table-header>
                <s-table-header listSlot="inline">Dönüşüm</s-table-header>
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
      </s-stack>
    </s-page>
  );
}

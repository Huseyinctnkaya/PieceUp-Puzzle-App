import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getSubscription } from "../services/billing.server";
import { countRewardsThisMonth } from "../models/playRecord.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import { PLANS, PLAN_KEYS, TRIAL_DAYS, paidPlanName } from "../lib/plans";
import type { PlanKey } from "../lib/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const [subscription, rewardsThisMonth, puzzles] = await Promise.all([
    getSubscription(admin),
    countRewardsThisMonth(session.shop),
    listPuzzleConfigs(session.shop),
  ]);

  return {
    currentPlanKey: subscription.plan.key,
    subscriptionId: subscription.id,
    trialDays: subscription.trialDays,
    currentPeriodEnd: subscription.currentPeriodEnd,
    rewardsThisMonth,
    puzzleCount: puzzles.length,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "downgrade") {
    const subscriptionId = String(form.get("subscriptionId") || "");
    if (!subscriptionId) return { error: "missing_subscription" };
    try {
      // prorate: the merchant gets credited for the unused days rather than
      // paying for time they've given up.
      await billing.cancel({
        subscriptionId,
        isTest: process.env.NODE_ENV !== "production",
        prorate: true,
      });
      return { downgraded: true };
    } catch {
      return { error: "cancel_failed" };
    }
  }

  const requested = String(form.get("plan") || "");
  const billingName = (PLAN_KEYS as readonly string[]).includes(requested)
    ? paidPlanName(requested as PlanKey)
    : null;
  if (!billingName) {
    return { error: "unknown_plan" };
  }

  // Always throws a redirect to Shopify's charge approval screen, so nothing
  // after this runs on the happy path.
  return billing.request({
    plan: billingName,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${process.env.SHOPIFY_APP_URL}/app/plan?shop=${session.shop}`,
  });
}

function formatPrice(price: number) {
  return price === 0 ? "Ücretsiz" : `$${price.toFixed(2)}`;
}

export default function PlanPage() {
  const {
    currentPlanKey,
    subscriptionId,
    trialDays,
    currentPeriodEnd,
    rewardsThisMonth,
    puzzleCount,
  } = useLoaderData<typeof loader>();
  const planFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!planFetcher.data || typeof planFetcher.data !== "object") return;
    if ("downgraded" in planFetcher.data) {
      shopify.toast.show("Aboneliğiniz iptal edildi, Free plana geçtiniz");
    } else if ("error" in planFetcher.data) {
      shopify.toast.show("İşlem tamamlanamadı, lütfen tekrar deneyin", {
        isError: true,
      });
    }
  }, [planFetcher.data, shopify]);

  const currentPlan = PLANS[currentPlanKey];
  const rewardLimit = currentPlan.monthlyRewardLimit;
  const rewardsLeft =
    rewardLimit === null ? null : Math.max(rewardLimit - rewardsThisMonth, 0);
  const overRewardLimit =
    rewardLimit !== null && rewardsThisMonth >= rewardLimit;
  const busy = planFetcher.state !== "idle";

  return (
    <s-page>
      <s-stack gap="large">
        <s-stack gap="small-400">
          <s-heading>Plan</s-heading>
          <s-text color="subdued">
            Planınızı görüntüleyin ve mağazanızın büyümesine göre yükseltin.
          </s-text>
        </s-stack>

        {overRewardLimit ? (
          <s-banner tone="warning" heading="Aylık ödül limitiniz doldu">
            <s-text>
              Bu ay {rewardLimit} ödülün tamamı dağıtıldı. Ay sonuna kadar yeni
              ödül verilemez — daha fazlası için planınızı yükseltin.
            </s-text>
          </s-banner>
        ) : null}

        <s-section heading="Mevcut planınız">
          <s-stack gap="base">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>{currentPlan.title}</s-heading>
              <s-badge tone={currentPlan.price === 0 ? "neutral" : "success"}>
                {formatPrice(currentPlan.price)}
                {currentPlan.price === 0 ? "" : " / ay"}
              </s-badge>
              {trialDays ? (
                <s-badge tone="info">{trialDays} günlük deneme</s-badge>
              ) : null}
            </s-stack>

            {currentPeriodEnd ? (
              <s-text color="subdued">
                Sonraki faturalandırma:{" "}
                {new Date(currentPeriodEnd).toLocaleDateString("tr-TR")}
              </s-text>
            ) : null}

            <s-divider />

            <s-stack gap="small-200">
              <s-text type="strong">Bu ayki kullanımınız</s-text>
              <s-text color="subdued">
                Ödül: {rewardsThisMonth}
                {rewardLimit === null
                  ? " (sınırsız)"
                  : ` / ${rewardLimit}${rewardsLeft !== null ? ` — ${rewardsLeft} hakkınız kaldı` : ""}`}
              </s-text>
              <s-text color="subdued">
                Puzzle: {puzzleCount}
                {currentPlan.puzzleLimit === null
                  ? " (sınırsız)"
                  : ` / ${currentPlan.puzzleLimit}`}
              </s-text>
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Planlar">
          <s-stack gap="base">
            <s-text color="subdued">
              Ücretli planlar {TRIAL_DAYS} gün ücretsiz denenebilir. Ücret
              Shopify faturanıza yansır.
            </s-text>

            {/* stretch + blockSize 100% below: without both, each card is only
                as tall as its own feature list, so the tiers end up ragged and
                their buttons sit at different heights. */}
            <s-grid
              gridTemplateColumns="1fr 1fr 1fr"
              gap="base"
              alignItems="stretch"
            >
              {PLAN_KEYS.map((key) => {
                const plan = PLANS[key];
                const isCurrent = key === currentPlanKey;
                const isFree = plan.price === 0;
                return (
                  <s-grid-item key={key}>
                    <s-box
                      padding="base"
                      border={isCurrent ? "base" : "small"}
                      borderColor={isCurrent ? "strong" : "base"}
                      borderRadius="base"
                      blockSize="100%"
                    >
                      <s-stack
                        gap="base"
                        blockSize="100%"
                        justifyContent="space-between"
                      >
                        <s-stack gap="small-200">
                          <s-stack
                            direction="inline"
                            gap="small-200"
                            alignItems="center"
                          >
                            <s-heading>{plan.title}</s-heading>
                            {isCurrent ? (
                              <s-badge tone="success">Mevcut</s-badge>
                            ) : null}
                          </s-stack>
                          <s-text type="strong">
                            {formatPrice(plan.price)}
                            {isFree ? "" : " / ay"}
                          </s-text>
                          <s-unordered-list>
                            {plan.features.map((feature) => (
                              <s-list-item key={feature}>{feature}</s-list-item>
                            ))}
                          </s-unordered-list>
                        </s-stack>

                        {isCurrent ? (
                          <s-button disabled>Kullanımda</s-button>
                        ) : isFree ? (
                          // Dropping to Free means cancelling the subscription
                          // outright — there's no $0 charge to switch to.
                          <s-button
                            loading={busy}
                            onClick={() =>
                              planFetcher.submit(
                                {
                                  intent: "downgrade",
                                  subscriptionId: subscriptionId ?? "",
                                },
                                { method: "post" },
                              )
                            }
                          >
                            Free plana dön
                          </s-button>
                        ) : (
                          <s-button
                            variant="primary"
                            loading={busy}
                            onClick={() =>
                              planFetcher.submit(
                                { intent: "subscribe", plan: key },
                                { method: "post" },
                              )
                            }
                          >
                            {currentPlan.price > plan.price
                              ? "Bu plana geç"
                              : "Yükselt"}
                          </s-button>
                        )}
                      </s-stack>
                    </s-box>
                  </s-grid-item>
                );
              })}
            </s-grid>
          </s-stack>
        </s-section>
      </s-stack>
    </s-page>
  );
}

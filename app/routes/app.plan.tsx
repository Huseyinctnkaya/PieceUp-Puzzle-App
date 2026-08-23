import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getSubscription } from "../services/billing.server";
import { countRewardsThisMonth } from "../models/playRecord.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import { PLANS, PLAN_KEYS, TRIAL_DAYS, pricingPlansUrl } from "../lib/plans";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const [subscription, rewardsThisMonth, puzzles] = await Promise.all([
    getSubscription(admin),
    countRewardsThisMonth(session.shop),
    listPuzzleConfigs(session.shop),
  ]);

  return {
    currentPlanKey: subscription.plan.key,
    trialDays: subscription.trialDays,
    currentPeriodEnd: subscription.currentPeriodEnd,
    rewardsThisMonth,
    puzzleCount: puzzles.length,
    pricingUrl: pricingPlansUrl(session.shop),
  };
}

function formatPrice(price: number) {
  return price === 0 ? "Ücretsiz" : `$${price.toFixed(2)}`;
}

export default function PlanPage() {
  const {
    currentPlanKey,
    trialDays,
    currentPeriodEnd,
    rewardsThisMonth,
    puzzleCount,
    pricingUrl,
  } = useLoaderData<typeof loader>();

  const currentPlan = PLANS[currentPlanKey];
  const rewardLimit = currentPlan.monthlyRewardLimit;
  const rewardsLeft =
    rewardLimit === null ? null : Math.max(rewardLimit - rewardsThisMonth, 0);
  const overRewardLimit =
    rewardLimit !== null && rewardsThisMonth >= rewardLimit;

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
              Ücretli planlar {TRIAL_DAYS} gün ücretsiz denenebilir. Plan
              değişikliği Shopify üzerinden yapılır ve faturanıza yansır.
            </s-text>

            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
              {PLAN_KEYS.map((key) => {
                const plan = PLANS[key];
                const isCurrent = key === currentPlanKey;
                return (
                  <s-grid-item key={key}>
                    <s-box
                      padding="base"
                      border={isCurrent ? "base" : "small"}
                      borderColor={isCurrent ? "strong" : "base"}
                      borderRadius="base"
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
                            {plan.price === 0 ? "" : " / ay"}
                          </s-text>
                          <s-unordered-list>
                            {plan.features.map((feature) => (
                              <s-list-item key={feature}>{feature}</s-list-item>
                            ))}
                          </s-unordered-list>
                        </s-stack>

                        {isCurrent ? (
                          <s-button disabled>Kullanımda</s-button>
                        ) : (
                          <s-button
                            variant={plan.price === 0 ? "auto" : "primary"}
                            href={pricingUrl}
                            target="_blank"
                          >
                            {plan.price === 0 ? "Bu plana geç" : "Yükselt"}
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

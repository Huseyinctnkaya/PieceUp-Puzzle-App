import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";
import {
  isThemeEmbedDone,
  setThemeEmbedDone,
} from "../models/shopSetup.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const [puzzles, themeEmbedDone] = await Promise.all([
    listPuzzleConfigs(session.shop),
    isThemeEmbedDone(session.shop),
  ]);
  return {
    hasPuzzle: puzzles.length > 0,
    hasActivePuzzle: puzzles.some((p) => p.isActive),
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

type Step = {
  label: string;
  description: string;
  done: boolean;
  action: React.ReactNode;
};

// Animates between collapsed and expanded without needing to know the content's
// height. The 0fr → 1fr grid row transition resolves against the content's own
// size, so nothing has to be measured or hardcoded; the inner wrapper does the
// clipping. `visibility` is transitioned rather than toggled outright so the
// content stays visible for the duration of the close animation, but is still
// properly removed from tab order once collapsed.
function Collapsible({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 250ms ease",
      }}
    >
      <div
        style={{
          overflow: "hidden",
          visibility: open ? "visible" : "hidden",
          transition: "visibility 250ms",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { hasPuzzle, hasActivePuzzle, themeEmbedDone, themeEditorUrl } =
    useLoaderData<typeof loader>();
  const embedFetcher = useFetcher<typeof action>();
  const [guideOpen, setGuideOpen] = useState(true);

  // Optimistic: reflect the toggle immediately instead of waiting for the
  // loader to revalidate, so the checklist doesn't lag behind the click.
  const embedDone = embedFetcher.formData
    ? embedFetcher.formData.get("done") === "true"
    : themeEmbedDone;

  const steps: Step[] = [
    {
      label: "İlk puzzle'ınızı oluşturun",
      description:
        "Bir görsel yükleyin, parça sayısını ve ödülü belirleyin. Puzzle'ınız birkaç dakikada hazır.",
      done: hasPuzzle,
      action: (
        <s-button variant="primary" href="/app/puzzles/new">
          Puzzle oluştur
        </s-button>
      ),
    },
    {
      label: "Bir puzzle'ı aktif edin",
      description:
        "Aynı anda yalnızca bir puzzle yayında olabilir. Yayınlamak istediğiniz puzzle'ı aktif edin.",
      done: hasActivePuzzle,
      action: (
        <s-button href="/app/puzzles">Puzzle&apos;ları görüntüle</s-button>
      ),
    },
    {
      label: "Mağazanızda widget'ı etkinleştirin",
      description:
        "Puzzle'ın müşterilere görünmesi için tema düzenleyicisinden PieceUp app embed'ini açın.",
      done: embedDone,
      action: (
        <s-stack direction="inline" gap="small-200">
          <s-button href={themeEditorUrl} target="_blank">
            Tema düzenleyiciyi aç
          </s-button>
          <s-button
            variant="tertiary"
            loading={embedFetcher.state !== "idle"}
            onClick={() =>
              embedFetcher.submit(
                { done: String(!embedDone) },
                { method: "post" },
              )
            }
          >
            {embedDone
              ? "Tamamlanmadı olarak işaretle"
              : "Tamamlandı olarak işaretle"}
          </s-button>
        </s-stack>
      ),
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const firstOpen = steps.findIndex((s) => !s.done);
  const [openStep, setOpenStep] = useState(firstOpen === -1 ? -1 : firstOpen);

  return (
    <s-page>
      <s-stack gap="large">
        <s-stack gap="small-400">
          <s-heading>PieceUp</s-heading>
          <s-text color="subdued">
            Mağazanız için sürükle-bırak bulmaca kampanyaları oluşturun ve
            yönetin.
          </s-text>
        </s-stack>

        <s-section padding="none">
          <s-box padding="base">
            <s-grid gridTemplateColumns="1fr auto" gap="base">
              <s-stack gap="small-500">
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-heading>Kurulum rehberi</s-heading>
                  <s-badge
                    tone={completed === steps.length ? "success" : "info"}
                  >
                    {completed} / {steps.length} tamamlandı
                  </s-badge>
                </s-stack>
                <s-text color="subdued">
                  Uygulamanızı çalışır hale getirmek için bu adımları
                  tamamlayın.
                </s-text>
              </s-stack>
              <s-button
                variant="tertiary"
                icon={guideOpen ? "chevron-up" : "chevron-down"}
                accessibilityLabel={guideOpen ? "Rehberi kapat" : "Rehberi aç"}
                onClick={() => setGuideOpen(!guideOpen)}
              ></s-button>
            </s-grid>
          </s-box>

          <Collapsible open={guideOpen}>
            {steps.map((step, index) => (
              <s-box key={step.label} paddingBlockStart="none">
                <s-divider />
                <s-box padding="base">
                  <s-grid gridTemplateColumns="1fr auto" gap="base">
                    <s-stack
                      direction="inline"
                      gap="small-200"
                      alignItems="center"
                    >
                      <s-icon
                        type={step.done ? "check-circle-filled" : "circle"}
                        tone={step.done ? "success" : "neutral"}
                      />
                      <s-text type="strong">{step.label}</s-text>
                      {step.done ? (
                        <s-badge tone="success">Tamamlandı</s-badge>
                      ) : null}
                    </s-stack>
                    <s-button
                      variant="tertiary"
                      icon={openStep === index ? "chevron-up" : "chevron-down"}
                      accessibilityLabel={
                        openStep === index ? "Adımı kapat" : "Adımı aç"
                      }
                      onClick={() =>
                        setOpenStep(openStep === index ? -1 : index)
                      }
                    ></s-button>
                  </s-grid>

                  <Collapsible open={openStep === index}>
                    <s-box
                      paddingBlockStart="small-200"
                      paddingInlineStart="large"
                    >
                      <s-stack gap="base">
                        <s-text color="subdued">{step.description}</s-text>
                        <s-stack direction="inline" gap="small-200">
                          {step.action}
                        </s-stack>
                      </s-stack>
                    </s-box>
                  </Collapsible>
                </s-box>
              </s-box>
            ))}
          </Collapsible>
        </s-section>

        {/* stretch so the three cards share the tallest one's height and
            their buttons line up, rather than each sizing to its own copy. */}
        <s-grid
          gridTemplateColumns="1fr 1fr 1fr"
          gap="base"
          alignItems="stretch"
        >
          <s-grid-item>
            <s-section heading="Puzzle'lar">
              <s-stack
                gap="base"
                blockSize="100%"
                justifyContent="space-between"
              >
                <s-text color="subdued">
                  Tüm puzzle&apos;larınızı görüntüleyin, düzenleyin ve yönetin.
                </s-text>
                <s-button href="/app/puzzles">
                  Puzzle&apos;ları görüntüle
                </s-button>
              </s-stack>
            </s-section>
          </s-grid-item>

          <s-grid-item>
            <s-section heading="Yeni puzzle">
              <s-stack
                gap="base"
                blockSize="100%"
                justifyContent="space-between"
              >
                <s-text color="subdued">
                  Görsel yükleyip yeni bir puzzle kampanyası oluşturun.
                </s-text>
                <s-button variant="primary" href="/app/puzzles/new">
                  Puzzle oluştur
                </s-button>
              </s-stack>
            </s-section>
          </s-grid-item>

          <s-grid-item>
            <s-section heading="Mağaza widget'ı">
              <s-stack
                gap="base"
                blockSize="100%"
                justifyContent="space-between"
              >
                <s-text color="subdued">
                  Puzzle&apos;ın mağazanızda görünmesi için tema
                  düzenleyicisinden app embed&apos;ini etkinleştirin.
                </s-text>
                <s-button href={themeEditorUrl} target="_blank">
                  Tema düzenleyiciyi aç
                </s-button>
              </s-stack>
            </s-section>
          </s-grid-item>
        </s-grid>

        <s-section heading="Yardıma mı ihtiyacınız var?">
          <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <s-grid-item>
              <s-box border="base" borderRadius="base" padding="base">
                <s-stack gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-icon type="email" />
                    {/* TODO: swap in the real support address once we have one */}
                    <s-link href="mailto:destek@example.com">
                      <s-text type="strong">E-posta desteği</s-text>
                    </s-link>
                  </s-stack>
                  <s-text color="subdued">
                    Bize e-posta gönderin, en kısa sürede size dönüş yapalım.
                  </s-text>
                </s-stack>
              </s-box>
            </s-grid-item>

            <s-grid-item>
              <s-box border="base" borderRadius="base" padding="base">
                <s-stack gap="small-200">
                  <s-stack
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                  >
                    <s-icon type="book-open" />
                    {/* TODO: swap in the real docs URL once we have one */}
                    <s-link href="#">
                      <s-text type="strong">Dokümantasyon</s-text>
                    </s-link>
                  </s-stack>
                  <s-text color="subdued">
                    Çözümleri ve kılavuzları dokümantasyonumuzda bulun.
                  </s-text>
                </s-stack>
              </s-box>
            </s-grid-item>
          </s-grid>
        </s-section>
      </s-stack>
    </s-page>
  );
}

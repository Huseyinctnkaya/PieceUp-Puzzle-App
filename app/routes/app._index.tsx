import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const puzzles = await listPuzzleConfigs(session.shop);
  return {
    hasPuzzle: puzzles.length > 0,
    hasActivePuzzle: puzzles.some((p) => p.isActive),
    themeEditorUrl: `https://${session.shop}/admin/themes/current/editor?context=apps`,
  };
}

function SetupStep({ done, label }: { done: boolean; label: string }) {
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <s-icon
        type={done ? "check-circle-filled" : "circle"}
        tone={done ? "success" : "neutral"}
      />
      <s-text color={done ? "subdued" : "base"}>{label}</s-text>
      {done ? <s-badge tone="success">Tamamlandı</s-badge> : null}
    </s-stack>
  );
}

export default function Dashboard() {
  const { hasPuzzle, hasActivePuzzle, themeEditorUrl } = useLoaderData<typeof loader>();
  const completed = [hasPuzzle, hasActivePuzzle].filter(Boolean).length;

  return (
    <s-page heading="PieceUp">
      <s-stack gap="large">
        <s-text color="subdued">
          Mağazanız için sürükle-bırak bulmaca kampanyaları oluşturun ve yönetin.
        </s-text>

        <s-section>
          <s-stack gap="base">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>Kurulum rehberi</s-heading>
              <s-badge tone={completed === 2 ? "success" : "info"}>
                {completed} / 2 tamamlandı
              </s-badge>
            </s-stack>
            <s-text color="subdued">
              Uygulamanızı çalışır hale getirmek için bu adımları tamamlayın.
            </s-text>
            <s-divider />
            <SetupStep done={hasPuzzle} label="İlk puzzle'ınızı oluşturun" />
            <SetupStep done={hasActivePuzzle} label="Bir puzzle'ı aktif edin" />
          </s-stack>
        </s-section>

        <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
          <s-grid-item>
            <s-section heading="Puzzle'lar">
              <s-stack gap="base" blockSize="100%" justifyContent="space-between">
                <s-text color="subdued">
                  Tüm puzzle&apos;larınızı görüntüleyin, düzenleyin ve yönetin.
                </s-text>
                <s-button href="/app/puzzles">Puzzle&apos;ları görüntüle</s-button>
              </s-stack>
            </s-section>
          </s-grid-item>

          <s-grid-item>
            <s-section heading="Yeni puzzle">
              <s-stack gap="base" blockSize="100%" justifyContent="space-between">
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
              <s-stack gap="base" blockSize="100%" justifyContent="space-between">
                <s-text color="subdued">
                  Puzzle&apos;ın mağazanızda görünmesi için tema düzenleyicisinden
                  app embed&apos;ini etkinleştirin.
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
                  <s-stack direction="inline" gap="small-200" alignItems="center">
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
                  <s-stack direction="inline" gap="small-200" alignItems="center">
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

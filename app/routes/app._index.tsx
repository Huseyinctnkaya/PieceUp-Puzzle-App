import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const puzzles = await listPuzzleConfigs(session.shop);
  const hasPuzzle = puzzles.length > 0;
  const hasActivePuzzle = puzzles.some((p) => p.isActive);
  const setupCompletedCount = [hasPuzzle, hasActivePuzzle].filter(Boolean).length;
  const themeEditorUrl = `https://${session.shop}/admin/themes/current/editor?context=apps`;
  return { hasPuzzle, hasActivePuzzle, setupCompletedCount, themeEditorUrl };
}

export default function Dashboard() {
  const { hasPuzzle, hasActivePuzzle, setupCompletedCount, themeEditorUrl } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="PieceUp">
      <s-paragraph color="subdued">
        Mağazanız için sürükle-bırak bulmaca kampanyaları oluşturun ve yönetin.
      </s-paragraph>

      <s-section>
        <details open={setupCompletedCount < 2}>
          <summary>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-heading>Kurulum Rehberi</s-heading>
              <s-badge tone={setupCompletedCount === 2 ? "success" : "info"}>
                {setupCompletedCount} / 2 tamamlandı
              </s-badge>
            </s-stack>
          </summary>
          <s-paragraph color="subdued">
            Uygulamanızı çalışır hale getirmek için bu adımları takip edin.
          </s-paragraph>
          <s-stack gap="small-400">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone={hasPuzzle ? "success" : "neutral"}>
                {hasPuzzle ? "Tamamlandı" : "Bekliyor"}
              </s-badge>
              <s-paragraph>İlk puzzle&apos;ınızı oluşturun</s-paragraph>
            </s-stack>
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-badge tone={hasActivePuzzle ? "success" : "neutral"}>
                {hasActivePuzzle ? "Tamamlandı" : "Bekliyor"}
              </s-badge>
              <s-paragraph>Bir puzzle&apos;ı aktif edin</s-paragraph>
            </s-stack>
          </s-stack>
        </details>
      </s-section>

      <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
        <s-grid-item>
          <s-section heading="Puzzle'lar">
            <s-paragraph color="subdued">
              Tüm puzzle&apos;larınızı görüntüleyin, düzenleyin ve yönetin.
            </s-paragraph>
            <s-button href="/app/puzzles">Puzzle&apos;ları görüntüle</s-button>
          </s-section>
        </s-grid-item>
        <s-grid-item>
          <s-section heading="Yeni Puzzle">
            <s-paragraph color="subdued">
              Görsel yükleyip yeni bir puzzle kampanyası oluşturun.
            </s-paragraph>
            <s-button variant="primary" href="/app/puzzles/new">
              Oluştur
            </s-button>
          </s-section>
        </s-grid-item>
        <s-grid-item>
          <s-section heading="Mağaza widget'ı">
            <s-paragraph color="subdued">
              Puzzle&apos;ın mağazanızda görünmesi için tema düzenleyicisinden
              app embed&apos;ini etkinleştirin.
            </s-paragraph>
            <s-button href={themeEditorUrl} target="_blank">
              Tema düzenleyiciyi aç
            </s-button>
          </s-section>
        </s-grid-item>
      </s-grid>

      <s-section heading="Yardıma mı ihtiyacınız var?">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-grid-item>
            <s-box border="base" borderRadius="base" padding="base">
              {/* TODO: replace with the real support email once available */}
              <s-heading>E-posta desteği</s-heading>
              <s-paragraph color="subdued">
                Bize e-posta gönderin, en kısa sürede size dönüş yapalım.
              </s-paragraph>
              <s-link href="mailto:destek@example.com">E-posta gönder</s-link>
            </s-box>
          </s-grid-item>
          <s-grid-item>
            <s-box border="base" borderRadius="base" padding="base">
              {/* TODO: replace with the real documentation URL once available */}
              <s-heading>Dokümantasyon</s-heading>
              <s-paragraph color="subdued">
                Çözümleri ve kılavuzları dokümantasyonumuzda bulun.
              </s-paragraph>
              <s-link href="#">Dokümantasyonu görüntüle</s-link>
            </s-box>
          </s-grid-item>
        </s-grid>
      </s-section>
    </s-page>
  );
}

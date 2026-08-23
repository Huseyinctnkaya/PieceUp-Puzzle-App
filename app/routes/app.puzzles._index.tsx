import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  deletePuzzleConfig,
  listPuzzleConfigs,
  NotFoundError,
  PuzzleIsActiveError,
} from "../models/puzzleConfig.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const puzzles = await listPuzzleConfigs(session.shop);
  return { puzzles };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id") || "");

  try {
    await deletePuzzleConfig(session.shop, id);
    return { deleted: true };
  } catch (error) {
    if (error instanceof PuzzleIsActiveError) {
      return { error: "cannot_delete_active_puzzle" };
    }
    if (error instanceof NotFoundError) {
      return { error: "not_found" };
    }
    return { error: "delete_failed" };
  }
}

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  cannot_delete_active_puzzle: "Aktif bir puzzle silinemez. Önce pasife alın.",
  not_found: "Puzzle bulunamadı.",
  delete_failed: "Puzzle silinemedi.",
};

function rewardSummary(rewardType: string, rewardValue: string) {
  if (rewardType === "PERCENTAGE_DISCOUNT") return `%${rewardValue} indirim`;
  if (rewardType === "FREE_PRODUCT_DISCOUNT") return "Ücretsiz ürün";
  return rewardType;
}

export default function PuzzlesList() {
  const { puzzles } = useLoaderData<typeof loader>();
  const deleteFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (!deleteFetcher.data || typeof deleteFetcher.data !== "object") return;
    if ("deleted" in deleteFetcher.data) {
      shopify.toast.show("Puzzle silindi");
    } else if ("error" in deleteFetcher.data) {
      const key = String(deleteFetcher.data.error);
      shopify.toast.show(DELETE_ERROR_MESSAGES[key] ?? "Puzzle silinemedi", {
        isError: true,
      });
    }
  }, [deleteFetcher.data, shopify]);

  return (
    <s-page>
      <s-stack gap="large">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-heading>Puzzle&apos;lar</s-heading>
          <s-button variant="primary" href="/app/puzzles/new">
            Puzzle oluştur
          </s-button>
        </s-grid>

        {puzzles.length === 0 ? (
          <s-section>
            <s-stack gap="base" alignItems="center">
              <s-heading>Henüz puzzle yok</s-heading>
              <s-text color="subdued">
                İlk puzzle&apos;ınızı oluşturarak müşterilerinize ödüllü bir
                bulmaca sunmaya başlayın.
              </s-text>
              <s-button variant="primary" href="/app/puzzles/new">
                Puzzle oluştur
              </s-button>
            </s-stack>
          </s-section>
        ) : (
          <s-section padding="none">
            <s-box padding="base">
              <s-heading>Puzzle&apos;larınız</s-heading>
            </s-box>

            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Ad</s-table-header>
                <s-table-header listSlot="inline">Durum</s-table-header>
                {/* No format="numeric" here: it right-aligns the header text,
                    but the cell below holds a badge that stays left-aligned,
                    so the two ended up visibly out of line. */}
                <s-table-header listSlot="labeled">Parça</s-table-header>
                <s-table-header listSlot="labeled">Ödül</s-table-header>
                <s-table-header>İşlemler</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {puzzles.map((puzzle) => (
                  <s-table-row key={puzzle.id}>
                    <s-table-cell>
                      <s-text type="strong">{puzzle.name}</s-text>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge tone={puzzle.isActive ? "success" : "neutral"}>
                        {puzzle.isActive ? "Aktif" : "Pasif"}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge>{String(puzzle.pieceCount)}</s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-text color="subdued">
                        {rewardSummary(puzzle.rewardType, puzzle.rewardValue)}
                      </s-text>
                    </s-table-cell>
                    <s-table-cell>
                      {/* Left-aligned to sit under the "İşlemler" header —
                          pushing the buttons to the end left the header
                          stranded at the far side of a wide column. */}
                      <s-stack direction="inline" gap="small-200">
                        <s-button href={`/app/puzzles/${puzzle.id}`}>
                          Düzenle
                        </s-button>
                        <s-button
                          tone="critical"
                          disabled={puzzle.isActive}
                          commandFor={`delete-${puzzle.id}`}
                          command="--show"
                        >
                          Sil
                        </s-button>
                      </s-stack>

                      <s-modal
                        id={`delete-${puzzle.id}`}
                        heading="Puzzle silinsin mi?"
                      >
                        <s-stack gap="base">
                          <s-text>
                            &quot;{puzzle.name}&quot; adlı puzzle kalıcı olarak
                            silinecek.
                          </s-text>
                          <s-text tone="caution">
                            Bu işlem geri alınamaz.
                          </s-text>
                        </s-stack>
                        <s-button
                          slot="primary-action"
                          variant="primary"
                          tone="critical"
                          commandFor={`delete-${puzzle.id}`}
                          command="--hide"
                          onClick={() =>
                            deleteFetcher.submit(
                              { id: puzzle.id },
                              { method: "post" },
                            )
                          }
                        >
                          Sil
                        </s-button>
                        <s-button
                          slot="secondary-actions"
                          commandFor={`delete-${puzzle.id}`}
                          command="--hide"
                        >
                          Vazgeç
                        </s-button>
                      </s-modal>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>
        )}
      </s-stack>
    </s-page>
  );
}

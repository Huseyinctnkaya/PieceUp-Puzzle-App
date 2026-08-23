import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  deletePuzzleConfig,
  listPuzzleConfigs,
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
    const message = error instanceof PuzzleIsActiveError ? "cannot_delete_active_puzzle" : "delete_failed";
    return { error: message };
  }
}

const REWARD_LABELS: Record<string, string> = {
  PERCENTAGE_DISCOUNT: "Yüzde indirim",
  FREE_PRODUCT_DISCOUNT: "Ücretsiz ürün",
};

export default function PuzzlesList() {
  const { puzzles } = useLoaderData<typeof loader>();
  const deleteFetcher = useFetcher<typeof action>();

  function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" adlı puzzle'ı silmek istediğinize emin misiniz?`)) return;
    deleteFetcher.submit({ id }, { method: "post" });
  }

  return (
    <s-page heading="Puzzles">
      <s-button slot="primary-action" variant="primary" href="/app/puzzles/new">
        Yeni puzzle oluştur
      </s-button>
      <s-section>
        {puzzles.length === 0 ? (
          <s-paragraph>Henüz hiç puzzle oluşturmadınız.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Ad</s-table-header>
              <s-table-header>Durum</s-table-header>
              <s-table-header>Parça sayısı</s-table-header>
              <s-table-header>Ödül</s-table-header>
              <s-table-header>&nbsp;</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {puzzles.map((puzzle) => (
                <s-table-row key={puzzle.id}>
                  <s-table-cell>{puzzle.name}</s-table-cell>
                  <s-table-cell>
                    <s-badge tone={puzzle.isActive ? "success" : "neutral"}>
                      {puzzle.isActive ? "Aktif" : "Pasif"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{puzzle.pieceCount}</s-table-cell>
                  <s-table-cell>{REWARD_LABELS[puzzle.rewardType] ?? puzzle.rewardType}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button href={`/app/puzzles/${puzzle.id}`}>Düzenle</s-button>
                      <s-button
                        tone="critical"
                        disabled={puzzle.isActive}
                        onClick={() => handleDelete(puzzle.id, puzzle.name)}
                      >
                        Sil
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

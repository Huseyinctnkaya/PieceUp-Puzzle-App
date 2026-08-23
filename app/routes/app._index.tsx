import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { listPuzzleConfigs } from "../models/puzzleConfig.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const puzzles = await listPuzzleConfigs(session.shop);
  const activePuzzle = puzzles.find((p) => p.isActive) ?? null;
  return { puzzleCount: puzzles.length, activePuzzle };
}

export default function Dashboard() {
  const { puzzleCount, activePuzzle } = useLoaderData<typeof loader>();

  return (
    <s-page heading="PieceUp">
      <s-section heading="Özet">
        <s-paragraph>
          Toplam {puzzleCount} puzzle oluşturdunuz.
        </s-paragraph>
        {activePuzzle ? (
          <s-paragraph>
            Şu anda aktif puzzle: <strong>{activePuzzle.name}</strong>{" "}
            <Link to={`/app/puzzles/${activePuzzle.id}`}>Düzenle</Link>
          </s-paragraph>
        ) : (
          <s-paragraph>Şu anda aktif bir puzzle yok.</s-paragraph>
        )}
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" href="/app/puzzles/new">
            Yeni puzzle oluştur
          </s-button>
          <s-button href="/app/puzzles">Tüm puzzle&apos;ları görüntüle</s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

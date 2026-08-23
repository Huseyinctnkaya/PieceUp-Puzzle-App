// The preview deliberately imports the storefront widget's own geometry
// module rather than reimplementing the piece math here. If the two ever
// drift, the preview would start lying about what merchants' customers
// actually see — which is the one thing a preview must never do.
import { buildPieces } from "../../extensions/pieceup-widget/assets/puzzle.js";

type Piece = { index: number; row: number; col: number; path: string };

const CELL = 72;

export function PuzzlePreview({
  imageUrl,
  pieceCount,
}: {
  imageUrl: string;
  pieceCount: number;
}) {
  if (!imageUrl) {
    return (
      <s-box
        padding="large"
        background="subdued"
        borderRadius="base"
        border="base"
      >
        <s-stack gap="small-200" alignItems="center">
          <s-icon type="image" tone="neutral" />
          <s-text color="subdued">
            Önizleme için önce bir puzzle görseli yükleyin.
          </s-text>
        </s-stack>
      </s-box>
    );
  }

  // Mirrors widget.js's renderPuzzle: the grid is derived from pieceCount the
  // same way, so a 6-piece puzzle previews as 3x2 exactly like it will on the
  // storefront.
  const rows = Math.ceil(Math.sqrt(pieceCount));
  const cols = Math.ceil(pieceCount / rows);
  const boardWidth = cols * CELL;
  const boardHeight = rows * CELL;
  const pieces: Piece[] = buildPieces(rows, cols, CELL, CELL, imageUrl);

  return (
    <s-box
      padding="base"
      background="subdued"
      borderRadius="base"
      border="base"
    >
      <s-stack gap="base">
        <s-stack direction="inline" gap="base" alignItems="start">
          <div
            style={{
              width: boardWidth,
              height: boardHeight,
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: `${boardWidth}px ${boardHeight}px`,
              backgroundPosition: "0 0",
              border: "2px solid #fff",
              borderRadius: 4,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              width: CELL * 2 + 6,
            }}
          >
            {pieces.map((piece) => (
              <div
                key={piece.index}
                style={{
                  width: CELL,
                  height: CELL,
                  clipPath: `path('${piece.path}')`,
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${boardWidth}px ${boardHeight}px`,
                  backgroundPosition: `-${piece.col * CELL}px -${piece.row * CELL}px`,
                }}
              />
            ))}
          </div>
        </s-stack>
        <s-text color="subdued">
          Müşteriler sağdaki parçaları soldaki alana sürükleyerek bulmacayı
          tamamlar.
        </s-text>
      </s-stack>
    </s-box>
  );
}

import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { loader as previewLoader } from "../routes/app.puzzle-preview";

// The piece geometry is fetched from /app/puzzle-preview rather than computed
// here, because the module that knows the math lives in the theme extension
// and can only be imported server-side (see that route for why). Fetching it
// keeps exactly one copy of the piece math in the codebase: if this preview is
// ever wrong, it's because the storefront is wrong too.
export function PuzzlePreview({
  imageUrl,
  pieceCount,
}: {
  imageUrl: string;
  pieceCount: number;
}) {
  const geometry = useFetcher<typeof previewLoader>();
  const { load } = geometry;

  useEffect(() => {
    if (!imageUrl) return;
    const params = new URLSearchParams({
      pieceCount: String(pieceCount),
      seed: imageUrl,
    });
    load(`/app/puzzle-preview?${params}`);
  }, [imageUrl, pieceCount, load]);

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
            Upload a puzzle image to see the preview.
          </s-text>
        </s-stack>
      </s-box>
    );
  }

  if (!geometry.data) {
    return (
      <s-box
        padding="large"
        background="subdued"
        borderRadius="base"
        border="base"
      >
        <s-stack gap="small-200" alignItems="center">
          <s-spinner size="base" accessibilityLabel="Loading preview" />
        </s-stack>
      </s-box>
    );
  }

  const { pieces, cell, boardWidth, boardHeight } = geometry.data;

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
              width: cell * 2 + 6,
            }}
          >
            {pieces.map((piece) => (
              <div
                key={piece.index}
                style={{
                  width: cell,
                  height: cell,
                  clipPath: `path('${piece.path}')`,
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: `${boardWidth}px ${boardHeight}px`,
                  backgroundPosition: `-${piece.col * cell}px -${piece.row * cell}px`,
                }}
              />
            ))}
          </div>
        </s-stack>
        <s-text color="subdued">
          Shoppers drag the pieces on the right onto the board to complete the
          puzzle.
        </s-text>
      </s-stack>
    </s-box>
  );
}

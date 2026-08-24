import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
// Imported on the server only. The admin page can't import this module in the
// browser: Vite would serve it at /extensions/pieceup-widget/assets/jigsaw.js,
// but `shopify app dev`'s proxy claims the /extensions/* path for the theme
// extension's own asset server, rewrites it to /assets/jigsaw.js, and 404s.
// Computing the geometry here keeps a single copy of the piece math — the
// preview stays honest because it runs the exact code the storefront runs.
import {
  buildPieces,
  buildPiecePath,
  gridFor,
} from "../../extensions/pieceup-widget/assets/jigsaw.js";

/** Cell size for the admin panel — smaller than the storefront's, same shapes. */
const CELL = 72;
/** Must match the storefront's TAB_RATIO, or the preview would lie about fit. */
const TAB_RATIO = 0.2;

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const pieceCount = Number(url.searchParams.get("pieceCount") || 9);
  const imageUrl = url.searchParams.get("seed") || "";

  const { rows, cols } = gridFor(pieceCount);
  const tab = CELL * TAB_RATIO;
  // Seeded exactly as the storefront does, so the merchant previews the same
  // puzzle their shoppers will be given — same edges, same scatter.
  const seed = `${imageUrl}:${rows}x${cols}`;

  const pieces = buildPieces(rows, cols, seed).map((piece) => ({
    index: piece.index,
    row: piece.row,
    col: piece.col,
    tilt: piece.tilt,
    trayOrder: piece.trayOrder,
    path: buildPiecePath(piece.edges, CELL, CELL, tab),
  }));

  return {
    rows,
    cols,
    cell: CELL,
    tab,
    boxSize: CELL + tab * 2,
    boardWidth: cols * CELL,
    boardHeight: rows * CELL,
    pieces,
  };
}

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
// Imported on the server only. The admin page can't import this module in the
// browser: Vite would serve it at /extensions/pieceup-widget/assets/puzzle.js,
// but `shopify app dev`'s proxy claims the /extensions/* path for the theme
// extension's own asset server, rewrites it to /assets/puzzle.js, and 404s.
// Computing the geometry here keeps a single copy of the piece math — the
// preview stays honest because it runs the exact code the storefront runs.
import { buildPieces } from "../../extensions/pieceup-widget/assets/puzzle.js";

// Matches the storefront widget's own cell size scaled down for the admin
// panel. buildPieces takes the cell size as a parameter, so the jigsaw paths
// scale properly rather than being visually squashed.
const CELL = 72;

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const pieceCount = Number(url.searchParams.get("pieceCount") || 9);
  const seed = url.searchParams.get("seed") || "";

  // Mirrors widget.js's renderPuzzle so a 6-piece puzzle previews as 3x2
  // exactly like it renders on the storefront.
  const rows = Math.ceil(Math.sqrt(pieceCount));
  const cols = Math.ceil(pieceCount / rows);

  return {
    rows,
    cols,
    cell: CELL,
    boardWidth: cols * CELL,
    boardHeight: rows * CELL,
    pieces: buildPieces(rows, cols, CELL, CELL, seed),
  };
}

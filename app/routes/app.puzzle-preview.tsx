import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
// The storefront's own geometry, imported on the server only. The admin page
// can't import it in the browser: Vite would serve it under /extensions/..,
// but `shopify app dev`'s proxy claims that path for the theme extension's
// asset server and 404s. Computing it here keeps one copy of the piece math,
// so the merchant previews the shapes their shoppers actually get.
import {
  parcalariUret,
  parcaPathUret,
} from "../../widget/src/lib/puzzle";

/** Rows and columns from a piece count, matching the storefront's mount. */
function gridFor(pieceCount: number) {
  const rows = Math.ceil(Math.sqrt(pieceCount));
  return { rows, cols: Math.ceil(pieceCount / rows) };
}

/** Cell size for the admin panel — smaller than the storefront's, same shapes. */
const CELL = 72;
/** Knob size is a percentage of the cell, and the storefront caps it at 40%. */
const MAX_KNOB = 0.4;

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const pieceCount = Number(url.searchParams.get("pieceCount") || 9);
  const imageUrl = url.searchParams.get("seed") || "";
  const knobSize = Number(url.searchParams.get("knobSize") || 24);

  const { rows, cols } = gridFor(pieceCount);
  // Clamped exactly as the storefront clamps it, so the preview cannot show a
  // knob the shopper would never be given.
  const tab = CELL * Math.max(0, Math.min(MAX_KNOB, knobSize / 100));
  // Seeded exactly as the storefront does, so the merchant previews the same
  // puzzle their shoppers will be given — same edges, same scatter.
  const seed = `${imageUrl}:${rows}x${cols}`;

  // Translated out of the reference's vocabulary here, so the admin page keeps
  // working in the same shape it always has.
  const pieces = parcalariUret(rows, cols, seed).map((piece) => ({
    index: piece.indeks,
    row: piece.satir,
    col: piece.sutun,
    tilt: piece.egiklik,
    trayOrder: piece.tepsiSira,
    path: parcaPathUret(piece.kenarlar, CELL, CELL, tab),
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

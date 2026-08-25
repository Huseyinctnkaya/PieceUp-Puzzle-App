/**
 * Mounts the reference puzzle into a container.
 *
 * The components under src/ are the reference implementation, carried over as
 * they are. Everything Shopify-specific stays on this side of the boundary:
 * this file translates our app-proxy config into the props they expect, so the
 * puzzle itself never learns which platform it is running on.
 */
import { render, type ComponentChild } from "preact";
import { PuzzleKampanya } from "./components/PuzzleKampanya";
import type { Props } from "./components/PuzzleKampanya/types";

export type PieceUpConfig = {
  badgeLabel?: string | null;
  headline?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  pieceCount?: number;
  rows?: number | null;
  cols?: number | null;
  knobSize?: number | null;
  difficulty?: "easy" | "medium" | "hard" | null;
  trayPosition?: "right" | "left" | "bottom" | null;
  timeLimitSeconds?: number | null;
  shuffleLimit?: number | null;
  giftStep?: boolean | null;
  giftBoxMode?: boolean | null;
  // Not merchant-editable; the preview overrides progress so a merchant always
  // opens a fresh puzzle.
  rememberProgress?: boolean | null;
  accentColor?: string | null;
  shuffleKey?: string | null;
};

/** Difficulty names cross the boundary in English and arrive in the reference's. */
const DIFFICULTY: Record<string, "kolay" | "orta" | "zor"> = {
  easy: "kolay",
  medium: "orta",
  hard: "zor",
};

/** The reference reads number settings as {value}, the shape ikas passes. */
function range(value: number) {
  return { value };
}

const TRAY: Record<string, "sag" | "sol" | "alt"> = {
  right: "sag",
  left: "sol",
  bottom: "alt",
};

/**
 * A square-ish grid from a piece count, matching what the admin offers.
 * The reference takes rows and columns separately; our merchants pick a total.
 */
function gridFor(pieceCount: number) {
  const rows = Math.ceil(Math.sqrt(pieceCount));
  return { rows, cols: Math.ceil(pieceCount / rows) };
}

export function mountPuzzle(
  container: HTMLElement,
  config: PieceUpConfig,
  onComplete: () => void | Promise<void>,
  rewardCode?: string,
): () => void {
  const grid = gridFor(config.pieceCount ?? 9);

  const props: Props & { onTamamlandi?: () => void } = {
    ustEtiket: config.badgeLabel ?? undefined,
    baslik: config.headline ?? "",
    aciklama: config.description ?? undefined,
    puzzleGorseli: config.imageUrl ?? null,
    satirSayisi: range(config.rows ?? grid.rows),
    sutunSayisi: range(config.cols ?? grid.cols),
    tirtikBoyutu: range(config.knobSize ?? 24),
    zorlukSeviyesi: DIFFICULTY[config.difficulty ?? "easy"] ?? "kolay",
    tepsiKonumu: TRAY[config.trayPosition ?? "right"] ?? "sag",
    rehberGorseliGoster: true,
    yanlisParcaDavranisi: "geriDon",
    karistirmaAnahtari: config.shuffleKey ?? config.imageUrl ?? "pieceup",
    sureLimitiAktif: Boolean(config.timeLimitSeconds),
    sureSaniye: config.timeLimitSeconds ?? 120,
    hamleSayaciniGoster: true,
    ilerlemeyiHatirla: config.rememberProgress ?? true,
    tekrarOynanabilir: false,
    konfetiEfekti: true,
    hediyeAdimiAktif: config.giftStep ?? false,
    hediyeKutuModu: config.giftBoxMode ?? false,
    kuponKodunuGoster: Boolean(rewardCode),
    kuponKodu: rewardCode ?? "",
    karistirmaHakki: config.shuffleLimit ?? 0,
    vurguRengi: config.accentColor ?? "#1a1a1a",
    onTamamlandi: () => void onComplete(),
  };

  render(
    (<PuzzleKampanya {...props} /> as unknown) as ComponentChild,
    container,
  );
  return () => render(null, container);
}

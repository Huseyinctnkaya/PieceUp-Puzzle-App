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
import { PuzzleHediyeKarti } from "./components/PuzzleHediyeKarti";
import type { Props } from "./components/PuzzleKampanya/types";

export type PieceUpGift = {
  title: string;
  description?: string | null;
  badgeLabel?: string | null;
  imageUrl?: string | null;
  /** False for a "try again": there is nothing to congratulate or shop with. */
  awardsPrize?: boolean;
};

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
  gifts?: PieceUpGift[] | null;
  // Not merchant-editable; the preview overrides progress so a merchant always
  // opens a fresh puzzle.
  rememberProgress?: boolean | null;
  /**
   * Drops the section's vertical padding. On a storefront that padding sets the
   * campaign apart from the rest of the page; inside a modal there is no page,
   * and it is 144px the puzzle could be using instead.
   */
  compact?: boolean | null;
  /** Reward panel copy. Defaults read as a Turkish storefront, like the rest. */
  rewardHeading?: string | null;
  rewardBody?: string | null;
  noPrizeHeading?: string | null;
  noPrizeBody?: string | null;
  shopButtonLabel?: string | null;
  shopUrl?: string | null;
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

export type PuzzleHandle = {
  /** Fills in the coupon the reward panel shows, once the server has minted it. */
  setRewardCode(code: string): void;
  destroy(): void;
};

export function mountPuzzle(
  container: HTMLElement,
  config: PieceUpConfig,
  /**
   * Called once the shopper has earned their prize, with which gift they chose.
   * With a gift step that is when they pick; without one it is when the last
   * piece lands, and the index is 0.
   */
  onComplete: (giftIndex: number) => void | Promise<void>,
): PuzzleHandle {
  const grid = gridFor(config.pieceCount ?? 9);
  // The code does not exist until the puzzle is finished and the server has
  // issued one, so the panel mounts without it and is redrawn when it arrives.
  let rewardCode = "";
  // Which prize was landed on. Null until the shopper picks, or 0 when there
  // is no gift step and finishing is itself the win.
  let wonIndex: number | null = null;

  const gifts = config.gifts ?? [];
  /** Whether what was won is worth anything — a "try again" is not. */
  const wonSomething = () =>
    wonIndex === null || (gifts[wonIndex]?.awardsPrize ?? true);

  const props: Props & {
    onTamamlandi?: () => void;
    onHediyeSecildi?: (giftIndex: number) => void;
  } = {
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
    // The reference takes the gift cards as a list of components to render,
    // because on ikas a merchant drops them into a slot. Ours come from the
    // puzzle's own config, so the list is built here instead.
    hediyeKartlari: (config.gifts ?? []).map((gift) => ({
      component: PuzzleHediyeKarti,
      props: {
        hediyeBasligi: gift.title,
        hediyeAciklamasi: gift.description ?? undefined,
        rozetMetni: gift.badgeLabel ?? undefined,
        hediyeGorseli: gift.imageUrl ?? null,
      },
    })),
    kuponKodunuGoster: true,
    kuponKodu: "",
    karistirmaHakki: config.shuffleLimit ?? 0,
    vurguRengi: config.accentColor ?? "#1a1a1a",
    dikeyBosluk: range(config.compact ? 0 : 72),
    // With a gift step the prize is not known until one is chosen, so
    // completing the puzzle is not yet the moment to award anything.
    onTamamlandi: () => {
      if (config.giftStep) return;
      wonIndex = 0;
      void onComplete(0);
    },
    onHediyeSecildi: (giftIndex: number) => {
      wonIndex = giftIndex;
      // Redrawn straight away so the panel greets the shopper by what they
      // actually landed on, rather than congratulating everyone and correcting
      // itself when the code arrives.
      draw();
      void onComplete(giftIndex);
    },
  };

  function draw() {
    const won = wonSomething();
    render(
      (
        <PuzzleKampanya
          {...props}
          kuponKodu={rewardCode}
          kuponKodunuGoster={won}
          odulBasligi={
            won
              ? (config.rewardHeading ?? "Tebrikler, kazandın!")
              : (config.noPrizeHeading ?? "Bu sefer olmadı")
          }
          odulAciklamasi={
            won
              ? (config.rewardBody ??
                "Aşağıdaki kodu sepetinde kullanarak indirimini alabilirsin.")
              : (config.noPrizeBody ?? "Bir dahaki sefere bol şans!")
          }
          odulButonMetni={
            won ? (config.shopButtonLabel ?? "Alışverişe başla") : undefined
          }
          odulBaglantisi={{ href: config.shopUrl ?? "/collections/all" }}
        />
      ) as unknown as ComponentChild,
      container,
    );
  }

  draw();

  return {
    setRewardCode(code) {
      rewardCode = code;
      draw();
    },
    destroy() {
      render(null, container);
    },
  };
}

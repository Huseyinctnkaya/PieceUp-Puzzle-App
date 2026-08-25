import { useEffect, useRef, useState } from "react";

/** The settings the preview needs to render the puzzle as a shopper sees it. */
export type PreviewSettings = {
  imageUrl: string;
  pieceCount: number;
  knobSize: number;
  difficulty: string;
  trayPosition: string;
  accentColor: string;
  timeLimitSeconds: number | null;
  shuffleLimit: number;
  giftStep: boolean;
  giftBoxMode: boolean;
  /** The prizes on offer. Without these the gift step opens on an empty choice. */
  gifts: {
    title: string;
    description: string;
    badgeLabel: string;
    imageUrl: string;
  }[];
  badgeLabel: string;
  headline: string;
  description: string;
};

// The reference's own layout constants. The board takes 62% of the card's
// inner width when the tray sits beside it and all of it when the tray sits
// below; the card pads itself by 14px a side and never draws a board wider
// than 620.
const BOARD_SHARE_BESIDE = 0.62;
const CARD_PADDING = 28;
const BOARD_MAX_WIDTH = 620;

/**
 * How tall the board may be, by where the tray sits.
 *
 * A tray below the board adds its own height underneath, so the board gets
 * less. These leave the whole preview around 470px, which fits a modal without
 * scrolling.
 */
const BOARD_HEIGHT_BUDGET = { beside: 240, below: 150 };

/**
 * The card width that gives a board of the height we have room for.
 *
 * Computed rather than measured. The board's height is its width over the
 * image's ratio, and the layout shares are fixed — so with the ratio in hand
 * the answer is arithmetic. Earlier versions measured the rendered puzzle and
 * narrowed it until it fit, which needed the image to have loaded first, and
 * settled at whatever size the passes happened to reach.
 */
function cardWidthFor(ratio: number, trayBeside: boolean) {
  const budget = trayBeside
    ? BOARD_HEIGHT_BUDGET.beside
    : BOARD_HEIGHT_BUDGET.below;
  const boardWidth = Math.min(BOARD_MAX_WIDTH, budget * ratio);
  const share = trayBeside ? BOARD_SHARE_BESIDE : 1;
  return Math.round(
    Math.min(980, Math.max(280, boardWidth / share + CARD_PADDING)),
  );
}

/** Reads an image's aspect ratio, falling back to square if it won't load. */
function ratioOf(src: string): Promise<number> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(
        image.naturalWidth && image.naturalHeight
          ? image.naturalWidth / image.naturalHeight
          : 1,
      );
    image.onerror = () => resolve(1);
    image.src = src;
  });
}

/** Where the widget build publishes the bundle for the admin to load. */
const BUNDLE_URL = "/pieceup-app.js";

let bundlePromise: Promise<PuzzleModule> | null = null;

/**
 * Imports the storefront bundle, once per page.
 *
 * The indirection through a blob is what keeps the bundler out of it: a bare
 * `import("/pieceup-app.js")` is a build-time request Vite rejects for anything
 * under public/, whereas a blob URL is only ever resolved by the browser.
 */
function loadPuzzleBundle(): Promise<PuzzleModule> {
  if (bundlePromise) return bundlePromise;

  const source = `export * from "${new URL(BUNDLE_URL, window.location.origin).href}";`;
  const blobUrl = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );

  bundlePromise = (import(/* @vite-ignore */ blobUrl) as Promise<PuzzleModule>)
    .finally(() => URL.revokeObjectURL(blobUrl))
    .catch((error) => {
      // Cleared so a later attempt can retry rather than replaying the failure.
      bundlePromise = null;
      throw error;
    });

  return bundlePromise;
}

type PuzzleModule = {
  mountPuzzle: (
    container: HTMLElement,
    config: Record<string, unknown>,
    onComplete: () => void,
  ) => { destroy(): void };
};

/**
 * Renders the preview by running the storefront's own bundle.
 *
 * Not a drawing of what the puzzle will look like — the actual thing, the same
 * code the shopper gets, so the preview cannot drift from it. It is mounted
 * into a shadow root with the puzzle's own stylesheet, which both keeps Polaris
 * out of it and makes it look exactly as it does on a theme.
 */
function usePuzzleMount(settings: PreviewSettings, open: boolean) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !hostRef.current || !settings.imageUrl) return;
    const host = hostRef.current;
    let mounted: { destroy(): void } | null = null;
    let cancelled = false;

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadow.replaceChildren();

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/pieceup-app.css";
    shadow.appendChild(link);

    // The puzzle's height follows from its width — the board is the image's
    // aspect ratio — so width is the lever that makes it fit. The heading comes
    // down with it: at storefront size it is most of the preview's height, and
    // a modal has none to spare.
    const fit = document.createElement("style");
    fit.textContent = [
      ".kampanya-baslik { font-size: 26px !important; }",
      ".kampanya-aciklama { font-size: 13px !important; }",
      ".kampanya-baslik-alani { margin-bottom: 16px !important; }",
    ].join("\n");
    shadow.appendChild(fit);

    const container = document.createElement("div");
    shadow.appendChild(container);

    // Loaded on demand: the bundle is only needed when a merchant asks to see
    // the puzzle, and it is not small enough to spend on every page load.
    //
    // Imported through a blob rather than by its path. It is served from
    // public/, and Vite refuses to resolve a public file from source at all —
    // even behind @vite-ignore — because such files bypass its transforms. The
    // blob is a module whose only job is to re-export the real one, so the URL
    // is opaque to the bundler and resolved by the browser at runtime.
    Promise.all([loadPuzzleBundle(), ratioOf(settings.imageUrl)])
      .then(([puzzle, ratio]) => {
        if (cancelled) return;

        // The reference only puts the tray beside the board above a 901px
        // window; below that it stacks, whatever the merchant chose.
        const trayBeside =
          settings.trayPosition !== "bottom" && window.innerWidth > 901;
        fit.textContent += `\n.oyun-kutusu { max-width: ${cardWidthFor(ratio, trayBeside)}px !important; }`;

        mounted = puzzle.mountPuzzle(
          container,
          {
            ...settings,
            shuffleKey: `preview:${settings.imageUrl}`,
            // A preview always starts fresh. Remembering progress is right for
            // a shopper and wrong for a merchant checking their settings, who
            // would otherwise reopen a half-finished puzzle.
            rememberProgress: false,
            // No page to sit on inside a modal, so the section's 144px of
            // vertical padding is height the puzzle can have instead.
            compact: true,
          },
          () => {},
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
      mounted?.destroy();
      shadow.replaceChildren();
    };
  }, [open, settings]);

  return { hostRef, error };
}

export function PuzzlePreview({ settings }: { settings: PreviewSettings }) {
  const [open, setOpen] = useState(false);
  const { hostRef, error } = usePuzzleMount(settings, open);

  if (!settings.imageUrl) {
    return (
      <s-box
        padding="large"
        background="subdued"
        borderRadius="base"
        border="base"
      >
        <s-stack gap="small-200" alignItems="center">
          <s-icon type="image" tone="neutral" />
          <s-text color="subdued">Upload a puzzle image to preview it.</s-text>
        </s-stack>
      </s-box>
    );
  }

  return (
    <>
      <s-box
        padding="large"
        background="subdued"
        borderRadius="base"
        border="base"
      >
        <s-stack gap="base" alignItems="center">
          <s-text color="subdued">Play it the way a shopper would.</s-text>
          {/* commandFor is how Polaris opens a modal: App Bridge owns the
              overlay, so it is sized and positioned for the admin frame
              instead of a hand-rolled one overflowing it. */}
          <s-button
            variant="primary"
            commandFor="pieceup-preview"
            command="--show"
            onClick={() => setOpen(true)}
          >
            Preview
          </s-button>
          {error ? (
            <s-text tone="critical">Couldn’t load the preview.</s-text>
          ) : null}
        </s-stack>
      </s-box>

      <s-modal
        id="pieceup-preview"
        heading="Preview"
        size="large-100"
        onHide={() => setOpen(false)}
      >
        <div
          ref={hostRef}
          // No height of its own: the puzzle is sized to a height budget when
          // it mounts, and the modal then wraps it. Giving this a height meant
          // guessing at the modal's — and guessing over it is what put a
          // scrollbar on the modal.
          style={{ display: "flex", flexDirection: "column" }}
        />
      </s-modal>
    </>
  );
}

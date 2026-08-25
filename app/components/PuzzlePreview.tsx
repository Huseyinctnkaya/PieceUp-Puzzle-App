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
  badgeLabel: string;
  headline: string;
  description: string;
};

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
    loadPuzzleBundle()
      .then((puzzle) => {
        if (cancelled) return;
        mounted = puzzle.mountPuzzle(
          container,
          {
            ...settings,
            shuffleKey: `preview:${settings.imageUrl}`,
            // A preview always starts fresh. Remembering progress is right for
            // a shopper and wrong for a merchant checking their settings, who
            // would otherwise reopen a half-finished puzzle.
            rememberProgress: false,
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
        <div ref={hostRef} />
      </s-modal>
    </>
  );
}

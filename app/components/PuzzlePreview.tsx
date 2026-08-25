import { useCallback, useEffect, useRef, useState } from "react";

/** The settings the preview needs to render the puzzle as a shopper sees it. */
export type PreviewSettings = {
  imageUrl: string;
  pieceCount: number;
  knobSize: number;
  difficulty: string;
  trayPosition: string;
  accentColor: string;
  showGuide: boolean;
  wrongPieceBehaviour: string;
  timeLimitSeconds: number | null;
  shuffleLimit: number;
  showMoves: boolean;
  rememberProgress: boolean;
  confetti: boolean;
  badgeLabel: string;
  headline: string;
  description: string;
};

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
    // The path is built at runtime so the bundler leaves it alone: this file is
    // served from public/, not resolved from source.
    const bundle = "/pieceup-app.js";
    (import(/* @vite-ignore */ bundle) as Promise<PuzzleModule>)
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

  const close = useCallback(() => setOpen(false), []);

  // Escape closes it, the way the storefront popup does.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

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
          <s-text color="subdued">
            Play it exactly as a shopper would, at full size.
          </s-text>
          <s-button variant="primary" onClick={() => setOpen(true)}>
            Preview
          </s-button>
          {error ? (
            <s-text tone="critical">
              Couldn’t load the preview. Try again.
            </s-text>
          ) : null}
        </s-stack>
      </s-box>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Puzzle preview"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            overflow: "auto",
          }}
        >
          {/* The backdrop is a real button rather than a div with a click
              handler, so dismissing by clicking away is reachable from the
              keyboard too. */}
          <button
            type="button"
            aria-label="Close preview"
            onClick={close}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              background: "transparent",
              cursor: "default",
            }}
          />
          <div
            style={{
              position: "relative",
              width: "min(1080px, 96vw)",
              maxHeight: "94vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 18,
              padding: "52px 20px 20px",
            }}
          >
            <button
              type="button"
              aria-label="Close preview"
              onClick={close}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 32,
                height: 32,
                border: "none",
                borderRadius: "50%",
                background: "rgba(0, 0, 0, 0.05)",
                fontSize: 20,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>
            <div ref={hostRef} />
          </div>
        </div>
      ) : null}
    </>
  );
}

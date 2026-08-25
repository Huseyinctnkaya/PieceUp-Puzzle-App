import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import type { CallbackEvent } from "@shopify/polaris-types";
import { authenticate } from "../shopify.server";
import {
  AlreadyActiveError,
  createPuzzleConfig,
  getPuzzleConfigById,
  PuzzleLimitReachedError,
  updatePuzzleConfig,
} from "../models/puzzleConfig.server";
import { getSubscription } from "../services/billing.server";
import type { action as uploadAction } from "./app.upload";
import { PuzzlePreview } from "../components/PuzzlePreview";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const isNew = params.id === "new";
  const config = isNew
    ? null
    : await getPuzzleConfigById(session.shop, params.id!);
  if (!isNew && !config) {
    throw new Response("Not Found", { status: 404 });
  }
  return { config, isNew };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const isNew = params.id === "new";

  const input = {
    name: String(form.get("name") || "Puzzle"),
    // Blank copy is stored as null, so the storefront can tell "not set" from
    // "deliberately empty" without inspecting whitespace.
    badgeLabel: String(form.get("badgeLabel") || "").trim() || null,
    headline: String(form.get("headline") || "").trim() || null,
    description: String(form.get("description") || "").trim() || null,
    imageUrl: String(form.get("imageUrl") || ""),
    pieceCount: Number(form.get("pieceCount") || 9),
    knobSize: Number(form.get("knobSize") || 24),
    difficulty: String(form.get("difficulty") || "easy") as
      "easy" | "medium" | "hard",
    trayPosition: String(form.get("trayPosition") || "right") as
      "right" | "left" | "bottom",
    accentColor: String(form.get("accentColor") || "#1a1a1a"),
    // Empty means no limit, which is not the same as a limit of zero.
    timeLimitSeconds: form.get("timeLimitSeconds")
      ? Number(form.get("timeLimitSeconds"))
      : null,
    shuffleLimit: Number(form.get("shuffleLimit") || 0),
    giftBoxMode: form.get("giftBoxMode") === "true",
    giftStep: form.get("giftStep") === "true",
    // Reward and triggering are deliberately absent: they get their own
    // section, and omitting them here leaves whatever a puzzle already has
    // rather than resetting it on every save.
    isActive: form.get("isActive") === "true",
    startDate: null,
    endDate: null,
  };

  try {
    let saved;
    if (isNew) {
      const { plan } = await getSubscription(admin);
      saved = await createPuzzleConfig(session.shop, input, plan.puzzleLimit);
    } else {
      saved = await updatePuzzleConfig(session.shop, params.id!, input);
    }
    return { saved: true, id: saved.id };
  } catch (error) {
    if (error instanceof AlreadyActiveError) {
      return { error: "already_active", activeName: error.activeName };
    }
    if (error instanceof PuzzleLimitReachedError) {
      return { error: "puzzle_limit_reached", limit: error.limit };
    }
    // Anything reaching here is a bug, not a rule the merchant broke, and the
    // banner they see cannot say more than "try again". Logging it is the only
    // way the cause is ever visible — a swallowed one cost an afternoon.
    console.error("Failed to save puzzle", params.id, error);
    return { error: "save_failed" };
  }
}

export default function PuzzleEdit() {
  const { config, isNew } = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();
  const uploadFetcher = useFetcher<typeof uploadAction>();
  const shopify = useAppBridge();
  const navigate = useNavigate();

  // Kept as one object rather than eight useStates so the save bar can tell
  // "changed" from "unchanged" with a single comparison against the baseline.
  const initialForm = useMemo(
    () => ({
      name: config?.name ?? "",
      badgeLabel: config?.badgeLabel ?? "",
      headline: config?.headline ?? "",
      description: config?.description ?? "",
      imageUrl: config?.imageUrl ?? "",
      pieceCount: String(config?.pieceCount ?? 9),
      knobSize: String(config?.knobSize ?? 24),
      difficulty: config?.difficulty ?? "easy",
      trayPosition: config?.trayPosition ?? "right",
      accentColor: config?.accentColor ?? "#1a1a1a",
      timeLimitSeconds:
        config?.timeLimitSeconds == null ? "" : String(config.timeLimitSeconds),
      shuffleLimit: String(config?.shuffleLimit ?? 0),
      giftBoxMode: String(config?.giftBoxMode ?? false),
      giftStep: String(config?.giftStep ?? false),
      isActive: String(config?.isActive ?? false),
    }),
    [config],
  );

  const [form, setForm] = useState(initialForm);
  // The baseline is what's currently persisted. It advances on a successful
  // save so the save bar goes away, without needing the loader to re-run.
  const [baseline, setBaseline] = useState(initialForm);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editImageRef = useRef<HTMLElementTagNameMap["s-button"]>(null);
  const removeImageRef = useRef<HTMLElementTagNameMap["s-button"]>(null);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(baseline),
    [form, baseline],
  );

  // Stored as a string in the form object (everything submitted is a string),
  // so unwrap it once here rather than comparing at each use site.
  const isActive = form.isActive === "true";

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (
      uploadFetcher.data &&
      typeof uploadFetcher.data === "object" &&
      "imageUrl" in uploadFetcher.data
    ) {
      const uploaded = uploadFetcher.data.imageUrl;
      setForm((prev) => ({ ...prev, imageUrl: uploaded }));
    } else if (
      uploadFetcher.data &&
      typeof uploadFetcher.data === "object" &&
      "error" in uploadFetcher.data
    ) {
      shopify.toast.show("Couldn’t upload the image", { isError: true });
    }
  }, [uploadFetcher.data, shopify]);

  useEffect(() => {
    if (!saveFetcher.data || typeof saveFetcher.data !== "object") return;
    if ("saved" in saveFetcher.data && saveFetcher.data.saved) {
      shopify.toast.show("Puzzle saved");
      setBaseline(form);
      if (isNew)
        navigate(`/app/puzzles/${saveFetcher.data.id}`, { replace: true });
    } else if ("error" in saveFetcher.data) {
      if (saveFetcher.data.error === "already_active") {
        shopify.toast.show(
          `“${saveFetcher.data.activeName}” is already active. Deactivate it first.`,
          { isError: true },
        );
      } else if (saveFetcher.data.error === "puzzle_limit_reached") {
        shopify.toast.show(
          `Your plan is limited to ${saveFetcher.data.limit} puzzle(s). Upgrade for more.`,
          { isError: true },
        );
      } else {
        shopify.toast.show("Couldn’t save", { isError: true });
      }
    }
    // `form` is deliberately excluded: this must snapshot the values that were
    // submitted, and re-running whenever the form changes would clear the dirty
    // state on every keystroke after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFetcher.data, shopify, isNew, navigate]);

  const uploadError =
    uploadFetcher.data &&
    typeof uploadFetcher.data === "object" &&
    "error" in uploadFetcher.data
      ? String(uploadFetcher.data.error)
      : undefined;

  function uploadFile(file: File | undefined) {
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    uploadFetcher.submit(formData, {
      method: "post",
      action: "/app/upload",
      encType: "multipart/form-data",
    });
  }

  function handleDrop(event: CallbackEvent<"s-drop-zone">) {
    uploadFile(event.currentTarget.files[0]);
  }

  function handleSave() {
    saveFetcher.submit(form, { method: "post" });
  }

  function handleDiscard() {
    setForm(baseline);
  }

  // The image action buttons live inside s-drop-zone, whose own native click
  // listener opens a file picker. React 18 delegates events to the app root,
  // so any React onClick here runs after that listener has already fired —
  // clicking "Remove" would delete the image *and* pop open a file dialog.
  // Attaching natively to the buttons themselves puts us earlier in the bubble
  // path than s-drop-zone, so stopPropagation actually prevents it.
  useEffect(() => {
    const editButton = editImageRef.current;
    const removeButton = removeImageRef.current;
    if (!editButton || !removeButton) return;

    const onEdit = (event: Event) => {
      event.stopPropagation();
      fileInputRef.current?.click();
    };
    const onRemove = (event: Event) => {
      event.stopPropagation();
      setForm((prev) => ({ ...prev, imageUrl: "" }));
    };

    editButton.addEventListener("click", onEdit);
    removeButton.addEventListener("click", onRemove);
    return () => {
      editButton.removeEventListener("click", onEdit);
      removeButton.removeEventListener("click", onRemove);
    };
    // Re-binds when the buttons mount/unmount, which tracks whether an image
    // is currently set.
  }, [form.imageUrl]);

  return (
    <s-page>
      <SaveBar id="puzzle-save-bar" open={isDirty}>
        <button
          variant="primary"
          onClick={handleSave}
          loading={saveFetcher.state !== "idle"}
        >
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      <s-stack gap="large">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-stack direction="inline" gap="small-200" alignItems="center">
            <s-heading>{isNew ? "New puzzle" : "Edit puzzle"}</s-heading>
            <s-badge tone={isActive ? "success" : "neutral"}>
              {isActive ? "Active" : "Inactive"}
            </s-badge>
          </s-stack>
          <s-stack direction="inline" gap="small-200" alignItems="center">
            {/* Only flips the field — saving still goes through the save bar,
                same as every other setting on this page. */}
            <s-button
              tone={isActive ? "critical" : "neutral"}
              onClick={() => setField("isActive", String(!isActive))}
            >
              {isActive ? "Deactivate" : "Activate"}
            </s-button>
            <s-button href="/app/puzzles">Back to puzzles</s-button>
          </s-stack>
        </s-grid>

        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-grid-item>
            {/* Stacked with a gap: sibling sections otherwise sit flush
                against each other and read as one panel. */}
            <s-stack gap="base">
              <s-section heading="Puzzle details">
                <s-text-field
                  label="Puzzle name"
                  details="Only you see this — it names the puzzle in your list."
                  value={form.name}
                  onChange={(event) =>
                    setField("name", event.currentTarget.value)
                  }
                />

                <s-text-field
                  label="Badge"
                  details="Small label above the headline. Leave empty to hide."
                  placeholder="Win a reward"
                  value={form.badgeLabel}
                  onChange={(event) =>
                    setField("badgeLabel", event.currentTarget.value)
                  }
                />

                <s-text-field
                  label="Headline"
                  details="Shown to shoppers above the puzzle."
                  placeholder="Solve the puzzle, claim your discount"
                  value={form.headline}
                  onChange={(event) =>
                    setField("headline", event.currentTarget.value)
                  }
                />

                <s-text-area
                  label="Description"
                  details="One or two lines under the headline."
                  rows={2}
                  value={form.description}
                  onChange={(event) =>
                    setField("description", event.currentTarget.value)
                  }
                />

                {/* Hidden input backing the "Replace" button — the drop zone's
                  own picker can't be opened programmatically. */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    uploadFile(event.target.files?.[0]);
                    // Reset so picking the same file twice still fires onChange.
                    event.target.value = "";
                  }}
                />

                <s-drop-zone
                  label="Puzzle image"
                  accept="image/jpeg,image/png,image/webp"
                  error={uploadError}
                  onChange={handleDrop}
                >
                  {form.imageUrl ? (
                    <s-stack gap="small-200" alignItems="center">
                      <s-thumbnail
                        src={form.imageUrl}
                        alt="Puzzle image"
                        size="large"
                      />
                      {/* These two get native click listeners (see the effect
                        above) instead of React's onClick. React 18 delegates
                        all clicks to the app root, so a React handler here
                        fires *after* s-drop-zone's own native listener has
                        already opened its file picker — stopPropagation from
                        a React handler is too late to prevent it. */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <s-button
                          ref={editImageRef}
                          loading={uploadFetcher.state !== "idle"}
                        >
                          Replace
                        </s-button>
                        <s-button ref={removeImageRef} tone="critical">
                          Remove
                        </s-button>
                      </div>
                    </s-stack>
                  ) : null}
                </s-drop-zone>
              </s-section>

              <s-section heading="Settings">
                <s-select
                  label="Pieces"
                  value={form.pieceCount}
                  onChange={(event) =>
                    setField("pieceCount", event.currentTarget.value)
                  }
                >
                  <s-option value="4">2 × 2</s-option>
                  <s-option value="6">3 × 2</s-option>
                  <s-option value="9">3 × 3</s-option>
                  <s-option value="12">4 × 3</s-option>
                  <s-option value="16">4 × 4</s-option>
                </s-select>

                <s-number-field
                  label="Knob size"
                  details="0 gives plain square pieces, higher gives a more pronounced jigsaw edge."
                  min={0}
                  max={40}
                  step={1}
                  value={form.knobSize}
                  onChange={(event) =>
                    setField("knobSize", event.currentTarget.value)
                  }
                />

                <s-select
                  label="Difficulty"
                  details="How close a piece has to land before it snaps in."
                  value={form.difficulty}
                  onChange={(event) =>
                    setField("difficulty", event.currentTarget.value)
                  }
                >
                  <s-option value="easy">Easy</s-option>
                  <s-option value="medium">Medium</s-option>
                  <s-option value="hard">Hard</s-option>
                </s-select>

                <s-select
                  label="Tray"
                  details="Where the loose pieces sit. Always below the board on mobile."
                  value={form.trayPosition}
                  onChange={(event) =>
                    setField("trayPosition", event.currentTarget.value)
                  }
                >
                  <s-option value="right">Right of the board</s-option>
                  <s-option value="left">Left of the board</s-option>
                  <s-option value="bottom">Below the board</s-option>
                </s-select>

                <s-color-field
                  label="Accent colour"
                  details="Used for buttons and highlights inside the puzzle."
                  value={form.accentColor}
                  onChange={(event) =>
                    setField("accentColor", event.currentTarget.value)
                  }
                />

                <s-select
                  label="Shuffles allowed"
                  value={form.shuffleLimit}
                  onChange={(event) =>
                    setField("shuffleLimit", event.currentTarget.value)
                  }
                >
                  <s-option value="0">Unlimited</s-option>
                  <s-option value="1">1</s-option>
                  <s-option value="2">2</s-option>
                  <s-option value="3">3</s-option>
                  <s-option value="5">5</s-option>
                </s-select>

                <s-checkbox
                  label="Time limit"
                  details="Shoppers have to finish within the time you set."
                  checked={form.timeLimitSeconds !== ""}
                  onChange={(event) =>
                    // Cleared rather than zeroed when switched off: no limit and
                    // a limit of zero seconds are different things.
                    setField(
                      "timeLimitSeconds",
                      event.currentTarget.checked ? "120" : "",
                    )
                  }
                />

                {form.timeLimitSeconds !== "" ? (
                  <s-number-field
                    label="Seconds"
                    min={10}
                    step={5}
                    value={form.timeLimitSeconds}
                    onChange={(event) =>
                      setField("timeLimitSeconds", event.currentTarget.value)
                    }
                  />
                ) : null}

                <s-checkbox
                  label="Gift step"
                  details="After the puzzle, shoppers pick a gift instead of going straight to the reward."
                  checked={form.giftStep === "true"}
                  onChange={(event) =>
                    setField("giftStep", String(event.currentTarget.checked))
                  }
                />

                <s-checkbox
                  label="Surprise boxes"
                  details="Shows the gifts as closed boxes. Only one can be opened."
                  checked={form.giftBoxMode === "true"}
                  onChange={(event) =>
                    setField("giftBoxMode", String(event.currentTarget.checked))
                  }
                />
              </s-section>
            </s-stack>
          </s-grid-item>

          <s-grid-item>
            {/* Sticky so the preview stays in view while the (much taller)
                settings form scrolls beside it. The grid item stretches to the
                row's height, which is what gives the sticky element room to
                travel. */}
            <div style={{ position: "sticky", top: "1rem" }}>
              <s-section heading="Preview">
                <s-stack gap="base">
                  <s-text color="subdued">
                    This is how the puzzle will look in your store. The preview
                    opens exactly what a shopper sees, with the settings you
                    have here.
                  </s-text>
                  <PuzzlePreview
                    settings={{
                      imageUrl: form.imageUrl,
                      pieceCount: Number(form.pieceCount),
                      knobSize: Number(form.knobSize),
                      difficulty: form.difficulty,
                      trayPosition: form.trayPosition,
                      accentColor: form.accentColor,
                      timeLimitSeconds: form.timeLimitSeconds
                        ? Number(form.timeLimitSeconds)
                        : null,
                      shuffleLimit: Number(form.shuffleLimit),
                      giftStep: form.giftStep === "true",
                      giftBoxMode: form.giftBoxMode === "true",
                      badgeLabel: form.badgeLabel,
                      headline: form.headline,
                      description: form.description,
                    }}
                  />
                </s-stack>
              </s-section>
            </div>
          </s-grid-item>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

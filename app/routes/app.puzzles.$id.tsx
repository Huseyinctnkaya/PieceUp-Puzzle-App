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
    showGuide: form.get("showGuide") === "true",
    wrongPieceBehaviour: String(form.get("wrongPieceBehaviour") || "return") as
      "return" | "stay",
    // Empty means no limit, which is not the same as a limit of zero.
    timeLimitSeconds: form.get("timeLimitSeconds")
      ? Number(form.get("timeLimitSeconds"))
      : null,
    shuffleLimit: Number(form.get("shuffleLimit") || 0),
    showMoves: form.get("showMoves") === "true",
    rememberProgress: form.get("rememberProgress") === "true",
    confetti: form.get("confetti") === "true",
    rewardType: String(form.get("rewardType") || "PERCENTAGE_DISCOUNT") as
      "PERCENTAGE_DISCOUNT" | "FREE_PRODUCT_DISCOUNT",
    rewardValue: String(form.get("rewardValue") || "10"),
    triggerMode: String(form.get("triggerMode") || "BUTTON") as
      "BUTTON" | "AUTO" | "BOTH",
    triggerPage: String(form.get("triggerPage") || "ALL") as
      "CART" | "PRODUCT" | "ALL",
    triggerDelaySeconds: form.get("triggerDelaySeconds")
      ? Number(form.get("triggerDelaySeconds"))
      : null,
    playLimitType: String(form.get("playLimitType") || "ONCE_EVER") as
      "ONCE_EVER" | "ONCE_PER_DAY",
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
      showGuide: String(config?.showGuide ?? true),
      wrongPieceBehaviour: config?.wrongPieceBehaviour ?? "return",
      timeLimitSeconds:
        config?.timeLimitSeconds == null ? "" : String(config.timeLimitSeconds),
      shuffleLimit: String(config?.shuffleLimit ?? 0),
      showMoves: String(config?.showMoves ?? true),
      rememberProgress: String(config?.rememberProgress ?? true),
      confetti: String(config?.confetti ?? true),
      rewardType: config?.rewardType ?? "PERCENTAGE_DISCOUNT",
      rewardValue: config?.rewardValue ?? "10",
      triggerMode: config?.triggerMode ?? "BUTTON",
      triggerPage: config?.triggerPage ?? "ALL",
      playLimitType: config?.playLimitType ?? "ONCE_EVER",
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

              <s-select
                label="Pieces"
                value={form.pieceCount}
                onChange={(event) =>
                  setField("pieceCount", event.currentTarget.value)
                }
              >
                <s-option value="4">4</s-option>
                <s-option value="6">6</s-option>
                <s-option value="9">9</s-option>
                <s-option value="12">12</s-option>
                <s-option value="16">16</s-option>
              </s-select>

              <s-select
                label="Reward type"
                value={form.rewardType}
                onChange={(event) =>
                  setField("rewardType", event.currentTarget.value)
                }
              >
                <s-option value="PERCENTAGE_DISCOUNT">
                  Percentage discount
                </s-option>
                <s-option value="FREE_PRODUCT_DISCOUNT">
                  Free product discount
                </s-option>
              </s-select>

              <s-text-field
                label={
                  form.rewardType === "PERCENTAGE_DISCOUNT"
                    ? "Discount percentage"
                    : "Product ID"
                }
                value={form.rewardValue}
                onChange={(event) =>
                  setField("rewardValue", event.currentTarget.value)
                }
              />

              <s-select
                label="Trigger"
                value={form.triggerMode}
                onChange={(event) =>
                  setField("triggerMode", event.currentTarget.value)
                }
              >
                <s-option value="BUTTON">Button only</s-option>
                <s-option value="AUTO">Opens automatically</s-option>
                <s-option value="BOTH">Both</s-option>
              </s-select>

              <s-select
                label="Show on"
                value={form.triggerPage}
                onChange={(event) =>
                  setField("triggerPage", event.currentTarget.value)
                }
              >
                <s-option value="ALL">All pages</s-option>
                <s-option value="CART">Cart</s-option>
                <s-option value="PRODUCT">Product</s-option>
              </s-select>

              <s-select
                label="Play limit"
                value={form.playLimitType}
                onChange={(event) =>
                  setField("playLimitType", event.currentTarget.value)
                }
              >
                <s-option value="ONCE_EVER">Once per person</s-option>
                <s-option value="ONCE_PER_DAY">Once per day</s-option>
              </s-select>
            </s-section>

            <s-section heading="Gameplay">
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
                label="Tray position"
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

              <s-select
                label="Wrong piece"
                details="What happens when a shopper drops a piece somewhere it doesn't belong."
                value={form.wrongPieceBehaviour}
                onChange={(event) =>
                  setField("wrongPieceBehaviour", event.currentTarget.value)
                }
              >
                <s-option value="return">Goes back to the tray</s-option>
                <s-option value="stay">Stays where it was dropped</s-option>
              </s-select>

              <s-number-field
                label="Time limit (seconds)"
                details="Leave empty for no time limit."
                min={10}
                step={5}
                value={form.timeLimitSeconds}
                onChange={(event) =>
                  setField("timeLimitSeconds", event.currentTarget.value)
                }
              />

              <s-number-field
                label="Shuffles allowed"
                details="0 means the shopper can reshuffle as often as they like."
                min={0}
                max={20}
                step={1}
                value={form.shuffleLimit}
                onChange={(event) =>
                  setField("shuffleLimit", event.currentTarget.value)
                }
              />

              <s-color-field
                label="Accent colour"
                details="Used for buttons and highlights inside the puzzle."
                value={form.accentColor}
                onChange={(event) =>
                  setField("accentColor", event.currentTarget.value)
                }
              />

              <s-checkbox
                label="Show a faded guide image on the board"
                details="Turn off to make the puzzle harder."
                checked={form.showGuide === "true"}
                onChange={(event) =>
                  setField("showGuide", String(event.currentTarget.checked))
                }
              />

              <s-checkbox
                label="Show the move counter"
                checked={form.showMoves === "true"}
                onChange={(event) =>
                  setField("showMoves", String(event.currentTarget.checked))
                }
              />

              <s-checkbox
                label="Remember progress"
                details="Shoppers pick up where they left off after a refresh."
                checked={form.rememberProgress === "true"}
                onChange={(event) =>
                  setField(
                    "rememberProgress",
                    String(event.currentTarget.checked),
                  )
                }
              />

              <s-checkbox
                label="Celebrate with confetti"
                checked={form.confetti === "true"}
                onChange={(event) =>
                  setField("confetti", String(event.currentTarget.checked))
                }
              />
            </s-section>
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
                    opens exactly what a shopper sees, with the settings you have here.
                  </s-text>
                  <PuzzlePreview
                    settings={{
                      imageUrl: form.imageUrl,
                      pieceCount: Number(form.pieceCount),
                      knobSize: Number(form.knobSize),
                      difficulty: form.difficulty,
                      trayPosition: form.trayPosition,
                      accentColor: form.accentColor,
                      showGuide: form.showGuide === "true",
                      wrongPieceBehaviour: form.wrongPieceBehaviour,
                      timeLimitSeconds: form.timeLimitSeconds
                        ? Number(form.timeLimitSeconds)
                        : null,
                      shuffleLimit: Number(form.shuffleLimit),
                      showMoves: form.showMoves === "true",
                      rememberProgress: form.rememberProgress === "true",
                      confetti: form.confetti === "true",
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

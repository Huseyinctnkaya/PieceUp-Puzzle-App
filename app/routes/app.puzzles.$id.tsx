import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { CallbackEvent } from "@shopify/polaris-types";
import { authenticate } from "../shopify.server";
import {
  AlreadyActiveError,
  createPuzzleConfig,
  getPuzzleConfigById,
  updatePuzzleConfig,
} from "../models/puzzleConfig.server";
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
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const isNew = params.id === "new";

  const input = {
    name: String(form.get("name") || "Puzzle"),
    imageUrl: String(form.get("imageUrl") || ""),
    pieceCount: Number(form.get("pieceCount") || 9),
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
    const saved = isNew
      ? await createPuzzleConfig(session.shop, input)
      : await updatePuzzleConfig(session.shop, params.id!, input);
    return { saved: true, id: saved.id };
  } catch (error) {
    if (error instanceof AlreadyActiveError) {
      return { error: "already_active", activeName: error.activeName };
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

  const [name, setName] = useState(config?.name ?? "");
  const [imageUrl, setImageUrl] = useState(config?.imageUrl ?? "");
  const [pieceCount, setPieceCount] = useState(String(config?.pieceCount ?? 9));
  const [rewardType, setRewardType] = useState(
    config?.rewardType ?? "PERCENTAGE_DISCOUNT",
  );
  const [rewardValue, setRewardValue] = useState(config?.rewardValue ?? "10");
  const [triggerMode, setTriggerMode] = useState(
    config?.triggerMode ?? "BUTTON",
  );
  const [triggerPage, setTriggerPage] = useState(config?.triggerPage ?? "ALL");
  const [playLimitType, setPlayLimitType] = useState(
    config?.playLimitType ?? "ONCE_EVER",
  );
  const [isActive, setIsActive] = useState(config?.isActive ?? false);

  useEffect(() => {
    if (
      uploadFetcher.data &&
      typeof uploadFetcher.data === "object" &&
      "imageUrl" in uploadFetcher.data
    ) {
      setImageUrl(uploadFetcher.data.imageUrl);
    } else if (
      uploadFetcher.data &&
      typeof uploadFetcher.data === "object" &&
      "error" in uploadFetcher.data
    ) {
      shopify.toast.show("Görsel yüklenemedi", { isError: true });
    }
  }, [uploadFetcher.data, shopify]);

  useEffect(() => {
    if (!saveFetcher.data || typeof saveFetcher.data !== "object") return;
    if ("saved" in saveFetcher.data && saveFetcher.data.saved) {
      shopify.toast.show("Puzzle kaydedildi");
      if (isNew)
        navigate(`/app/puzzles/${saveFetcher.data.id}`, { replace: true });
    } else if ("error" in saveFetcher.data) {
      if (saveFetcher.data.error === "already_active") {
        shopify.toast.show(
          `Zaten aktif bir puzzle'ınız var: ${saveFetcher.data.activeName}. Önce onu pasife alın.`,
          { isError: true },
        );
      } else {
        shopify.toast.show("Kaydedilemedi", { isError: true });
      }
    }
  }, [saveFetcher.data, shopify, isNew, navigate]);

  const uploadError =
    uploadFetcher.data &&
    typeof uploadFetcher.data === "object" &&
    "error" in uploadFetcher.data
      ? String(uploadFetcher.data.error)
      : undefined;

  function handleDrop(event: CallbackEvent<"s-drop-zone">) {
    const file = event.currentTarget.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    uploadFetcher.submit(formData, {
      method: "post",
      action: "/app/upload",
      encType: "multipart/form-data",
    });
  }

  function handleSave() {
    saveFetcher.submit(
      {
        name,
        imageUrl,
        pieceCount,
        rewardType,
        rewardValue,
        triggerMode,
        triggerPage,
        playLimitType,
        isActive: String(isActive),
      },
      { method: "post" },
    );
  }

  return (
    <s-page>
      <s-stack gap="large">
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-heading>{isNew ? "Yeni puzzle" : "Puzzle düzenle"}</s-heading>
          <s-button href="/app/puzzles">Puzzle&apos;lara dön</s-button>
        </s-grid>

        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-grid-item>
            <s-section heading="Puzzle bilgileri">
              <s-text-field
                label="Puzzle adı"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
              />

              <s-drop-zone
                label="Puzzle görseli"
                accept="image/jpeg,image/png,image/webp"
                error={uploadError}
                onChange={handleDrop}
              >
                {imageUrl ? (
                  <s-thumbnail
                    src={imageUrl}
                    alt="Puzzle görseli"
                    size="large"
                  />
                ) : null}
              </s-drop-zone>

              <s-select
                label="Parça sayısı"
                value={pieceCount}
                onChange={(event) => setPieceCount(event.currentTarget.value)}
              >
                <s-option value="4">4</s-option>
                <s-option value="6">6</s-option>
                <s-option value="9">9</s-option>
                <s-option value="12">12</s-option>
                <s-option value="16">16</s-option>
              </s-select>

              <s-select
                label="Ödül tipi"
                value={rewardType}
                onChange={(event) => setRewardType(event.currentTarget.value)}
              >
                <s-option value="PERCENTAGE_DISCOUNT">Yüzde indirim</s-option>
                <s-option value="FREE_PRODUCT_DISCOUNT">
                  Ücretsiz ürün indirimi
                </s-option>
              </s-select>

              <s-text-field
                label={
                  rewardType === "PERCENTAGE_DISCOUNT"
                    ? "İndirim yüzdesi"
                    : "Ürün ID'si"
                }
                value={rewardValue}
                onChange={(event) => setRewardValue(event.currentTarget.value)}
              />

              <s-select
                label="Tetikleme modu"
                value={triggerMode}
                onChange={(event) => setTriggerMode(event.currentTarget.value)}
              >
                <s-option value="BUTTON">Sadece buton</s-option>
                <s-option value="AUTO">Otomatik açılır</s-option>
                <s-option value="BOTH">İkisi de</s-option>
              </s-select>

              <s-select
                label="Hangi sayfada gösterilsin"
                value={triggerPage}
                onChange={(event) => setTriggerPage(event.currentTarget.value)}
              >
                <s-option value="ALL">Tüm sayfalar</s-option>
                <s-option value="CART">Sepet</s-option>
                <s-option value="PRODUCT">Ürün</s-option>
              </s-select>

              <s-select
                label="Oynama sınırı"
                value={playLimitType}
                onChange={(event) =>
                  setPlayLimitType(event.currentTarget.value)
                }
              >
                <s-option value="ONCE_EVER">Kişi başı bir kez</s-option>
                <s-option value="ONCE_PER_DAY">Günde bir kez</s-option>
              </s-select>

              <s-checkbox
                label="Aktif"
                checked={isActive}
                onChange={(event) => setIsActive(event.currentTarget.checked)}
              ></s-checkbox>

              <s-button
                variant="primary"
                onClick={handleSave}
                loading={saveFetcher.state !== "idle"}
              >
                Kaydet
              </s-button>
            </s-section>
          </s-grid-item>

          <s-grid-item>
            <s-section heading="Önizleme">
              <s-stack gap="base">
                <s-text color="subdued">
                  Puzzle mağazanızda bu şekilde görünecek. Görseli veya parça
                  sayısını değiştirdiğinizde önizleme anında güncellenir.
                </s-text>
                <PuzzlePreview
                  imageUrl={imageUrl}
                  pieceCount={Number(pieceCount)}
                />
              </s-stack>
            </s-section>
          </s-grid-item>
        </s-grid>
      </s-stack>
    </s-page>
  );
}

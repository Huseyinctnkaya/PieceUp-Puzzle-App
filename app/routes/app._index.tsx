import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { CallbackEvent } from "@shopify/polaris-types";
import { authenticate } from "../shopify.server";
import { getPuzzleConfig, upsertPuzzleConfig } from "../models/puzzleConfig.server";
import type { action as uploadAction } from "./app.upload";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const config = await getPuzzleConfig(session.shop);
  return { config };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  await upsertPuzzleConfig(session.shop, {
    imageUrl: String(form.get("imageUrl") || ""),
    pieceCount: Number(form.get("pieceCount") || 9),
    rewardType: String(form.get("rewardType") || "PERCENTAGE_DISCOUNT") as
      | "PERCENTAGE_DISCOUNT"
      | "FREE_PRODUCT_DISCOUNT",
    rewardValue: String(form.get("rewardValue") || "10"),
    triggerMode: String(form.get("triggerMode") || "BUTTON") as "BUTTON" | "AUTO" | "BOTH",
    triggerPage: String(form.get("triggerPage") || "ALL") as "CART" | "PRODUCT" | "ALL",
    triggerDelaySeconds: form.get("triggerDelaySeconds")
      ? Number(form.get("triggerDelaySeconds"))
      : null,
    playLimitType: String(form.get("playLimitType") || "ONCE_EVER") as
      | "ONCE_EVER"
      | "ONCE_PER_DAY",
    isActive: form.get("isActive") === "true",
    startDate: null,
    endDate: null,
  });

  return { saved: true };
}

export default function SettingsPage() {
  const { config } = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();
  const uploadFetcher = useFetcher<typeof uploadAction>();
  const shopify = useAppBridge();

  const [imageUrl, setImageUrl] = useState(config?.imageUrl ?? "");
  const [pieceCount, setPieceCount] = useState(String(config?.pieceCount ?? 9));
  const [rewardType, setRewardType] = useState(config?.rewardType ?? "PERCENTAGE_DISCOUNT");
  const [rewardValue, setRewardValue] = useState(config?.rewardValue ?? "10");
  const [triggerMode, setTriggerMode] = useState(config?.triggerMode ?? "BUTTON");
  const [triggerPage, setTriggerPage] = useState(config?.triggerPage ?? "ALL");
  const [playLimitType, setPlayLimitType] = useState(config?.playLimitType ?? "ONCE_EVER");
  const [isActive, setIsActive] = useState(config?.isActive ?? false);

  // uploadFetcher.data / saveFetcher.data are only safe to `in`-check once we
  // know they're actual objects: a non-JSON `Content-Type` on the upload
  // route's error Response (fixed, but guarded here as defense in depth)
  // would otherwise hand back a raw string and make `"x" in data` throw.
  useEffect(() => {
    if (uploadFetcher.data && typeof uploadFetcher.data === "object" && "imageUrl" in uploadFetcher.data) {
      setImageUrl(uploadFetcher.data.imageUrl);
    } else if (uploadFetcher.data && typeof uploadFetcher.data === "object" && "error" in uploadFetcher.data) {
      shopify.toast.show("Görsel yüklenemedi", { isError: true });
    }
  }, [uploadFetcher.data, shopify]);

  useEffect(() => {
    if (
      saveFetcher.data &&
      typeof saveFetcher.data === "object" &&
      "saved" in saveFetcher.data &&
      saveFetcher.data.saved
    ) {
      shopify.toast.show("Ayarlar kaydedildi");
    }
  }, [saveFetcher.data, shopify]);

  const uploadError =
    uploadFetcher.data && typeof uploadFetcher.data === "object" && "error" in uploadFetcher.data
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
    <s-page heading="PieceUp Ayarları">
      <s-section heading="Puzzle görseli">
        <s-drop-zone
          label="Puzzle görseli"
          accept="image/jpeg,image/png,image/webp"
          error={uploadError}
          onChange={handleDrop}
        >
          {imageUrl ? <s-thumbnail src={imageUrl} alt="Puzzle görseli" size="large" /> : null}
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
          <s-option value="FREE_PRODUCT_DISCOUNT">Ücretsiz ürün indirimi</s-option>
        </s-select>

        <s-text-field
          label={rewardType === "PERCENTAGE_DISCOUNT" ? "İndirim yüzdesi" : "Ürün ID'si"}
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
          onChange={(event) => setPlayLimitType(event.currentTarget.value)}
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
    </s-page>
  );
}

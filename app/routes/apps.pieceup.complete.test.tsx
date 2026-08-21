import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shopify.server", () => ({
  authenticate: { public: { appProxy: vi.fn() } },
}));
vi.mock("../models/puzzleConfig.server", () => ({
  getActivePuzzleConfig: vi.fn(),
}));
vi.mock("../models/playRecord.server", () => ({
  hasAlreadyPlayed: vi.fn(),
  recordCompletion: vi.fn(),
}));
vi.mock("../services/rewardService.server", () => ({
  issueRewardCode: vi.fn(),
}));

import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";
import { hasAlreadyPlayed, recordCompletion } from "../models/playRecord.server";
import { issueRewardCode } from "../services/rewardService.server";
import { action } from "./apps.pieceup.complete";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate.public.appProxy).mockResolvedValue({
    session: { shop: "shop-a.myshopify.com" },
    admin: {},
  } as any);
  vi.mocked(getActivePuzzleConfig).mockResolvedValue({
    rewardType: "PERCENTAGE_DISCOUNT",
    rewardValue: "10",
    playLimitType: "ONCE_EVER",
  } as any);
  vi.mocked(hasAlreadyPlayed).mockResolvedValue(false);
  vi.mocked(issueRewardCode).mockResolvedValue("PIECEUP-ABC123");
  vi.mocked(recordCompletion).mockResolvedValue(undefined);
});

function makeRequest(body: unknown) {
  return new Request("https://shop.example/apps/pieceup/complete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("apps.pieceup.complete action", () => {
  it("returns a discount code on a fresh completion", async () => {
    const response = await action({ request: makeRequest({ identityKey: "device:xyz" }) } as any);
    const json = await response.json();
    expect(json.discountCode).toBe("PIECEUP-ABC123");
  });

  it("returns 409 when the identity already played", async () => {
    vi.mocked(hasAlreadyPlayed).mockResolvedValue(true);
    const response = await action({ request: makeRequest({ identityKey: "device:xyz" }) } as any);
    expect(response.status).toBe(409);
  });

  it("returns 502 without recording a play when reward issuance fails", async () => {
    vi.mocked(issueRewardCode).mockRejectedValue(new Error("api down"));
    const response = await action({ request: makeRequest({ identityKey: "device:xyz" }) } as any);
    expect(response.status).toBe(502);
    expect(recordCompletion).not.toHaveBeenCalled();
  });
});

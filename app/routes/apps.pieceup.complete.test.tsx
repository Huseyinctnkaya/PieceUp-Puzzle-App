import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";

vi.mock("../shopify.server", () => ({
  authenticate: { public: { appProxy: vi.fn() } },
}));
vi.mock("../models/puzzleConfig.server", () => ({
  getActivePuzzleConfig: vi.fn(),
}));
vi.mock("../models/playRecord.server", () => ({
  hasAlreadyPlayed: vi.fn(),
  recordCompletion: vi.fn(),
  countRewardsThisMonth: vi.fn(),
}));
vi.mock("../services/rewardService.server", () => ({
  issueRewardCode: vi.fn(),
}));
vi.mock("../services/billing.server", () => ({
  getSubscription: vi.fn(),
}));
vi.mock("../models/puzzleStat.server", () => ({
  recordStat: vi.fn(),
}));

import { authenticate } from "../shopify.server";
import { getActivePuzzleConfig } from "../models/puzzleConfig.server";
import {
  countRewardsThisMonth,
  hasAlreadyPlayed,
  recordCompletion,
} from "../models/playRecord.server";
import { issueRewardCode } from "../services/rewardService.server";
import { getSubscription } from "../services/billing.server";
import { recordStat } from "../models/puzzleStat.server";
import { action } from "./apps.pieceup.complete";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authenticate.public.appProxy).mockResolvedValue({
    session: { shop: "shop-a.myshopify.com" },
    admin: {},
  } as unknown as Awaited<ReturnType<typeof authenticate.public.appProxy>>);
  vi.mocked(getActivePuzzleConfig).mockResolvedValue({
    id: "puzzle-1",
    rewardType: "PERCENTAGE_DISCOUNT",
    rewardValue: "10",
    playLimitType: "ONCE_EVER",
  } as unknown as Awaited<ReturnType<typeof getActivePuzzleConfig>>);
  vi.mocked(hasAlreadyPlayed).mockResolvedValue(false);
  vi.mocked(issueRewardCode).mockResolvedValue("PIECEUP-ABC123");
  vi.mocked(recordCompletion).mockResolvedValue(undefined);
  // Default to the Free plan's real allowance, well under it.
  vi.mocked(getSubscription).mockResolvedValue({
    plan: { monthlyRewardLimit: 100, puzzleLimit: 1 },
    status: "ACTIVE",
    trialDays: null,
    currentPeriodEnd: null,
  } as unknown as Awaited<ReturnType<typeof getSubscription>>);
  vi.mocked(countRewardsThisMonth).mockResolvedValue(0);
  vi.mocked(recordStat).mockResolvedValue(undefined);
});

function makeRequest(body: unknown) {
  return new Request("https://shop.example/apps/pieceup/complete", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// The route only ever reads `request` off its args, so the other fields of
// ActionFunctionArgs are irrelevant here — this keeps the casts in one place
// instead of on every call.
function invoke(body: unknown) {
  return action({
    request: makeRequest(body),
  } as unknown as ActionFunctionArgs);
}

describe("apps.pieceup.complete action", () => {
  it("returns a discount code on a fresh completion", async () => {
    const response = await invoke({ identityKey: "device:xyz" });
    const json = await response.json();
    expect(json.discountCode).toBe("PIECEUP-ABC123");
  });

  it("returns 409 when the identity already played", async () => {
    vi.mocked(hasAlreadyPlayed).mockResolvedValue(true);
    const response = await invoke({ identityKey: "device:xyz" });
    expect(response.status).toBe(409);
  });

  it("returns 502 without recording a play when reward issuance fails", async () => {
    vi.mocked(issueRewardCode).mockRejectedValue(new Error("api down"));
    const response = await invoke({ identityKey: "device:xyz" });
    expect(response.status).toBe(502);
    expect(recordCompletion).not.toHaveBeenCalled();
  });

  it("refuses to issue a reward once the plan's monthly allowance is spent", async () => {
    vi.mocked(countRewardsThisMonth).mockResolvedValue(100);
    const response = await invoke({ identityKey: "device:xyz" });
    expect(response.status).toBe(402);
    expect((await response.json()).error).toBe("reward_limit_reached");
    // The important part: no real discount code was minted and nothing was
    // recorded, so hitting the cap costs the merchant nothing.
    expect(issueRewardCode).not.toHaveBeenCalled();
    expect(recordCompletion).not.toHaveBeenCalled();
    // But the finish still counts, and the reward doesn't — that gap is how
    // the stats page shows the merchant what the limit cost them.
    expect(recordStat).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      "puzzle-1",
      "completed",
    );
    expect(recordStat).not.toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      "puzzle-1",
      "rewarded",
    );
  });

  it("counts both completion and reward on a successful play", async () => {
    await invoke({ identityKey: "device:xyz" });
    expect(recordStat).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      "puzzle-1",
      "completed",
    );
    expect(recordStat).toHaveBeenCalledWith(
      "shop-a.myshopify.com",
      "puzzle-1",
      "rewarded",
    );
  });

  it("counts nothing when the identity already played", async () => {
    vi.mocked(hasAlreadyPlayed).mockResolvedValue(true);
    await invoke({ identityKey: "device:xyz" });
    // A replay attempt isn't a fresh completion; counting it would inflate
    // the funnel with traffic that never played.
    expect(recordStat).not.toHaveBeenCalled();
  });

  it("still issues a reward on an unmetered plan", async () => {
    vi.mocked(getSubscription).mockResolvedValue({
      plan: { monthlyRewardLimit: null, puzzleLimit: null },
      status: "ACTIVE",
      trialDays: null,
      currentPeriodEnd: null,
    } as unknown as Awaited<ReturnType<typeof getSubscription>>);
    vi.mocked(countRewardsThisMonth).mockResolvedValue(50_000);
    const response = await invoke({ identityKey: "device:xyz" });
    expect(response.status).toBe(200);
    expect((await response.json()).discountCode).toBe("PIECEUP-ABC123");
  });
});

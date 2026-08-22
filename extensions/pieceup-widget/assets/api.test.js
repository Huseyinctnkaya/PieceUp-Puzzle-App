import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchConfig, fetchStatus, submitCompletion } from "./api.js";

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("fetchConfig", () => {
  it("returns the config object from the response", async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ config: { pieceCount: 9 } }) });
    const config = await fetchConfig();
    expect(config.pieceCount).toBe(9);
  });
});

describe("fetchStatus", () => {
  it("returns alreadyPlayed from the response", async () => {
    global.fetch.mockResolvedValue({ json: async () => ({ alreadyPlayed: true }) });
    expect(await fetchStatus("device:abc")).toBe(true);
  });
});

describe("submitCompletion", () => {
  it("returns the discount code on success", async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ discountCode: "PIECEUP-ABC123" }) });
    const code = await submitCompletion("device:abc");
    expect(code).toBe("PIECEUP-ABC123");
  });

  it("throws when the server reports already_played", async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "already_played" }) });
    await expect(submitCompletion("device:abc")).rejects.toThrow("already_played");
  });
});

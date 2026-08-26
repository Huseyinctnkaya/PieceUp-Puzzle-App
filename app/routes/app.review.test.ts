import { describe, it, expect, vi } from "vitest";

// The route imports the Shopify adapter, which refuses to initialise without
// app credentials in the environment. Nothing here exercises the loader.
vi.mock("../shopify.server", () => ({
  authenticate: { admin: async () => ({}) },
}));

const { reviewDeclineMessage, REVIEW_DECLINE_CODES } = await import(
  "./app.review"
);

describe("reviewDeclineMessage", () => {
  it("says nothing when the modal is already on screen", () => {
    expect(reviewDeclineMessage("already-open")).toBeNull();
    expect(reviewDeclineMessage("open-in-progress")).toBeNull();
  });

  it("says nothing when the merchant dismissed the modal themselves", () => {
    expect(reviewDeclineMessage("cancelled")).toBeNull();
  });

  it("thanks a merchant who has already reviewed the app", () => {
    expect(reviewDeclineMessage("already-reviewed")).toMatch(
      /already reviewed/i,
    );
  });

  it("explains the wait when Shopify is rate limiting the modal", () => {
    for (const code of [
      "cooldown-period",
      "annual-limit-reached",
      "recently-installed",
    ]) {
      expect(reviewDeclineMessage(code)).toMatch(/Shopify/i);
    }
  });

  it("points a merchant on the mobile app at the desktop admin", () => {
    expect(reviewDeclineMessage("mobile-app")).toMatch(/desktop/i);
  });

  it("gives every documented decline code a decision", () => {
    for (const code of REVIEW_DECLINE_CODES) {
      const message = reviewDeclineMessage(code);
      expect(message === null || message.length > 0).toBe(true);
    }
  });

  it("falls back to a message for codes Shopify has not documented yet", () => {
    // Silence here would leave the button looking broken, which is the one
    // outcome this page must never produce.
    expect(reviewDeclineMessage("some-future-code")).not.toBeNull();
  });
});

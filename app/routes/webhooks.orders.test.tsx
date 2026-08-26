import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (request: Request) => authenticateWebhook(request) },
}));

const recordAttributedOrder = vi.fn();
const markOrderCancelled = vi.fn();
vi.mock("../models/attributedOrder.server", () => ({
  recordAttributedOrder: (...args: unknown[]) => recordAttributedOrder(...args),
  markOrderCancelled: (...args: unknown[]) => markOrderCancelled(...args),
}));

const { action: onOrderCreated } = await import("./webhooks.orders.create");
const { action: onOrderCancelled } = await import(
  "./webhooks.orders.cancelled"
);

const SHOP = "shop-hooks.myshopify.com";

function order(overrides: Record<string, unknown> = {}) {
  return {
    admin_graphql_api_id: "gid://shopify/Order/1001",
    created_at: "2026-08-26T10:00:00Z",
    currency: "TRY",
    current_total_price_set: {
      shop_money: { amount: "414.95", currency_code: "TRY" },
    },
    discount_codes: [{ code: "PIECEUP-AAA111" }],
    ...overrides,
  };
}

function givenWebhook(topic: string, payload: unknown) {
  authenticateWebhook.mockResolvedValue({ shop: SHOP, topic, payload });
}

/** The handlers read everything off the authenticated result, not the body. */
const request = () => new Request("https://example.com/webhooks", { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("orders/create", () => {
  it("records revenue for an order that used a PieceUp code", async () => {
    givenWebhook("ORDERS_CREATE", order());

    const response = await onOrderCreated({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(recordAttributedOrder).toHaveBeenCalledWith(SHOP, {
      orderId: "gid://shopify/Order/1001",
      discountCode: "PIECEUP-AAA111",
      totalCents: 41495,
      currency: "TRY",
      orderedAt: new Date("2026-08-26T10:00:00Z"),
    });
  });

  it("writes nothing for an order that used no PieceUp code", async () => {
    // Every order in the shop arrives here. All but a few are none of our
    // business, and touching the database for them would be pure load.
    givenWebhook("ORDERS_CREATE", order({ discount_codes: [{ code: "SUMMER20" }] }));

    const response = await onOrderCreated({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(recordAttributedOrder).not.toHaveBeenCalled();
  });

  it("acknowledges the delivery even when the write fails", async () => {
    // A non-2xx makes Shopify retry for days and eventually disable the
    // subscription. One lost attribution is far cheaper than that.
    givenWebhook("ORDERS_CREATE", order());
    recordAttributedOrder.mockRejectedValueOnce(new Error("database is locked"));

    const response = await onOrderCreated({ request: request() } as never);

    expect(response.status).toBe(200);
  });
});

describe("orders/cancelled", () => {
  it("takes the cancelled order out of the shop's revenue", async () => {
    givenWebhook("ORDERS_CANCELLED", order({ cancelled_at: "2026-08-27T09:00:00Z" }));

    const response = await onOrderCancelled({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(markOrderCancelled).toHaveBeenCalledWith(
      SHOP,
      "gid://shopify/Order/1001",
    );
  });

  it("ignores a cancellation for an order it never recorded", async () => {
    givenWebhook("ORDERS_CANCELLED", order({ discount_codes: [] }));

    await onOrderCancelled({ request: request() } as never);

    expect(markOrderCancelled).not.toHaveBeenCalled();
  });

  it("acknowledges the delivery even when the update fails", async () => {
    givenWebhook("ORDERS_CANCELLED", order());
    markOrderCancelled.mockRejectedValueOnce(new Error("database is locked"));

    const response = await onOrderCancelled({ request: request() } as never);

    expect(response.status).toBe(200);
  });
});

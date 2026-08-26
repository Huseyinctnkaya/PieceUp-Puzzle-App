import { describe, it, expect, vi, beforeEach } from "vitest";

const authenticateWebhook = vi.fn();
vi.mock("../shopify.server", () => ({
  authenticate: { webhook: (request: Request) => authenticateWebhook(request) },
}));

const collectCustomerData = vi.fn();
const redactCustomer = vi.fn();
const deleteAllShopData = vi.fn();
vi.mock("../models/shopData.server", () => ({
  collectCustomerData: (...args: unknown[]) => collectCustomerData(...args),
  redactCustomer: (...args: unknown[]) => redactCustomer(...args),
  deleteAllShopData: (...args: unknown[]) => deleteAllShopData(...args),
}));

const { action: onDataRequest } = await import(
  "./webhooks.customers.data_request"
);
const { action: onCustomerRedact } = await import("./webhooks.customers.redact");
const { action: onShopRedact } = await import("./webhooks.shop.redact");
const { action: onUninstalled } = await import("./webhooks.app.uninstalled");

const SHOP = "shop-privacy.myshopify.com";
const request = () =>
  new Request("https://example.com/webhooks", { method: "POST" });

function givenWebhook(topic: string, payload: unknown) {
  authenticateWebhook.mockResolvedValue({ shop: SHOP, topic, payload });
}

beforeEach(() => {
  vi.clearAllMocks();
  collectCustomerData.mockResolvedValue([]);
});

describe("customers/data_request", () => {
  it("gathers what the app holds about the customer", async () => {
    givenWebhook("CUSTOMERS_DATA_REQUEST", { customer: { id: 451 } });

    const response = await onDataRequest({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(collectCustomerData).toHaveBeenCalledWith(SHOP, "451");
  });

  it("acknowledges a payload with no customer on it", async () => {
    givenWebhook("CUSTOMERS_DATA_REQUEST", {});

    const response = await onDataRequest({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(collectCustomerData).not.toHaveBeenCalled();
  });

  it("still acknowledges when the lookup fails", async () => {
    // A privacy webhook that keeps returning errors gets disabled by Shopify,
    // which is a worse compliance position than one missed lookup.
    givenWebhook("CUSTOMERS_DATA_REQUEST", { customer: { id: 451 } });
    collectCustomerData.mockRejectedValueOnce(new Error("database is locked"));

    const response = await onDataRequest({ request: request() } as never);

    expect(response.status).toBe(200);
  });
});

describe("customers/redact", () => {
  it("erases the customer's plays", async () => {
    givenWebhook("CUSTOMERS_REDACT", { customer: { id: 451 } });

    const response = await onCustomerRedact({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(redactCustomer).toHaveBeenCalledWith(SHOP, "451");
  });

  it("handles an id that arrives as a string", async () => {
    // Shopify sends the id as a number, but it is large enough that anything
    // re-serialising the payload may hand it over as a string instead.
    givenWebhook("CUSTOMERS_REDACT", { customer: { id: "451" } });

    await onCustomerRedact({ request: request() } as never);

    expect(redactCustomer).toHaveBeenCalledWith(SHOP, "451");
  });

  it("still acknowledges when the deletion fails", async () => {
    givenWebhook("CUSTOMERS_REDACT", { customer: { id: 451 } });
    redactCustomer.mockRejectedValueOnce(new Error("database is locked"));

    const response = await onCustomerRedact({ request: request() } as never);

    expect(response.status).toBe(200);
  });
});

describe("shop/redact", () => {
  it("erases everything belonging to the shop", async () => {
    givenWebhook("SHOP_REDACT", { shop_domain: SHOP });

    const response = await onShopRedact({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(deleteAllShopData).toHaveBeenCalledWith(SHOP);
  });

  it("still acknowledges when the deletion fails", async () => {
    givenWebhook("SHOP_REDACT", { shop_domain: SHOP });
    deleteAllShopData.mockRejectedValueOnce(new Error("database is locked"));

    const response = await onShopRedact({ request: request() } as never);

    expect(response.status).toBe(200);
  });
});

describe("app/uninstalled", () => {
  it("clears the shop rather than only its session", async () => {
    // The session alone used to be deleted here, which left every puzzle,
    // play, stat and attributed order behind indefinitely.
    givenWebhook("APP_UNINSTALLED", {});

    const response = await onUninstalled({ request: request() } as never);

    expect(response.status).toBe(200);
    expect(deleteAllShopData).toHaveBeenCalledWith(SHOP);
  });

  it("still acknowledges when the deletion fails", async () => {
    givenWebhook("APP_UNINSTALLED", {});
    deleteAllShopData.mockRejectedValueOnce(new Error("database is locked"));

    const response = await onUninstalled({ request: request() } as never);

    expect(response.status).toBe(200);
  });
});

import { describe, it, expect } from "vitest";
import { extractAttribution } from "./orderAttribution.server";

/**
 * A trimmed `orders/create` payload.
 *
 * Only the fields attribution reads. The real payload also carries the
 * shopper's email, name and address — deliberately absent here, because
 * nothing downstream is allowed to touch them.
 */
function payload(overrides: Record<string, unknown> = {}) {
  return {
    // Kept exactly as Shopify sends it, precision loss and all — that hazard
    // is the subject of a test below, and writing a "safe" id here would hide
    // the very thing the code has to defend against. Nothing reads this field.
    // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
    id: 820982911946154508,
    admin_graphql_api_id: "gid://shopify/Order/820982911946154508",
    created_at: "2026-08-26T10:30:00-04:00",
    currency: "TRY",
    current_total_price_set: {
      shop_money: { amount: "414.95", currency_code: "TRY" },
      presentment_money: { amount: "414.95", currency_code: "TRY" },
    },
    discount_codes: [{ code: "PIECEUP-7K2M9Q", amount: "46.10", type: "fixed" }],
    ...overrides,
  };
}

describe("extractAttribution", () => {
  it("pulls the order, code and total out of a PieceUp order", () => {
    const result = extractAttribution(payload());

    expect(result).toEqual({
      orderId: "gid://shopify/Order/820982911946154508",
      discountCode: "PIECEUP-7K2M9Q",
      totalCents: 41495,
      currency: "TRY",
      orderedAt: new Date("2026-08-26T10:30:00-04:00"),
    });
  });

  it("ignores an order that used no PieceUp code", () => {
    expect(
      extractAttribution(
        payload({ discount_codes: [{ code: "SUMMER20", amount: "20.00" }] }),
      ),
    ).toBeNull();
  });

  it("ignores an order with no discount at all", () => {
    expect(extractAttribution(payload({ discount_codes: [] }))).toBeNull();
  });

  it("matches the code however the shopper typed it", () => {
    // Shoppers paste codes in any case and Shopify echoes back what matched,
    // so the prefix test cannot be case-sensitive. The stored code keeps the
    // canonical upper case, which is what PlayRecord holds.
    const result = extractAttribution(
      payload({ discount_codes: [{ code: "pieceup-7k2m9q" }] }),
    );

    expect(result?.discountCode).toBe("PIECEUP-7K2M9Q");
  });

  it("picks the PieceUp code when it is stacked with the merchant's own", () => {
    const result = extractAttribution(
      payload({
        discount_codes: [
          { code: "FREESHIP" },
          { code: "PIECEUP-ABC123" },
          { code: "SUMMER20" },
        ],
      }),
    );

    expect(result?.discountCode).toBe("PIECEUP-ABC123");
  });

  it("prefers the current total, so an edited order reports what is owed now", () => {
    const result = extractAttribution(
      payload({
        current_total_price_set: {
          shop_money: { amount: "199.00", currency_code: "TRY" },
        },
      }),
    );

    expect(result?.totalCents).toBe(19900);
  });

  it("falls back to the order total when no current total is present", () => {
    const result = extractAttribution(
      payload({
        current_total_price_set: undefined,
        total_price_set: { shop_money: { amount: "50.25", currency_code: "USD" } },
      }),
    );

    expect(result?.totalCents).toBe(5025);
    expect(result?.currency).toBe("USD");
  });

  it("reads whole and single-decimal amounts exactly", () => {
    // Money arrives as a decimal string. Rounding it through a float is the
    // classic way to turn 414.95 into 41494 cents, so the parse is asserted
    // on the shapes Shopify actually sends.
    const cents = (amount: string) =>
      extractAttribution(
        payload({
          current_total_price_set: {
            shop_money: { amount, currency_code: "TRY" },
          },
        }),
      )?.totalCents;

    expect(cents("100")).toBe(10000);
    expect(cents("100.5")).toBe(10050);
    expect(cents("0.99")).toBe(99);
    expect(cents("1999.99")).toBe(199999);
  });

  it("refuses to fall back to the numeric id, which JSON.parse corrupts", () => {
    // Shopify order ids run to ~8.2e17, two orders of magnitude past
    // Number.MAX_SAFE_INTEGER, so JSON.parse silently rounds the last digits
    // away: 820982911946154508 comes back as ...500. Since orderId is the
    // uniqueness key, a rounded id can collide with a different real order and
    // overwrite its revenue. The string gid is the only exact source, so an
    // order without one is not attributed at all.
    expect(
      extractAttribution(payload({ admin_graphql_api_id: undefined })),
    ).toBeNull();
  });

  it("takes the gid exactly as sent, without reading the numeric id", () => {
    const result = extractAttribution(
      payload({ admin_graphql_api_id: "gid://shopify/Order/820982911946154508" }),
    );

    expect(result?.orderId).toBe("gid://shopify/Order/820982911946154508");
  });

  it("returns null rather than throwing on a payload it cannot read", () => {
    // A webhook handler that throws makes Shopify retry the same broken
    // delivery for days. Anything unreadable is simply not a PieceUp order.
    expect(extractAttribution(null)).toBeNull();
    expect(extractAttribution({})).toBeNull();
    expect(extractAttribution("nonsense")).toBeNull();
    expect(extractAttribution(payload({ discount_codes: "oops" }))).toBeNull();
    expect(
      extractAttribution(payload({ current_total_price_set: null, total_price: null })),
    ).toBeNull();
  });

  it("keeps no trace of the shopper's personal details", () => {
    // Order payloads carry protected customer data. The attribution record is
    // the only thing that survives this function, so it must be provably free
    // of it — this test is the guard on that promise.
    const result = extractAttribution(
      payload({
        contact_email: "shopper@example.com",
        email: "shopper@example.com",
        customer: { id: 1, first_name: "Ada", last_name: "Lovelace" },
        billing_address: { address1: "12 Baker St", city: "London" },
      }),
    );

    expect(JSON.stringify(result)).not.toContain("example.com");
    expect(JSON.stringify(result)).not.toContain("Ada");
    expect(JSON.stringify(result)).not.toContain("Baker");
  });
});

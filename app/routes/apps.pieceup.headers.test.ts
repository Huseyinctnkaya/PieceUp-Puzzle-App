import { describe, it, expect } from "vitest";
import { JSON_NO_STORE } from "./apps.pieceup.headers";

describe("JSON_NO_STORE", () => {
  it("tells every cache along the way not to keep the response", () => {
    // The config and status endpoints are GETs that answer differently per
    // shopper and change the moment a merchant edits a puzzle or stops an A/B
    // test. Without this, a browser or CDN is free to hold an old answer, and
    // the merchant sees a puzzle they have already switched away from.
    expect(JSON_NO_STORE["Cache-Control"]).toContain("no-store");
    expect(JSON_NO_STORE["Content-Type"]).toBe("application/json");
  });
});

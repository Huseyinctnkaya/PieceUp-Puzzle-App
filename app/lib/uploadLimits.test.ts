import { describe, it, expect } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  RECOMMENDED_IMAGE_PX,
  UPLOAD_ERROR_CODES,
  rejectionFor,
  uploadErrorMessage,
  uploadHint,
} from "./uploadLimits";

function fileOf(bytes: number, type: string) {
  return new File([new Uint8Array(bytes)], "puzzle.jpg", { type });
}

describe("rejectionFor", () => {
  it("accepts a supported image within the limit", () => {
    expect(rejectionFor(fileOf(1024, "image/jpeg"))).toBeNull();
    expect(rejectionFor(fileOf(1024, "image/png"))).toBeNull();
    expect(rejectionFor(fileOf(1024, "image/webp"))).toBeNull();
  });

  it("accepts a file exactly on the limit", () => {
    // The merchant-facing message names a number; a file of precisely that
    // size has to be allowed or the message is a lie.
    expect(rejectionFor(fileOf(MAX_UPLOAD_BYTES, "image/jpeg"))).toBeNull();
  });

  it("rejects a file over the limit", () => {
    expect(rejectionFor(fileOf(MAX_UPLOAD_BYTES + 1, "image/jpeg"))).toBe(
      "file_too_large",
    );
  });

  it("rejects a file that is not a supported image", () => {
    expect(rejectionFor(fileOf(1024, "application/pdf"))).toBe(
      "unsupported_file_type",
    );
  });

  it("reports size before type when a file fails both", () => {
    // Size is what the merchant can act on without re-exporting the file.
    expect(rejectionFor(fileOf(MAX_UPLOAD_BYTES + 1, "application/pdf"))).toBe(
      "file_too_large",
    );
  });
});

describe("uploadHint", () => {
  it("states the recommended dimensions", () => {
    expect(uploadHint()).toContain(String(RECOMMENDED_IMAGE_PX));
  });

  it("states the size limit, so a merchant learns it before being refused", () => {
    expect(uploadHint()).toContain("10 MB");
  });

  it("warns that a tall image makes a tall puzzle", () => {
    // The board keeps the image's aspect ratio, so a portrait screenshot
    // stretches the puzzle down the storefront page. That is the mistake the
    // hint exists to prevent, and pixels alone do not prevent it.
    expect(uploadHint()).toMatch(/tall/i);
  });
});

describe("uploadErrorMessage", () => {
  it("names the size limit so it cannot drift from the constant", () => {
    expect(uploadErrorMessage("file_too_large")).toContain("10 MB");
  });

  it("lists the formats a merchant can use", () => {
    const message = uploadErrorMessage("unsupported_file_type");
    expect(message).toMatch(/JPG/i);
    expect(message).toMatch(/PNG/i);
    expect(message).toMatch(/WebP/i);
  });

  it("gives every known code a sentence, never the bare code", () => {
    for (const code of UPLOAD_ERROR_CODES) {
      const message = uploadErrorMessage(code);
      expect(message).not.toBe(code);
      expect(message).toMatch(/[.!]$/);
    }
  });

  it("falls back to a sentence for a code it has never seen", () => {
    // A raw code reaching the merchant is the whole defect this guards.
    const message = uploadErrorMessage("something_new_from_shopify");
    expect(message).not.toContain("something_new_from_shopify");
    expect(message).toMatch(/[.!]$/);
  });
});

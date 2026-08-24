import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { uploadPuzzleImage } from "./imageUpload.server";

function jsonResponse(data: unknown) {
  return { json: async () => ({ data }) } as Response;
}

describe("uploadPuzzleImage", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  it("returns the CDN image URL once fileCreate resolves it immediately", async () => {
    const admin = {
      graphql: vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            stagedUploadsCreate: {
              stagedTargets: [
                {
                  url: "https://upload.example",
                  resourceUrl: "https://staged.example/x",
                  parameters: [],
                },
              ],
              userErrors: [],
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            fileCreate: {
              files: [
                {
                  id: "gid://shopify/MediaImage/1",
                  image: { url: "https://cdn.example/img.jpg" },
                },
              ],
              userErrors: [],
            },
          }),
        ),
    };

    const file = new File(["data"], "puzzle.jpg", { type: "image/jpeg" });
    const url = await uploadPuzzleImage(
      admin as unknown as AdminApiContext,
      file,
    );
    expect(url).toBe("https://cdn.example/img.jpg");
  });

  it("throws when the staged upload step reports user errors", async () => {
    const admin = {
      graphql: vi.fn().mockResolvedValueOnce(
        jsonResponse({
          stagedUploadsCreate: {
            stagedTargets: [],
            userErrors: [{ field: "input", message: "bad file" }],
          },
        }),
      ),
    };
    const file = new File(["data"], "puzzle.jpg", { type: "image/jpeg" });
    await expect(
      uploadPuzzleImage(admin as unknown as AdminApiContext, file),
    ).rejects.toThrow("Staged upload failed");
  });

  it("throws without calling the network when the file exceeds 5MB", async () => {
    const admin = { graphql: vi.fn() };
    const oversized = new File([new Uint8Array(6 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    await expect(
      uploadPuzzleImage(admin as unknown as AdminApiContext, oversized),
    ).rejects.toThrow("file_too_large");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("throws without calling the network when the mime type is unsupported", async () => {
    const admin = { graphql: vi.fn() };
    const file = new File(["data"], "puzzle.gif", { type: "image/gif" });
    await expect(
      uploadPuzzleImage(admin as unknown as AdminApiContext, file),
    ).rejects.toThrow("unsupported_file_type");
    expect(admin.graphql).not.toHaveBeenCalled();
  });
});

/**
 * What the puzzle image upload accepts, and what to tell a merchant when it
 * doesn't.
 *
 * Deliberately not in `imageUpload.server.ts`: the browser has to apply the
 * same limit before sending, and a `.server` module cannot be imported into
 * the client bundle. One definition here means the check the merchant meets
 * and the check the server enforces can never disagree.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Everything the upload can fail with, server or browser. */
export const UPLOAD_ERROR_CODES = [
  "file_too_large",
  "unsupported_file_type",
  "image_processing_timeout",
  "no_file",
  "upload_failed",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

/**
 * The width worth uploading, in pixels.
 *
 * The storefront board is capped at 620px wide by `.tahta` in the widget's
 * stylesheet — 590px or so once a side tray takes its share. Double that for
 * retina and anything beyond is bytes the shopper waits on for no visible
 * gain.
 */
export const RECOMMENDED_IMAGE_PX = 1200;

/** "10 MB" — derived, so the message cannot drift from the limit it states. */
const LIMIT_LABEL = `${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`;

/**
 * The line under the image picker, telling a merchant what to upload before
 * they upload the wrong thing.
 *
 * The shape warning earns its place: the board keeps the image's aspect ratio,
 * so a portrait screenshot makes a puzzle that runs down the whole storefront
 * page. Merchants hit this and read it as the app being broken, and a pixel
 * count on its own would not have warned them.
 */
export function uploadHint(): string {
  return (
    `Recommended ${RECOMMENDED_IMAGE_PX} × ${RECOMMENDED_IMAGE_PX} px. ` +
    `Square or landscape works best — a tall image makes a tall puzzle on ` +
    `your storefront. JPG, PNG or WebP, up to ${LIMIT_LABEL}.`
  );
}

/**
 * Why this file can't be uploaded, or null when it can.
 *
 * Size is checked first: a merchant whose file fails both can fix the size by
 * exporting smaller, whereas being told the format is wrong sends them to
 * convert a file that would still be rejected.
 */
export function rejectionFor(
  file: File,
): "file_too_large" | "unsupported_file_type" | null {
  if (file.size > MAX_UPLOAD_BYTES) return "file_too_large";
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number]))
    return "unsupported_file_type";
  return null;
}

const MESSAGES: Record<UploadErrorCode, string> = {
  file_too_large: `That image is larger than ${LIMIT_LABEL}. Please choose a smaller file.`,
  unsupported_file_type:
    "That file isn’t an image we can use. Choose a JPG, PNG or WebP.",
  image_processing_timeout:
    "Shopify is still processing the image. Give it a moment and try again.",
  no_file: "No file was selected.",
  upload_failed: "The image couldn’t be uploaded. Please try again.",
};

/**
 * A sentence a merchant can act on, for any code.
 *
 * An unrecognised code falls back to the generic message rather than being
 * shown as-is. Codes reach the drop zone straight from the server, so without
 * this a merchant sees `file_too_large` printed under the upload box — which
 * is what this whole module exists to stop.
 */
export function uploadErrorMessage(code: string): string {
  return MESSAGES[code as UploadErrorCode] ?? MESSAGES.upload_failed;
}

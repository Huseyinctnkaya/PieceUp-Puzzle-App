import { useCallback, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}

// TODO: the real handle lands here once the App Store listing is published.
// Until then this link 404s, same as the documentation link on the home page.
export const APP_STORE_LISTING_URL = "https://apps.shopify.com/pieceup";

/**
 * Every reason Shopify gives for not showing the review modal.
 * https://shopify.dev/docs/api/app-home/apis/user-interface-and-interactions/reviews-api
 */
export const REVIEW_DECLINE_CODES = [
  "mobile-app",
  "already-reviewed",
  "annual-limit-reached",
  "cooldown-period",
  "merchant-ineligible",
  "recently-installed",
  "already-open",
  "open-in-progress",
  "cancelled",
] as const;

export const REVIEW_UNAVAILABLE_MESSAGE =
  "The review modal couldn’t be opened just now. You can still leave a review on the App Store.";

/**
 * `null` means say nothing at all: the merchant either already has the modal
 * in front of them or closed it deliberately, and a banner would be noise —
 * in the `already-open` case it would appear behind the open modal and read
 * as an error.
 */
const DECLINE_MESSAGES: Record<string, string | null> = {
  "already-open": null,
  "open-in-progress": null,
  "cancelled": null,
  "already-reviewed":
    "You’ve already reviewed PieceUp — thank you. You can update your review on the App Store.",
  "cooldown-period":
    "Shopify limits how often the review modal can appear, so it won’t open right now.",
  "annual-limit-reached":
    "Shopify only shows the review modal a few times a year, and this store has reached that limit.",
  "recently-installed":
    "Shopify waits until an app has been installed for a while before showing the review modal.",
  "merchant-ineligible":
    "This store isn’t eligible for the review modal inside the admin.",
  "mobile-app":
    "The review modal isn’t available in the Shopify mobile app. Open PieceUp in the desktop admin to use it.",
};

/**
 * What to tell the merchant when `reviews.request()` declines.
 *
 * An unrecognised code falls back to a message rather than to silence. Shopify
 * can add codes at any time, and a button that visibly does nothing is the one
 * outcome this page has to avoid — the App Store link below it still works.
 */
export function reviewDeclineMessage(code: string): string | null {
  if (code in DECLINE_MESSAGES) return DECLINE_MESSAGES[code];
  return REVIEW_UNAVAILABLE_MESSAGE;
}

export default function ReviewPage() {
  const shopify = useAppBridge();
  const [notice, setNotice] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const requestReview = useCallback(async () => {
    setRequesting(true);
    setNotice(null);
    try {
      const result = await shopify.reviews.request();
      if (!result.success) setNotice(reviewDeclineMessage(result.code));
    } catch {
      setNotice(REVIEW_UNAVAILABLE_MESSAGE);
    } finally {
      setRequesting(false);
    }
  }, [shopify]);

  return (
    <s-page heading="Rate PieceUp">
      <s-section heading="Enjoying PieceUp?">
        <s-stack gap="base">
          <s-paragraph>
            Reviews help other merchants decide whether PieceUp is worth trying,
            and they tell us what to build next. It takes a minute.
          </s-paragraph>

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button
              variant="primary"
              onClick={requestReview}
              loading={requesting}
            >
              Write a review
            </s-button>
            <s-button
              variant="secondary"
              href={APP_STORE_LISTING_URL}
              target="_blank"
            >
              Open the App Store listing
            </s-button>
          </s-stack>

          {notice ? (
            <s-banner tone="info" heading="About the review modal">
              <s-paragraph>{notice}</s-paragraph>
            </s-banner>
          ) : null}
        </s-stack>
      </s-section>
    </s-page>
  );
}

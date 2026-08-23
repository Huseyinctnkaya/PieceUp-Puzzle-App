import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

// The Shopify CLI template ships a marketing splash page here ("A short
// heading about [your app]"). Clicking the app name in the embedded admin
// nav navigates to the app root, so that placeholder was showing up inside
// the admin. PieceUp has no public marketing page — the root always belongs
// to the embedded app, and an unauthenticated visitor is handed off to the
// normal login flow by /app's own authenticate.admin call.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app${url.search}`);
};

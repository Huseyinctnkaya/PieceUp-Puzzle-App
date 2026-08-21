import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { uploadPuzzleImage } from "../services/imageUpload.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "no_file" }), { status: 400 });
  }
  try {
    const imageUrl = await uploadPuzzleImage(admin, file);
    return { imageUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed";
    const status = message === "file_too_large" || message === "unsupported_file_type" ? 400 : 502;
    return new Response(JSON.stringify({ error: message }), { status });
  }
}

import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

/** The shape Shopify returns for GraphQL userErrors. */
type UserError = { field?: string[] | null; message: string };

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const STAGED_UPLOADS_CREATE = `#graphql
  mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = `#graphql
  mutation fileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        ... on MediaImage {
          image { url }
        }
      }
      userErrors { field message }
    }
  }
`;

const FILE_STATUS_QUERY = `#graphql
  query fileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        image { url }
      }
    }
  }
`;

export async function uploadPuzzleImage(
  admin: AdminApiContext,
  file: File,
): Promise<string> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("file_too_large");
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("unsupported_file_type");
  }

  const stagedResponse = await admin.graphql(STAGED_UPLOADS_CREATE, {
    variables: {
      input: [
        {
          filename: file.name,
          mimeType: file.type,
          fileSize: String(file.size),
          resource: "IMAGE",
          httpMethod: "POST",
        },
      ],
    },
  });
  const stagedJson = await stagedResponse.json();
  const target = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
  const stagedErrors = stagedJson.data?.stagedUploadsCreate?.userErrors ?? [];
  if (!target || stagedErrors.length > 0) {
    throw new Error(
      `Staged upload failed: ${stagedErrors.map((e: UserError) => e.message).join(", ")}`,
    );
  }

  const uploadForm = new FormData();
  for (const param of target.parameters) {
    uploadForm.append(param.name, param.value);
  }
  uploadForm.append("file", file);

  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `File upload to staged target failed: ${uploadResponse.status}`,
    );
  }

  const fileResponse = await admin.graphql(FILE_CREATE, {
    variables: {
      files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
    },
  });
  const fileJson = await fileResponse.json();
  const created = fileJson.data?.fileCreate?.files?.[0];
  const fileErrors = fileJson.data?.fileCreate?.userErrors ?? [];
  if (!created || fileErrors.length > 0) {
    throw new Error(
      `File creation failed: ${fileErrors.map((e: UserError) => e.message).join(", ")}`,
    );
  }

  let imageUrl: string | null = created.image?.url ?? null;
  for (let attempt = 0; !imageUrl && attempt < 3; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const statusResponse = await admin.graphql(FILE_STATUS_QUERY, {
      variables: { id: created.id },
    });
    const statusJson = await statusResponse.json();
    imageUrl = statusJson.data?.node?.image?.url ?? null;
  }

  if (!imageUrl) {
    throw new Error("image_processing_timeout");
  }
  return imageUrl;
}

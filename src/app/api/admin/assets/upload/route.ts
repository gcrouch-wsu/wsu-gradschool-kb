import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { isBlobEnabled, isSupportedDocumentType, isSupportedImageType } from "@/lib/blob";
import { logError } from "@/lib/log";
import { requireAdminMutation } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Client upload token endpoint for direct-to-Blob transfers (large files).
 * Browser calls `upload()` from `@vercel/blob/client` with this URL, then
 * posts the resulting blob URL to `/api/admin/assets/documents` or images.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  if (!isBlobEnabled()) {
    return NextResponse.json(
      { message: "Object storage is not configured (BLOB_READ_WRITE_TOKEN)." },
      { status: 501 },
    );
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, _clientPayload) => ({
        allowedContentTypes: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
        ],
        maximumSizeInBytes: 25 * 1024 * 1024,
        tokenPayload: JSON.stringify({ email: guard.session.email }),
      }),
      onUploadCompleted: async () => {
        // Asset records are created by a follow-up admin API call with the blob URL.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    logError(error, { route: "/api/admin/assets/upload", action: "blob_handle_upload" });
    const message = error instanceof Error ? error.message : "Could not authorize upload.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export function isAllowedDirectUploadType(contentType: string): boolean {
  return isSupportedDocumentType(contentType) || isSupportedImageType(contentType);
}

import { NextResponse } from "next/server";
import {
  isBlobEnabled,
  isSupportedDocumentType,
  isSupportedImageType,
  uploadAssetBlob,
} from "@/lib/blob";
import { addDraftReplacementVersion, getAssetAdminDetail } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { assetId } = await context.params;
  const detail = await getAssetAdminDetail(assetId);
  if (!detail) {
    return NextResponse.json({ message: "Asset not found." }, { status: 404 });
  }
  const denied = await requireKbAccess(guard.session, detail.asset.homeKbId);
  if (denied) {
    return denied;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "No file uploaded." }, { status: 400 });
  }

  const allowed =
    detail.asset.assetType === "image"
      ? isSupportedImageType(file.type)
      : isSupportedDocumentType(file.type);
  if (!allowed) {
    return NextResponse.json({ message: "Unsupported file type for this asset." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "File is larger than 25 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let body = "";
  if (isBlobEnabled()) {
    const url = await uploadAssetBlob(buffer, file.type);
    if (!url) {
      return NextResponse.json({ message: "Could not store file in object storage." }, { status: 500 });
    }
    body = url;
  } else {
    body = `data:${file.type.toLowerCase()};base64,${buffer.toString("base64")}`;
  }

  try {
    const result = await addDraftReplacementVersion(assetId, {
      body,
      mimeType: file.type.toLowerCase(),
      fileSizeBytes: file.size,
      originalFilename: file.name,
    });
    return NextResponse.json({
      ok: true,
      draft: result.draft,
      usages: detail.usages,
      message: "Draft replacement uploaded. Activate it when ready.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload replacement.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

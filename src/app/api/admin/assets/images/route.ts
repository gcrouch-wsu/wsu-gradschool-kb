import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { isBlobEnabled, isSupportedImageType, uploadImportImage } from "@/lib/blob";
import { createImageAsset, getKbById } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const kbId = formData?.get("kbId");
  const alt = formData?.get("alt");
  if (!(file instanceof File) || typeof kbId !== "string") {
    return NextResponse.json({ message: "Image file and knowledge base are required." }, { status: 400 });
  }
  const denied = await requireKbAccess(guard.session, kbId);
  if (denied) {
    return denied;
  }
  if (!isSupportedImageType(file.type)) {
    return NextResponse.json({ message: "Use a PNG, JPG, GIF, WebP, or SVG image." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Image is larger than 10 MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let body = "";
  if (isBlobEnabled()) {
    const url = await uploadImportImage(buffer, file.type);
    if (url) {
      body = url;
    }
  }
  if (!body) {
    body = `data:${file.type.toLowerCase()};base64,${buffer.toString("base64")}`;
  }

  try {
    const asset = await createImageAsset({
      body,
      fileSizeBytes: file.size,
      homeKbId: kbId,
      mimeType: file.type.toLowerCase(),
      originalFilename: file.name,
      title: file.name.replace(/\.[^.]+$/, ""),
    });
    await recordAuditEvent({
      session: guard.session,
      action: "asset.created",
      entityType: "asset",
      entityId: asset.id,
      entityLabel: asset.title,
      kbId: asset.homeKbId,
      details: { assetType: asset.assetType, filename: file.name },
    });
    const kb = await getKbById(asset.homeKbId);
    const url = kb ? `/kb/${kb.slug}/files/${asset.slug}` : null;
    return NextResponse.json({
      ok: true,
      asset,
      alt: typeof alt === "string" ? alt : "",
      url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload image.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { isBlobEnabled, isSupportedDocumentType, isTrustedAssetUrl, uploadAssetBlob } from "@/lib/blob";
import { createManagedAsset, getKbById } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const contentType = request.headers.get("content-type") ?? "";

  // Direct-to-Blob completion: client already uploaded bytes; we only register the asset.
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as {
      kbId?: unknown;
      title?: unknown;
      description?: unknown;
      blobUrl?: unknown;
      mimeType?: unknown;
      originalFilename?: unknown;
      fileSizeBytes?: unknown;
      tags?: unknown;
    } | null;
    const kbId = typeof body?.kbId === "string" ? body.kbId : "";
    const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType.toLowerCase() : "";
    const originalFilename =
      typeof body?.originalFilename === "string" ? body.originalFilename : "document";
    const fileSizeBytes =
      typeof body?.fileSizeBytes === "number" && Number.isFinite(body.fileSizeBytes)
        ? body.fileSizeBytes
        : 0;
    if (!kbId || !blobUrl || !mimeType) {
      return NextResponse.json(
        { message: "kbId, blobUrl, and mimeType are required for direct uploads." },
        { status: 400 },
      );
    }
    if (!isTrustedAssetUrl(blobUrl)) {
      return NextResponse.json({ message: "blobUrl must be a Vercel Blob URL." }, { status: 400 });
    }
    if (!isSupportedDocumentType(mimeType)) {
      return NextResponse.json(
        { message: "Use a PDF, Word document, or plain text file." },
        { status: 400 },
      );
    }
    const denied = await requireKbAccess(guard.session, kbId);
    if (denied) return denied;

    try {
      const asset = await createManagedAsset({
        body: blobUrl,
        fileSizeBytes,
        homeKbId: kbId,
        mimeType,
        originalFilename,
        assetType: "document",
        title:
          typeof body?.title === "string" && body.title.trim()
            ? body.title.trim()
            : originalFilename.replace(/\.[^.]+$/, ""),
        description: typeof body?.description === "string" ? body.description : undefined,
        tags: body?.tags,
      });
      await recordAuditEvent({
        session: guard.session,
        action: "asset.created",
        entityType: "asset",
        entityId: asset.id,
        entityLabel: asset.title,
        kbId: asset.homeKbId,
        details: { assetType: asset.assetType, filename: originalFilename, directBlob: true },
      });
      const kb = await getKbById(asset.homeKbId);
      const url = kb ? `/kb/${kb.slug}/files/${asset.slug}` : null;
      return NextResponse.json({ ok: true, asset, url });
    } catch (error) {
      logError(error, { route: "/api/admin/assets/documents", action: "register_direct_document", kbId });
      const message = error instanceof Error ? error.message : "Could not register document.";
      return NextResponse.json({ message }, { status: 400 });
    }
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  const kbId = formData?.get("kbId");
  const title = formData?.get("title");
  const description = formData?.get("description");
  const tags = formData?.get("tags");
  if (!(file instanceof File) || typeof kbId !== "string") {
    return NextResponse.json({ message: "File and knowledge base are required." }, { status: 400 });
  }
  const denied = await requireKbAccess(guard.session, kbId);
  if (denied) {
    return denied;
  }
  if (!isSupportedDocumentType(file.type)) {
    return NextResponse.json(
      { message: "Use a PDF, Word document, or plain text file." },
      { status: 400 },
    );
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
    const asset = await createManagedAsset({
      body,
      fileSizeBytes: file.size,
      homeKbId: kbId,
      mimeType: file.type.toLowerCase(),
      originalFilename: file.name,
      assetType: "document",
      title: typeof title === "string" ? title : file.name.replace(/\.[^.]+$/, ""),
      description: typeof description === "string" ? description : undefined,
      tags: typeof tags === "string" ? tags : undefined,
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
    return NextResponse.json({ ok: true, asset, url });
  } catch (error) {
    logError(error, { route: "/api/admin/assets/documents", action: "upload_document", kbId });
    const message = error instanceof Error ? error.message : "Could not upload document.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

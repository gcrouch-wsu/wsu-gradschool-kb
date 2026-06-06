import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { createManagedAsset } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import { parseVideoUrl } from "@/lib/video";

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body || !body.kbId || !body.url) {
    return NextResponse.json({ message: "Knowledge base ID and URL are required." }, { status: 400 });
  }

  const denied = await requireKbAccess(guard.session, body.kbId);
  if (denied) {
    return denied;
  }

  const { provider, embedId } = parseVideoUrl(body.url);

  try {
    const asset = await createManagedAsset({
      homeKbId: body.kbId,
      assetType: "video",
      title: body.title,
      description: body.description,
      body: body.url, // Kept for the version row / backward compatibility.
      mimeType: `video/x-${provider}`,
      originalFilename: `${provider}-link`,
      fileSizeBytes: 0,
      // Canonical video fields (KI-2): the source of truth for delivery/embedding.
      videoProvider: provider,
      videoExternalId: embedId ?? null,
      videoUrl: body.url,
    });
    await recordAuditEvent({
      session: guard.session,
      action: "asset.created",
      entityType: "asset",
      entityId: asset.id,
      entityLabel: asset.title,
      kbId: asset.homeKbId,
      details: { assetType: asset.assetType, provider, url: body.url },
    });

    return NextResponse.json({ ok: true, asset, provider, embedId });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create video asset." },
      { status: 500 },
    );
  }
}

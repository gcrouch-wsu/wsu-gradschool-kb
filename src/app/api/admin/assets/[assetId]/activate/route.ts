import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import { activateAssetVersion, getAssetAdminDetail, getAssetHomeKbId, getKbById } from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export const runtime = "nodejs";

interface ActivateBody {
  versionId?: unknown;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { assetId } = await context.params;

  const denied = await requireKbAccess(guard.session, await getAssetHomeKbId(assetId));
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => null)) as ActivateBody | null;
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  if (!versionId) {
    return NextResponse.json({ message: "versionId is required." }, { status: 400 });
  }

  try {
    const asset = await activateAssetVersion(assetId, versionId);
    await recordAuditEvent({
      session: guard.session,
      action: "asset.version_activated",
      entityType: "asset",
      entityId: asset.id,
      entityLabel: asset.title,
      kbId: asset.homeKbId,
      details: { versionId, slug: asset.slug },
    });
    const kb = await getKbById(asset.homeKbId);
    const detail = await getAssetAdminDetail(assetId);
    const url = kb && asset.status === "active" ? `/kb/${kb.slug}/files/${asset.slug}` : null;
    return NextResponse.json({
      ok: true,
      asset,
      url,
      usages: detail?.usages ?? [],
    });
  } catch (error) {
    logError(error, { route: "/api/admin/assets/[assetId]/activate", action: "activate_asset_version", assetId, versionId });
    const message = error instanceof Error ? error.message : "Could not activate version.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

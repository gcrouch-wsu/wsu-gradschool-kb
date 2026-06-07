import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAssetAdminDetail,
  getAssetHomeKbId,
  permanentlyDeleteAsset,
  updateAssetAltText,
  updateAssetDescription,
} from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

export async function PATCH(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { assetId } = await context.params;

  const denied = await requireKbAccess(guard.session, await getAssetHomeKbId(assetId));
  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => null)) as
    | { description?: unknown; altText?: unknown }
    | null;

  try {

    if (body && typeof body.altText === "string") {
      const asset = await updateAssetAltText(assetId, body.altText);
      await recordAuditEvent({
        session: guard.session,
        action: "asset.alt_text_updated",
        entityType: "asset",
        entityId: asset.id,
        entityLabel: asset.title,
        kbId: asset.homeKbId,
        details: { field: "altText" },
      });
      return NextResponse.json({ ok: true, asset });
    }
    if (body && typeof body.description === "string") {
      const asset = await updateAssetDescription(assetId, body.description);
      await recordAuditEvent({
        session: guard.session,
        action: "asset.description_updated",
        entityType: "asset",
        entityId: asset.id,
        entityLabel: asset.title,
        kbId: asset.homeKbId,
        details: { field: "description" },
      });
      return NextResponse.json({ ok: true, asset });
    }
    return NextResponse.json({ message: "A description or altText is required." }, { status: 400 });
  } catch (error) {
    logError(error, { route: "/api/admin/assets/[assetId]", action: "update_asset", assetId });
    const message = error instanceof Error ? error.message : "Could not update the asset.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ assetId: string }> }) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  if (guard.session.role !== "owner" && guard.session.role !== "admin") {
    return NextResponse.json({ message: "Only owners and admins can permanently delete assets." }, { status: 403 });
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
  if (detail.asset.status !== "archived") {
    return NextResponse.json({ message: "Archive this asset before permanently deleting it." }, { status: 409 });
  }
  if (detail.usages.length > 0) {
    return NextResponse.json(
      { message: "Remove page references to this asset before permanently deleting it." },
      { status: 409 },
    );
  }

  await permanentlyDeleteAsset(assetId);
  await recordAuditEvent({
    session: guard.session,
    action: "asset.deleted",
    entityType: "asset",
    entityId: detail.asset.id,
    entityLabel: detail.asset.title,
    kbId: detail.asset.homeKbId,
    details: { slug: detail.asset.slug, assetType: detail.asset.assetType },
  });
  return NextResponse.json({ ok: true });
}

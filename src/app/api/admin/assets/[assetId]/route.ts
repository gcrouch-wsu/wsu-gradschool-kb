import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAssetAdminDetail,
  getAssetHomeKbId,
  permanentlyDeleteAsset,
  updateAssetAltText,
  updateAssetDescription,
  updateAssetTags,
} from "@/lib/kb-store";
import { logError } from "@/lib/log";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";
import type { Asset } from "@/lib/types";

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
    | { description?: unknown; altText?: unknown; tags?: unknown }
    | null;

  try {
    let asset: Asset | null = null;
    const fields: string[] = [];
    if (body && typeof body.description === "string") {
      asset = await updateAssetDescription(assetId, body.description);
      fields.push("description");
    }
    if (body && typeof body.altText === "string") {
      asset = await updateAssetAltText(assetId, body.altText);
      fields.push("altText");
    }
    if (body && body.tags !== undefined) {
      asset = await updateAssetTags(assetId, body.tags);
      fields.push("tags");
    }
    if (asset) {
      const actionByField: Record<string, string> = {
        altText: "asset.alt_text_updated",
        description: "asset.description_updated",
        tags: "asset.tags_updated",
      };
      await recordAuditEvent({
        session: guard.session,
        action:
          fields.length === 1
            ? actionByField[fields[0]] ?? "asset.metadata_updated"
            : "asset.metadata_updated",
        entityType: "asset",
        entityId: asset.id,
        entityLabel: asset.title,
        kbId: asset.homeKbId,
        details: { fields },
      });
      return NextResponse.json({ ok: true, asset });
    }
    return NextResponse.json({ message: "A description, altText, or tags value is required." }, { status: 400 });
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

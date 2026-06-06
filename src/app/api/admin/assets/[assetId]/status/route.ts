import { NextResponse } from "next/server";
import { getAssetAdminDetail, getKbById, updateAssetStatus } from "@/lib/kb-store";
import { requireAdminMutation } from "@/lib/security";
import type { AssetStatus } from "@/lib/types";

interface StatusBody {
  status?: unknown;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assetId: string }> },
) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const { assetId } = await context.params;
  const body = (await request.json().catch(() => null)) as StatusBody | null;
  const status: AssetStatus | null =
    body?.status === "active" || body?.status === "draft" || body?.status === "archived"
      ? body.status
      : null;

  if (!status) {
    return NextResponse.json(
      { message: "Status must be active, draft, or archived." },
      { status: 400 },
    );
  }

  const existing = await getAssetAdminDetail(assetId);
  if (!existing) {
    return NextResponse.json({ message: "Asset not found." }, { status: 404 });
  }

  try {
    const asset = await updateAssetStatus(assetId, status);
    const kb = await getKbById(asset.homeKbId);
    const url =
      kb && asset.status === "active" ? `/kb/${kb.slug}/files/${asset.slug}` : null;
    return NextResponse.json({ ok: true, assetId: asset.id, status: asset.status, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update asset status.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getAssetHomeKbId, updateAssetDescription } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

/** Update editable asset metadata (currently the description / default alt text). */
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

  const body = (await request.json().catch(() => null)) as { description?: unknown } | null;
  if (!body || typeof body.description !== "string") {
    return NextResponse.json({ message: "A description is required." }, { status: 400 });
  }

  try {
    const asset = await updateAssetDescription(assetId, body.description);
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the asset.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

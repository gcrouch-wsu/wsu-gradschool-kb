import { NextResponse } from "next/server";
import { getAssetHomeKbId, updateAssetAltText, updateAssetDescription } from "@/lib/kb-store";
import { requireAdminMutation, requireKbAccess } from "@/lib/security";

/** Update editable asset metadata: the human `description` and/or default `altText`. */
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
    // "Save alt to asset" sends altText; it is stored separately from description.
    if (body && typeof body.altText === "string") {
      const asset = await updateAssetAltText(assetId, body.altText);
      return NextResponse.json({ ok: true, asset });
    }
    if (body && typeof body.description === "string") {
      const asset = await updateAssetDescription(assetId, body.description);
      return NextResponse.json({ ok: true, asset });
    }
    return NextResponse.json({ message: "A description or altText is required." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the asset.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { requireKbAccess } from "@/lib/security";
import { getAllAssetsForAdmin, getKbById } from "@/lib/kb-store";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kbId = searchParams.get("kbId") ?? undefined;

  const denied = await requireKbAccess(session, kbId);
  if (denied) return denied;

  const kb = await getKbById(kbId!);

  const assets = await getAllAssetsForAdmin(kbId);
  const items = await Promise.all(
    assets
      .filter((asset) => asset.status === "active" && asset.assetType !== "video")
      .map(async (asset) => {
        const homeKb = kb && kb.id === asset.homeKbId ? kb : await getKbById(asset.homeKbId);
        return {
          id: asset.id,
          title: asset.title,
          slug: asset.slug,
          description: asset.description,
          altText: asset.altText ?? "",
          assetType: asset.assetType,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.fileSizeBytes,
          url: homeKb ? `/kb/${homeKb.slug}/files/${asset.slug}` : null,
        };
      }),
  );

  return NextResponse.json({ assets: items });
}

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";
import { requireKbAccess } from "@/lib/security";
import { getAllAssetsForAdmin, getAssetUsages, getKbById } from "@/lib/kb-store";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kbId = searchParams.get("kbId") ?? undefined;
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const type = searchParams.get("type");
  const usage = searchParams.get("usage");

  const denied = await requireKbAccess(session, kbId);
  if (denied) return denied;

  const kb = await getKbById(kbId!);

  const assets = await getAllAssetsForAdmin(kbId);
  const items = await Promise.all(
    assets
      .filter((asset) => asset.status === "active" && asset.assetType !== "video")
      .filter((asset) => (type === "image" || type === "document" ? asset.assetType === type : true))
      .filter((asset) => {
        if (!query) {
          return true;
        }
        const tags = (asset.tags ?? []).join(" ").toLowerCase();
        return [asset.title, asset.slug, asset.description, tags].some((field) =>
          field.toLowerCase().includes(query),
        );
      })
      .map(async (asset) => {
        const [homeKb, usages] = await Promise.all([
          kb && kb.id === asset.homeKbId ? kb : getKbById(asset.homeKbId),
          getAssetUsages(asset.id),
        ]);
        if (usage === "used" && usages.length === 0) {
          return null;
        }
        if (usage === "unused" && usages.length > 0) {
          return null;
        }
        return {
          id: asset.id,
          title: asset.title,
          slug: asset.slug,
          description: asset.description,
          tags: asset.tags ?? [],
          altText: asset.altText ?? "",
          assetType: asset.assetType,
          mimeType: asset.mimeType,
          fileSizeBytes: asset.fileSizeBytes,
          usageCount: usages.length,
          url: homeKb ? `/kb/${homeKb.slug}/files/${asset.slug}` : null,
        };
      }),
  );

  return NextResponse.json({ assets: items.filter((asset) => asset !== null) });
}

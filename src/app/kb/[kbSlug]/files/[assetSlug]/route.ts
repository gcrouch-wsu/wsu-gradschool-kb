import { notFound } from "next/navigation";
import { getAssetBySlug, getKbBySlug } from "@/lib/demo-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kbSlug: string; assetSlug: string }> },
) {
  const { kbSlug, assetSlug } = await params;
  const kb = getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const asset = getAssetBySlug(kb.id, assetSlug);
  if (!asset) {
    notFound();
  }

  return new Response(asset.body, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      "Content-Disposition": `inline; filename="${asset.slug}.txt"`,
      "Content-Type": asset.mimeType,
      ETag: `"${asset.versionId}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

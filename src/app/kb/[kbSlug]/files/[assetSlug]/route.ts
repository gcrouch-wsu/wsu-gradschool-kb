import { notFound } from "next/navigation";
import { getAssetBySlug, getKbBySlug } from "@/lib/demo-data";

export async function GET(
  request: Request,
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

  const etag = `"${asset.versionId}"`;
  const headers = {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    "Content-Disposition": `inline; filename="${asset.slug}.txt"`,
    "Content-Type": asset.mimeType,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(asset.body, { headers });
}

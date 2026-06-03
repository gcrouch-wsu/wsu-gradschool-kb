import { notFound } from "next/navigation";
import { getAssetBySlug, getKbBySlug } from "@/lib/kb-store";

function dataUriToResponseBody(dataUri: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUri);
  if (!match) {
    return null;
  }
  return {
    contentType: match[1],
    body: Buffer.from(match[2], "base64"),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kbSlug: string; assetSlug: string }> },
) {
  const { kbSlug, assetSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const asset = await getAssetBySlug(kb.id, assetSlug);
  if (!asset) {
    notFound();
  }

  const etag = `"${asset.versionId}"`;
  const extension = asset.mimeType.includes("png")
    ? "png"
    : asset.mimeType.includes("jpeg") || asset.mimeType.includes("jpg")
      ? "jpg"
      : asset.mimeType.includes("gif")
        ? "gif"
        : asset.mimeType.includes("webp")
          ? "webp"
          : "txt";
  const headers = {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    "Content-Disposition": `inline; filename="${asset.slug}.${extension}"`,
    "Content-Type": asset.mimeType,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  if (asset.body.startsWith("data:")) {
    const decoded = dataUriToResponseBody(asset.body);
    if (decoded) {
      return new Response(decoded.body, {
        headers: { ...headers, "Content-Type": decoded.contentType },
      });
    }
  }

  if (asset.body.startsWith("http://") || asset.body.startsWith("https://")) {
    const upstream = await fetch(asset.body);
    if (!upstream.ok || !upstream.body) {
      notFound();
    }
    return new Response(upstream.body, {
      headers: {
        ...headers,
        "Content-Length": upstream.headers.get("content-length") ?? String(asset.fileSizeBytes),
        "Content-Type": upstream.headers.get("content-type") ?? asset.mimeType,
      },
    });
  }

  return new Response(asset.body, { headers });
}

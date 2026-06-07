import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { getAssetForDelivery, getKbBySlug } from "@/lib/kb-store";
import { videoDeliveryUrl } from "@/lib/video";

export const dynamic = "force-dynamic";

function fileExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("svg")) return "svg";
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("wordprocessingml")) return "docx";
  if (normalized.includes("msword")) return "doc";
  if (normalized.includes("plain")) return "txt";
  return "bin";
}

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

function isTrustedAssetUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  return (
    url.hostname === "blob.vercel-storage.com" ||
    url.hostname.endsWith(".public.blob.vercel-storage.com")
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kbSlug: string; assetSlug: string }> },
) {
  const { kbSlug, assetSlug: rawAssetSlug } = await params;
  const assetSlug = decodeURIComponent(rawAssetSlug);
  const kb = await getKbBySlug(kbSlug);
  if (!kb) {
    notFound();
  }

  const asset = await getAssetForDelivery(kb.id, assetSlug);
  if (!asset) {
    notFound();
  }

  if (asset.assetType === "video") {
    const target = videoDeliveryUrl(asset);
    if (!target) {
      notFound();
    }
    return NextResponse.redirect(target, {
      status: 307,
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  }

  const etag = `"${asset.versionId}"`;
  const extension = fileExtension(asset.mimeType);
  const disposition = asset.mimeType.toLowerCase().includes("svg") ? "attachment" : "inline";
  const headers = {
    "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    "Content-Disposition": `${disposition}; filename="${asset.slug}.${extension}"`,
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
    if (!isTrustedAssetUrl(asset.body)) {
      notFound();
    }

    return NextResponse.redirect(asset.body, { status: 307, headers });
  }

  return new Response(asset.body, { headers });
}

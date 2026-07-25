import { notFound } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentAdminSession, getKbReadAccess } from "@/lib/auth";
import { isTrustedAssetUrl } from "@/lib/blob";
import {
  isResizableImageMime,
  parseImageWidthParam,
  resizeImageBuffer,
} from "@/lib/image-variants";
import { assetHasPublicPublishedUsage, getAssetForDelivery, getKbBySlug } from "@/lib/kb-store";
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

function cacheControl(requiresAuthorization: boolean) {
  return requiresAuthorization ? "private, no-store" : "public, max-age=60, stale-while-revalidate=300";
}

async function fetchTrustedAssetBody(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    return null;
  }
  return response;
}

async function bufferFromUpstream(url: string): Promise<{ body: Buffer; contentType: string } | null> {
  const upstream = await fetchTrustedAssetBody(url);
  if (!upstream) return null;
  const arrayBuffer = await upstream.arrayBuffer();
  return {
    body: Buffer.from(arrayBuffer),
    contentType: upstream.headers.get("content-type") || "application/octet-stream",
  };
}

async function maybeResize(
  body: Buffer,
  mimeType: string,
  width: number | null,
): Promise<{ body: Buffer; contentType: string }> {
  if (!width || !isResizableImageMime(mimeType)) {
    return { body, contentType: mimeType };
  }
  const resized = await resizeImageBuffer(body, mimeType, width);
  return resized ?? { body, contentType: mimeType };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kbSlug: string; assetSlug: string }> },
) {
  const { kbSlug, assetSlug: rawAssetSlug } = await params;
  const assetSlug = decodeURIComponent(rawAssetSlug);
  const session = await getCurrentAdminSession();
  const kb = await getKbBySlug(kbSlug, Boolean(session));
  if (!kb) {
    notFound();
  }
  const access = await getKbReadAccess(session, kb);
  if (!access.canRead) {
    notFound();
  }

  const asset = await getAssetForDelivery(kb.id, assetSlug);
  if (!asset) {
    notFound();
  }

  const readerVisibleUsage = await assetHasPublicPublishedUsage(asset);
  const authorized = access.canReadStaffContent || (access.canRead && readerVisibleUsage);
  if (!authorized) {
    notFound();
  }
  const requiresAuthorization = !(kb.visibility === "public" && kb.status === "published" && readerVisibleUsage);
  const requestedWidth = parseImageWidthParam(new URL(request.url).searchParams.get("w"));
  const wantsResize = Boolean(requestedWidth && asset.assetType === "image");

  if (asset.assetType === "video") {
    const target = videoDeliveryUrl(asset);
    if (!target) {
      notFound();
    }
    return NextResponse.redirect(target, {
      status: 307,
      headers: { "Cache-Control": cacheControl(requiresAuthorization) },
    });
  }

  const etag = `"${asset.versionId}${wantsResize ? `-w${requestedWidth}` : ""}"`;
  const extension = wantsResize ? "webp" : fileExtension(asset.mimeType);
  const disposition = asset.mimeType.toLowerCase().includes("svg") ? "attachment" : "inline";
  const baseHeaders = {
    "Cache-Control": cacheControl(requiresAuthorization),
    "Content-Disposition": `${disposition}; filename="${asset.slug}.${extension}"`,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };

  if (!requiresAuthorization && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  if (asset.body.startsWith("data:")) {
    const decoded = dataUriToResponseBody(asset.body);
    if (!decoded) {
      notFound();
    }
    const output = await maybeResize(decoded.body, decoded.contentType, requestedWidth);
    return new Response(new Uint8Array(output.body), {
      headers: { ...baseHeaders, "Content-Type": output.contentType },
    });
  }

  if (asset.body.startsWith("http://") || asset.body.startsWith("https://")) {
    if (!isTrustedAssetUrl(asset.body)) {
      notFound();
    }

    // Always stream when resizing so ?w= works. Also stream authorized private assets
    // (never 307 to a public Blob URL). Public full-size images may still redirect.
    if (requiresAuthorization || wantsResize || asset.assetType === "image") {
      const upstream = await bufferFromUpstream(asset.body);
      if (!upstream) {
        notFound();
      }
      const output = await maybeResize(
        upstream.body,
        upstream.contentType || asset.mimeType,
        wantsResize ? requestedWidth : null,
      );
      return new Response(new Uint8Array(output.body), {
        headers: { ...baseHeaders, "Content-Type": output.contentType },
      });
    }

    return NextResponse.redirect(asset.body, { status: 307, headers: baseHeaders });
  }

  const output = await maybeResize(Buffer.from(asset.body), asset.mimeType, requestedWidth);
  return new Response(new Uint8Array(output.body), {
    headers: { ...baseHeaders, "Content-Type": output.contentType },
  });
}

import { NextResponse } from "next/server";
import { createImageAsset, createPage, getKbById } from "@/lib/kb-store";
import { requireAdminMutation } from "@/lib/security";
import type { ContentBlock, PageVisibility } from "@/lib/types";

export const runtime = "nodejs";

interface CommitBody {
  kbId?: unknown;
  title?: unknown;
  slug?: unknown;
  parentPath?: unknown;
  summary?: unknown;
  visibility?: unknown;
  blocks?: unknown;
}

function imageExtension(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("svg")) return "svg";
  return "img";
}

function inferImageMimeType(src: string) {
  const dataUriMatch = /^data:([^;]+);base64,/i.exec(src);
  if (dataUriMatch) {
    return dataUriMatch[1].toLowerCase();
  }
  const withoutQuery = src.split("?")[0]?.toLowerCase() ?? "";
  if (withoutQuery.endsWith(".png")) return "image/png";
  if (withoutQuery.endsWith(".jpg") || withoutQuery.endsWith(".jpeg")) return "image/jpeg";
  if (withoutQuery.endsWith(".gif")) return "image/gif";
  if (withoutQuery.endsWith(".webp")) return "image/webp";
  if (withoutQuery.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function estimateImageSize(src: string) {
  const dataUriMatch = /^data:[^;]+;base64,(.+)$/i.exec(src);
  if (!dataUriMatch) {
    return 0;
  }
  return Buffer.byteLength(dataUriMatch[1], "base64");
}

async function promoteImportedImagesToAssets(
  blocks: ContentBlock[],
  kbId: string,
  kbSlug: string,
  pageTitle: string,
) {
  let imageIndex = 0;
  const managedBlocks: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "image" || block.assetId || !block.url) {
      managedBlocks.push(block);
      continue;
    }
    if (!block.url.startsWith("data:image/") && !block.url.startsWith("http://") && !block.url.startsWith("https://")) {
      managedBlocks.push(block);
      continue;
    }
    imageIndex += 1;
    const mimeType = inferImageMimeType(block.url);
    const extension = imageExtension(mimeType);
    const asset = await createImageAsset({
      body: block.url,
      fileSizeBytes: estimateImageSize(block.url),
      homeKbId: kbId,
      mimeType,
      originalFilename: `${pageTitle}-image-${imageIndex}.${extension}`,
      title: `${pageTitle} image ${imageIndex}`,
    });
    managedBlocks.push({
      ...block,
      assetId: asset.id,
      url: `/kb/${kbSlug}/files/${asset.slug}`,
    });
  }
  return managedBlocks;
}

export async function POST(request: Request) {
  const guard = await requireAdminMutation(request);
  if (!guard.ok) {
    return guard.response;
  }

  const body = (await request.json().catch(() => null)) as CommitBody | null;
  if (!body) {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const kbId = typeof body.kbId === "string" ? body.kbId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug : undefined;
  const summary = typeof body.summary === "string" ? body.summary : undefined;
  const visibility: PageVisibility = body.visibility === "staff" ? "staff" : "public";
  const parentPath = Array.isArray(body.parentPath)
    ? body.parentPath.filter((segment): segment is string => typeof segment === "string")
    : [];
  const blocks = Array.isArray(body.blocks) ? (body.blocks as ContentBlock[]) : [];

  if (!kbId || !title) {
    return NextResponse.json({ message: "Knowledge base and title are required." }, { status: 400 });
  }
  if (blocks.length === 0) {
    return NextResponse.json({ message: "There is no content to import." }, { status: 400 });
  }

  try {
    const kb = await getKbById(kbId);
    if (!kb) {
      return NextResponse.json({ message: "Knowledge base not found." }, { status: 400 });
    }
    const managedBlocks = await promoteImportedImagesToAssets(blocks, kbId, kb.slug, title);
    const page = await createPage({
      kbId,
      title,
      slug,
      summary,
      visibility,
      parentPath,
      status: "draft",
      blocks: managedBlocks,
    });
    const url = kb ? `/kb/${kb.slug}/${page.path.join("/")}` : null;
    return NextResponse.json({ ok: true, pageId: page.id, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the page.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

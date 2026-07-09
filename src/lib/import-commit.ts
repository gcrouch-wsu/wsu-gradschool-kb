import { createImageAsset, createPage, getKbById } from "@/lib/kb-store";
import type { ContentBlock, PageVisibility } from "@/lib/types";
import type { StagedImportMedia } from "@/lib/types";

function imageExtension(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("svg")) return "svg";
  return "img";
}

export function inferImageMimeType(src: string) {
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

export interface CommitDraftPageInput {
  kbId: string;
  title: string;
  slug?: string;
  summary?: string;
  visibility?: PageVisibility;
  parentPath?: string[];
  blocks: ContentBlock[];
  authorEmail?: string;
}

export function applyStagedMediaToBlocks(
  blocks: ContentBlock[],
  media: StagedImportMedia[],
): ContentBlock[] {
  const mediaByBlock = new Map(media.map((row) => [row.blockId, row]));
  const output: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "image") {
      output.push(block);
      continue;
    }
    const row = mediaByBlock.get(block.blockId);
    if (row?.reviewStatus === "rejected") {
      continue;
    }
    const url = row?.temporaryUrl || block.url;
    if (!url) {
      continue;
    }
    output.push({
      ...block,
      url,
      alt: row?.altText?.trim() || block.alt || "",
    });
  }
  return output;
}

export async function promoteImportedImagesToAssets(
  blocks: ContentBlock[],
  kbId: string,
  kbSlug: string,
  pageTitle: string,
  media?: StagedImportMedia[],
) {
  const mediaByBlock = new Map((media ?? []).map((row) => [row.blockId, row]));
  let imageIndex = 0;
  const managedBlocks: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "image" || block.assetId || !block.url) {
      managedBlocks.push(block);
      continue;
    }
    if (
      !block.url.startsWith("data:image/") &&
      !block.url.startsWith("http://") &&
      !block.url.startsWith("https://")
    ) {
      managedBlocks.push(block);
      continue;
    }
    imageIndex += 1;
    const mimeType = inferImageMimeType(block.url);
    const extension = imageExtension(mimeType);
    const review = mediaByBlock.get(block.blockId);
    const assetTitle = review?.proposedTitle?.trim() || `${pageTitle} image ${imageIndex}`;
    const asset = await createImageAsset({
      body: block.url,
      fileSizeBytes: estimateImageSize(block.url),
      homeKbId: kbId,
      mimeType,
      originalFilename: review?.originalFilename || `${pageTitle}-image-${imageIndex}.${extension}`,
      title: assetTitle,
    });
    managedBlocks.push({
      ...block,
      assetId: asset.id,
      url: `/kb/${kbSlug}/files/${asset.slug}`,
    });
  }
  return managedBlocks;
}

export async function commitDraftPageFromImport(input: CommitDraftPageInput) {
  const kb = await getKbById(input.kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }
  const page = await createPage({
    kbId: input.kbId,
    title: input.title,
    slug: input.slug,
    summary: input.summary,
    visibility: input.visibility,
    parentPath: input.parentPath,
    status: "draft",
    blocks: input.blocks,
    authorEmail: input.authorEmail,
  });
  const url = `/kb/${kb.slug}/${page.path.join("/")}`;
  return { page, url };
}

export async function commitImportWithImagePromotion(
  input: CommitDraftPageInput,
  media?: StagedImportMedia[],
) {
  const kb = await getKbById(input.kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }
  const reviewedBlocks = media ? applyStagedMediaToBlocks(input.blocks, media) : input.blocks;
  const managedBlocks = await promoteImportedImagesToAssets(
    reviewedBlocks,
    input.kbId,
    kb.slug,
    input.title,
    media,
  );
  return commitDraftPageFromImport({ ...input, blocks: managedBlocks });
}

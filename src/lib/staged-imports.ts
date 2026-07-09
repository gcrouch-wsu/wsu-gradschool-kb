import { isBlobEnabled, uploadAssetBlob, uploadImportImage } from "@/lib/blob";
import { convertDocxToBlocks, type ImageUploader, type ParsedDocx } from "@/lib/docx-import";
import { commitImportWithImagePromotion } from "@/lib/import-commit";
import { isDatabaseEnabled } from "@/lib/db";
import { getKbById } from "@/lib/kb-store";
import { slugify } from "@/lib/slug";
import type {
  ContentBlock,
  PageVisibility,
  StagedImport,
  StagedImportDetail,
  StagedImportMedia,
  StagedImportMediaReviewStatus,
  StagedImportSourceType,
} from "@/lib/types";

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const DOC_CONTENT_TYPE = "application/msword";
const MACRO_EXTENSIONS = [".docm", ".dotm", ".dot"];

export const STAGED_IMPORT_MAX_BYTES = 25 * 1024 * 1024;

function detectSourceType(file: File): StagedImportSourceType | null {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".docx") || file.type === DOCX_CONTENT_TYPE) {
    return "docx";
  }
  if (lowerName.endsWith(".doc") || file.type === DOC_CONTENT_TYPE) {
    return "doc";
  }
  return null;
}

const SOURCE_CONTENT_TYPE: Record<StagedImportSourceType, string> = {
  docx: DOCX_CONTENT_TYPE,
  doc: DOC_CONTENT_TYPE,
};

const SOURCE_EXTENSION: Record<StagedImportSourceType, RegExp> = {
  docx: /\.docx$/i,
  doc: /\.doc$/i,
};

async function parseUpload(
  sourceType: StagedImportSourceType,
  buffer: Buffer,
  fallbackTitle: string,
  uploadImage: ImageUploader | undefined,
): Promise<ParsedDocx> {
  if (sourceType === "docx") {
    return convertDocxToBlocks(buffer, { uploadImage });
  }
  const { convertDocToBlocks } = await import("@/lib/doc-import");
  return convertDocToBlocks(buffer, fallbackTitle);
}

const globalRuntime = globalThis as unknown as {
  __kbRuntimeStagedImports?: StagedImport[];
  __kbRuntimeStagedMedia?: StagedImportMedia[];
};

function runtimeImports(): StagedImport[] {
  if (!globalRuntime.__kbRuntimeStagedImports) {
    globalRuntime.__kbRuntimeStagedImports = [];
  }
  return globalRuntime.__kbRuntimeStagedImports;
}

function runtimeMedia(): StagedImportMedia[] {
  if (!globalRuntime.__kbRuntimeStagedMedia) {
    globalRuntime.__kbRuntimeStagedMedia = [];
  }
  return globalRuntime.__kbRuntimeStagedMedia;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function suggestSlug(title: string) {
  return slugify(title);
}

function inferImageMimeType(src: string) {
  const dataUriMatch = /^data:([^;]+);base64,/i.exec(src);
  if (dataUriMatch) {
    return dataUriMatch[1].toLowerCase();
  }
  return "image/png";
}

function buildMediaRows(
  stagedImportId: string,
  pageTitle: string,
  blocks: ContentBlock[],
): StagedImportMedia[] {
  let imageIndex = 0;
  const rows: StagedImportMedia[] = [];
  for (const block of blocks) {
    if (block.type !== "image" || !block.url) {
      continue;
    }
    imageIndex += 1;
    const proposedTitle = `${pageTitle} image ${imageIndex}`;
    rows.push({
      id: `staged-media-${crypto.randomUUID()}`,
      stagedImportId,
      blockId: block.blockId,
      temporaryUrl: block.url,
      mimeType: inferImageMimeType(block.url),
      originalFilename: `${slugify(pageTitle)}-image-${imageIndex}`,
      proposedTitle,
      proposedSlug: slugify(proposedTitle),
      altText: block.alt ?? "",
      reviewStatus: "pending",
    });
  }
  return rows;
}

async function insertStagedImportRecord(record: StagedImport, media: StagedImportMedia[]) {
  if (isDatabaseEnabled()) {
    const { insertStagedImport, insertStagedImportMedia } = await import("@/lib/db-staged-imports");
    await insertStagedImport(record);
    for (const row of media) {
      await insertStagedImportMedia(row);
    }
    return;
  }
  runtimeImports().push(record);
  runtimeMedia().push(...media);
}

async function loadStagedImportRecord(id: string): Promise<StagedImport | null> {
  if (isDatabaseEnabled()) {
    const { loadStagedImportById } = await import("@/lib/db-staged-imports");
    return loadStagedImportById(id);
  }
  return runtimeImports().find((row) => row.id === id) ?? null;
}

async function loadMediaForImport(stagedImportId: string): Promise<StagedImportMedia[]> {
  if (isDatabaseEnabled()) {
    const { loadStagedImportMedia } = await import("@/lib/db-staged-imports");
    return loadStagedImportMedia(stagedImportId);
  }
  return runtimeMedia().filter((row) => row.stagedImportId === stagedImportId);
}

async function saveStagedImportRecord(record: StagedImport) {
  if (isDatabaseEnabled()) {
    const { updateStagedImport } = await import("@/lib/db-staged-imports");
    await updateStagedImport(record);
    return;
  }
  const list = runtimeImports();
  const index = list.findIndex((row) => row.id === record.id);
  if (index >= 0) {
    list[index] = record;
  }
}

async function saveMediaRows(stagedImportId: string, media: StagedImportMedia[]) {
  if (isDatabaseEnabled()) {
    const { replaceStagedImportMedia } = await import("@/lib/db-staged-imports");
    await replaceStagedImportMedia(stagedImportId, media);
    return;
  }
  const kept = runtimeMedia().filter((row) => row.stagedImportId !== stagedImportId);
  globalRuntime.__kbRuntimeStagedMedia = [...kept, ...media];
}

async function deleteStagedImportRecord(id: string) {
  if (isDatabaseEnabled()) {
    const { deleteStagedImport } = await import("@/lib/db-staged-imports");
    await deleteStagedImport(id);
    return;
  }
  globalRuntime.__kbRuntimeStagedImports = runtimeImports().filter((row) => row.id !== id);
  globalRuntime.__kbRuntimeStagedMedia = runtimeMedia().filter((row) => row.stagedImportId !== id);
}

async function listStagedImportRecords(kbId?: string): Promise<StagedImport[]> {
  if (isDatabaseEnabled()) {
    const { listStagedImports } = await import("@/lib/db-staged-imports");
    return listStagedImports(kbId);
  }
  const rows = runtimeImports();
  return kbId ? rows.filter((row) => row.kbId === kbId) : [...rows];
}

export function validateImportUpload(file: File) {
  const lowerName = file.name.toLowerCase();
  if (MACRO_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) || file.type.includes("macroEnabled")) {
    return "Macro-enabled Word files are not allowed. Save as a plain .docx and try again.";
  }
  if (!detectSourceType(file)) {
    return "Please upload a .docx or .doc file.";
  }
  if (file.size === 0) {
    return "That file is empty.";
  }
  if (file.size > STAGED_IMPORT_MAX_BYTES) {
    return "File is larger than 25 MB.";
  }
  return null;
}

/** @deprecated Use {@link validateImportUpload}. Kept for backwards compatibility. */
export const validateDocxUpload = validateImportUpload;

export async function createStagedImportFromUpload(
  kbId: string,
  file: File,
  createdBy: string,
): Promise<StagedImportDetail> {
  const kb = await getKbById(kbId);
  if (!kb) {
    throw new Error("Knowledge base not found.");
  }

  const validation = validateImportUpload(file);
  if (validation) {
    throw new Error(validation);
  }

  const sourceType = detectSourceType(file);
  if (!sourceType) {
    throw new Error("Please upload a .docx or .doc file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let sourceBlobUrl = "";
  if (isBlobEnabled()) {
    const url = await uploadAssetBlob(buffer, SOURCE_CONTENT_TYPE[sourceType], "kb-imports/sources");
    if (url) {
      sourceBlobUrl = url;
    }
  }

  const uploadImage: ImageUploader | undefined = isBlobEnabled() ? uploadImportImage : undefined;
  const derivedFallbackTitle = file.name.replace(SOURCE_EXTENSION[sourceType], "");
  const parsed = await parseUpload(sourceType, buffer, derivedFallbackTitle, uploadImage);
  const derivedTitle = parsed.title ?? derivedFallbackTitle;
  const now = todayIso();
  const id = `staged-import-${crypto.randomUUID()}`;

  const record: StagedImport = {
    id,
    kbId,
    sourceType,
    originalFilename: file.name,
    sourceBlobUrl,
    status: "needs_review",
    parsedTitle: parsed.title,
    blocks: parsed.blocks,
    messages: parsed.messages,
    title: derivedTitle,
    slug: suggestSlug(derivedTitle),
    summary: "",
    parentPath: [],
    visibility: "public",
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  const media = buildMediaRows(id, derivedTitle, parsed.blocks);
  await insertStagedImportRecord(record, media);

  return { import: record, media, kbSlug: kb.slug };
}

/** @deprecated Use {@link createStagedImportFromUpload}. Kept for backwards compatibility. */
export const createStagedImportFromDocx = createStagedImportFromUpload;

export async function listStagedImportsForAdmin(kbId?: string): Promise<StagedImport[]> {
  const rows = await listStagedImportRecords(kbId);
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
}

export async function getStagedImportDetail(id: string): Promise<StagedImportDetail | null> {
  const record = await loadStagedImportRecord(id);
  if (!record) {
    return null;
  }
  const kb = await getKbById(record.kbId);
  if (!kb) {
    return null;
  }
  const media = await loadMediaForImport(id);
  return { import: record, media, kbSlug: kb.slug };
}

export interface UpdateStagedImportInput {
  title?: string;
  slug?: string;
  summary?: string;
  parentPath?: string[];
  visibility?: PageVisibility;
  blocks?: ContentBlock[];
  media?: Array<{
    id: string;
    altText?: string;
    proposedTitle?: string;
    reviewStatus?: StagedImportMediaReviewStatus;
  }>;
}

export async function updateStagedImport(
  id: string,
  input: UpdateStagedImportInput,
): Promise<StagedImportDetail> {
  const existing = await getStagedImportDetail(id);
  if (!existing) {
    throw new Error("Staged import not found.");
  }

  const updated: StagedImport = {
    ...existing.import,
    title: input.title?.trim() || existing.import.title,
    slug: input.slug?.trim() ? suggestSlug(input.slug) : existing.import.slug,
    summary: input.summary !== undefined ? input.summary.trim() : existing.import.summary,
    parentPath: input.parentPath ?? existing.import.parentPath,
    visibility: input.visibility ?? existing.import.visibility,
    blocks: input.blocks ?? existing.import.blocks,
    updatedAt: todayIso(),
    status: "needs_review",
  };

  let media = existing.media;
  if (input.media?.length) {
    const patchById = new Map(input.media.map((row) => [row.id, row]));
    media = media.map((row) => {
      const patch = patchById.get(row.id);
      if (!patch) {
        return row;
      }
      return {
        ...row,
        altText: patch.altText !== undefined ? patch.altText : row.altText,
        proposedTitle: patch.proposedTitle?.trim() || row.proposedTitle,
        proposedSlug: patch.proposedTitle ? slugify(patch.proposedTitle) : row.proposedSlug,
        reviewStatus: patch.reviewStatus ?? row.reviewStatus,
      };
    });
  }

  await saveStagedImportRecord(updated);
  await saveMediaRows(id, media);

  return { import: updated, media, kbSlug: existing.kbSlug };
}

export async function discardStagedImport(id: string): Promise<void> {
  const existing = await loadStagedImportRecord(id);
  if (!existing) {
    throw new Error("Staged import not found.");
  }
  await deleteStagedImportRecord(id);
}

export async function commitStagedImport(id: string, authorEmail?: string) {
  const detail = await getStagedImportDetail(id);
  if (!detail) {
    throw new Error("Staged import not found.");
  }
  const { import: staged, media } = detail;
  if (staged.blocks.length === 0) {
    throw new Error("There is no content to import.");
  }

  const result = await commitImportWithImagePromotion(
    {
      kbId: staged.kbId,
      title: staged.title,
      slug: staged.slug,
      summary: staged.summary,
      visibility: staged.visibility,
      parentPath: staged.parentPath,
      blocks: staged.blocks,
      authorEmail,
    },
    media,
  );

  await deleteStagedImportRecord(id);
  return result;
}

export async function getStagedImportCounts() {
  const rows = await listStagedImportRecords();
  return {
    total: rows.length,
    needsReview: rows.filter((row) => row.status === "needs_review").length,
  };
}

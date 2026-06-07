import { ensureSchema, getSql } from "@/lib/db";
import type {
  ContentBlock,
  StagedImport,
  StagedImportMedia,
  StagedImportMediaReviewStatus,
  StagedImportStatus,
} from "@/lib/types";

interface ImportRow {
  id: string;
  kb_id: string;
  source_type: string;
  original_filename: string;
  source_blob_url: string;
  status: string;
  parsed_title: string | null;
  blocks: ContentBlock[] | string;
  messages: string[];
  title: string;
  slug: string;
  summary: string;
  parent_path: string;
  visibility: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface MediaRow {
  id: string;
  staged_import_id: string;
  block_id: string;
  temporary_url: string;
  mime_type: string;
  original_filename: string;
  proposed_title: string;
  proposed_slug: string;
  alt_text: string;
  review_status: string;
  width: number | null;
  height: number | null;
}

function mapImport(row: ImportRow): StagedImport {
  return {
    id: row.id,
    kbId: row.kb_id,
    sourceType: row.source_type as StagedImport["sourceType"],
    originalFilename: row.original_filename,
    sourceBlobUrl: row.source_blob_url,
    status: row.status as StagedImportStatus,
    parsedTitle: row.parsed_title,
    blocks: Array.isArray(row.blocks)
      ? row.blocks
      : typeof row.blocks === "string"
        ? (JSON.parse(row.blocks) as ContentBlock[])
        : [],
    messages: row.messages ?? [],
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    parentPath: row.parent_path ? row.parent_path.split("/").filter(Boolean) : [],
    visibility: row.visibility as StagedImport["visibility"],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMedia(row: MediaRow): StagedImportMedia {
  return {
    id: row.id,
    stagedImportId: row.staged_import_id,
    blockId: row.block_id,
    temporaryUrl: row.temporary_url,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    proposedTitle: row.proposed_title,
    proposedSlug: row.proposed_slug,
    altText: row.alt_text,
    reviewStatus: row.review_status as StagedImportMediaReviewStatus,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
  };
}

export async function insertStagedImport(record: StagedImport): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_staged_imports (
      id, kb_id, source_type, original_filename, source_blob_url, status, parsed_title,
      blocks, messages, title, slug, summary, parent_path, visibility, created_by, created_at, updated_at
    ) VALUES (
      ${record.id}, ${record.kbId}, ${record.sourceType}, ${record.originalFilename},
      ${record.sourceBlobUrl}, ${record.status}, ${record.parsedTitle},
      ${JSON.stringify(record.blocks)}, ${JSON.stringify(record.messages)},
      ${record.title}, ${record.slug}, ${record.summary}, ${record.parentPath.join("/")},
      ${record.visibility}, ${record.createdBy}, ${record.createdAt}, ${record.updatedAt}
    )
  `;
}

export async function insertStagedImportMedia(media: StagedImportMedia): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_staged_import_media (
      id, staged_import_id, block_id, temporary_url, mime_type, original_filename,
      proposed_title, proposed_slug, alt_text, review_status, width, height
    ) VALUES (
      ${media.id}, ${media.stagedImportId}, ${media.blockId}, ${media.temporaryUrl},
      ${media.mimeType}, ${media.originalFilename}, ${media.proposedTitle}, ${media.proposedSlug},
      ${media.altText}, ${media.reviewStatus}, ${media.width ?? null}, ${media.height ?? null}
    )
  `;
}

export async function loadStagedImportById(id: string): Promise<StagedImport | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_staged_imports WHERE id = ${id} LIMIT 1
  `) as unknown as ImportRow[];
  const row = rows[0];
  return row ? mapImport(row) : null;
}

export async function listStagedImports(kbId?: string): Promise<StagedImport[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = kbId
    ? ((await sql`
        SELECT * FROM kb_staged_imports WHERE kb_id = ${kbId} ORDER BY updated_at DESC
      `) as unknown as ImportRow[])
    : ((await sql`
        SELECT * FROM kb_staged_imports ORDER BY updated_at DESC
      `) as unknown as ImportRow[]);
  return rows.map(mapImport);
}

export async function loadStagedImportMedia(stagedImportId: string): Promise<StagedImportMedia[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_staged_import_media WHERE staged_import_id = ${stagedImportId}
    ORDER BY proposed_title ASC
  `) as unknown as MediaRow[];
  return rows.map(mapMedia);
}

export async function updateStagedImport(record: StagedImport): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE kb_staged_imports
    SET
      status = ${record.status},
      blocks = ${JSON.stringify(record.blocks)},
      messages = ${JSON.stringify(record.messages)},
      title = ${record.title},
      slug = ${record.slug},
      summary = ${record.summary},
      parent_path = ${record.parentPath.join("/")},
      visibility = ${record.visibility},
      updated_at = ${record.updatedAt}
    WHERE id = ${record.id}
  `;
}

export async function replaceStagedImportMedia(
  stagedImportId: string,
  media: StagedImportMedia[],
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_staged_import_media WHERE staged_import_id = ${stagedImportId}`;
  for (const row of media) {
    await insertStagedImportMedia(row);
  }
}

export async function deleteStagedImport(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_staged_import_media WHERE staged_import_id = ${id}`;
  await sql`DELETE FROM kb_staged_imports WHERE id = ${id}`;
}

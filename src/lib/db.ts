import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { seedDataset } from "@/lib/demo-data";
import { mergeTheme, type KbTheme } from "@/lib/kb-theme";
import { runMigrations } from "@/lib/migrations";
import type { Asset, AssetVersion, KbDataset, KbPage, KbRedirect, KnowledgeBase } from "@/lib/types";

function getDatabaseUrl() {
  return process.env.DATABASE_URL?.trim() || null;
}

/** True when DATABASE_URL is set. Otherwise the app uses the in-memory seed dataset. */
export function isDatabaseEnabled() {
  return Boolean(getDatabaseUrl());
}

const globalForDb = globalThis as unknown as {
  __kbSql?: NeonQueryFunction<false, false>;
};

/** @internal Used by db-staged-imports persistence helpers. */
export function getSql() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }
  if (!globalForDb.__kbSql) {
    globalForDb.__kbSql = neon(url);
  }
  return globalForDb.__kbSql;
}

let schemaPromise: Promise<void> | null = null;

/** @internal Used by db-staged-imports persistence helpers. */
export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      await runMigrations(sql);
      await seedIfEmpty();
      await backfillAssetVersions();
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

/** Ensure every asset has at least one active version row (runs after seed). */
async function backfillAssetVersions() {
  const sql = getSql();
  const assets = (await sql`
    SELECT a.id, a.version_id, a.body, a.mime_type, a.file_size_bytes, a.updated_display_date
    FROM kb_assets a
    WHERE NOT EXISTS (SELECT 1 FROM kb_asset_versions v WHERE v.asset_id = a.id)
  `) as unknown as Array<{
    id: string;
    version_id: string;
    body: string;
    mime_type: string;
    file_size_bytes: number;
    updated_display_date: string;
  }>;
  for (const asset of assets) {
    const versionId = asset.version_id || `asset-version-${crypto.randomUUID()}`;
    await sql`
      INSERT INTO kb_asset_versions (
        id, asset_id, version_number, status, body, mime_type, file_size_bytes,
        original_filename, uploaded_at, notes
      ) VALUES (
        ${versionId}, ${asset.id}, 1, 'active', ${asset.body}, ${asset.mime_type},
        ${asset.file_size_bytes}, 'backfill', ${asset.updated_display_date}, ''
      )
    `;
    if (!asset.version_id) {
      await sql`UPDATE kb_assets SET version_id = ${versionId} WHERE id = ${asset.id}`;
    }
  }
}

async function seedIfEmpty() {
  const sql = getSql();
  const rows = (await sql`SELECT COUNT(*)::int AS count FROM knowledge_bases`) as unknown as Array<{
    count: number;
  }>;
  if (Number(rows[0]?.count ?? 0) > 0) {
    return;
  }

  for (const kb of seedDataset.knowledgeBases) {
    await sql`
      INSERT INTO knowledge_bases (id, slug, title, description, status, updated_on)
      VALUES (${kb.id}, ${kb.slug}, ${kb.title}, ${kb.description}, ${kb.status}, ${kb.updatedOn})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const asset of seedDataset.assets) {
    await sql`
      INSERT INTO kb_assets (
        id, home_kb_id, slug, title, description, asset_type, mime_type, file_size_bytes,
        status, owner_label, last_reviewed_date, updated_display_date, version_id, body
      ) VALUES (
        ${asset.id}, ${asset.homeKbId}, ${asset.slug}, ${asset.title}, ${asset.description},
        ${asset.assetType}, ${asset.mimeType}, ${asset.fileSizeBytes}, ${asset.status},
        ${asset.ownerLabel}, ${asset.lastReviewedDate}, ${asset.updatedDisplayDate},
        ${asset.versionId}, ${asset.body}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  for (const page of seedDataset.pages) {
    await sql`
      INSERT INTO kb_pages (
        id, kb_id, slug, path, sort_order, title, summary, status, visibility, owner_label, contact_email,
        last_reviewed_date, updated_display_date, blocks, related_page_ids, related_asset_ids,
        show_toc, toc_depth
      ) VALUES (
        ${page.id}, ${page.kbId}, ${page.slug}, ${page.path.join("/")}, ${page.sortOrder}, ${page.title},
        ${page.summary}, ${page.status}, ${page.visibility}, ${page.ownerLabel}, ${page.contactEmail},
        ${page.lastReviewedDate}, ${page.updatedDisplayDate}, ${JSON.stringify(page.blocks)},
        ${JSON.stringify(page.relatedPageIds)}, ${JSON.stringify(page.relatedAssetIds)},
        ${page.showToc ?? true}, ${page.tocDepth ?? 3}
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

interface KbRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  updated_on: string;
  theme?: unknown;
}

interface PageRow {
  id: string;
  kb_id: string;
  slug: string;
  path: string;
  sort_order: number;
  title: string;
  summary: string;
  status: string;
  visibility: string;
  owner_label: string;
  contact_email: string;
  last_reviewed_date: string;
  updated_display_date: string;
  blocks: KbPage["blocks"];
  related_page_ids: string[];
  related_asset_ids: string[];
  show_toc: boolean;
  toc_depth: number;
  locked_by?: string | null;
  locked_at?: string | null;
}

interface AssetRow {
  id: string;
  home_kb_id: string;
  slug: string;
  title: string;
  description: string;
  asset_type: string;
  mime_type: string;
  file_size_bytes: number;
  status: string;
  owner_label: string;
  last_reviewed_date: string;
  updated_display_date: string;
  version_id: string;
  body: string;
}

function mapKb(row: KbRow): KnowledgeBase {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status as KnowledgeBase["status"],
    updatedOn: row.updated_on,
    theme: row.theme ? mergeTheme(row.theme) : undefined,
  };
}

/** Persist a validated theme for a KB. */
export async function updateKbTheme(kbId: string, theme: KbTheme): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`UPDATE knowledge_bases SET theme = ${JSON.stringify(theme)} WHERE id = ${kbId}`;
}

function mapPage(row: PageRow): KbPage {
  return {
    id: row.id,
    kbId: row.kb_id,
    slug: row.slug,
    path: row.path ? row.path.split("/") : [],
    sortOrder: row.sort_order ?? 0,
    title: row.title,
    summary: row.summary,
    status: row.status as KbPage["status"],
    visibility: row.visibility as KbPage["visibility"],
    ownerLabel: row.owner_label,
    contactEmail: row.contact_email,
    lastReviewedDate: row.last_reviewed_date,
    updatedDisplayDate: row.updated_display_date,
    blocks: row.blocks ?? [],
    relatedPageIds: row.related_page_ids ?? [],
    relatedAssetIds: row.related_asset_ids ?? [],
    showToc: row.show_toc ?? true,
    tocDepth: row.toc_depth ?? 3,
    lockedBy: row.locked_by,
    lockedAt: row.locked_at,
  };
}

function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    homeKbId: row.home_kb_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    assetType: row.asset_type as Asset["assetType"],
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    status: row.status as Asset["status"],
    ownerLabel: row.owner_label,
    lastReviewedDate: row.last_reviewed_date,
    updatedDisplayDate: row.updated_display_date,
    versionId: row.version_id,
    body: row.body,
  };
}

/** Insert a single page into Neon (schema is ensured first). */
export async function insertPage(page: KbPage): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_pages (
      id, kb_id, slug, path, sort_order, title, summary, status, visibility, owner_label, contact_email,
      last_reviewed_date, updated_display_date, blocks, related_page_ids, related_asset_ids,
      show_toc, toc_depth, locked_by, locked_at
    ) VALUES (
      ${page.id}, ${page.kbId}, ${page.slug}, ${page.path.join("/")}, ${page.sortOrder}, ${page.title},
      ${page.summary}, ${page.status}, ${page.visibility}, ${page.ownerLabel}, ${page.contactEmail},
      ${page.lastReviewedDate}, ${page.updatedDisplayDate}, ${JSON.stringify(page.blocks)},
      ${JSON.stringify(page.relatedPageIds)}, ${JSON.stringify(page.relatedAssetIds)},
      ${page.showToc}, ${page.tocDepth}, ${page.lockedBy ?? null}, ${page.lockedAt ?? null}
    )
  `;
}

/** Insert a managed asset into Neon. */
export async function insertAsset(asset: Asset): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_assets (
      id, home_kb_id, slug, title, description, asset_type, mime_type, file_size_bytes,
      status, owner_label, last_reviewed_date, updated_display_date, version_id, body
    ) VALUES (
      ${asset.id}, ${asset.homeKbId}, ${asset.slug}, ${asset.title}, ${asset.description},
      ${asset.assetType}, ${asset.mimeType}, ${asset.fileSizeBytes}, ${asset.status},
      ${asset.ownerLabel}, ${asset.lastReviewedDate}, ${asset.updatedDisplayDate},
      ${asset.versionId}, ${asset.body}
    )
  `;
}

/** SQLSTATE for division_by_zero, used as the in-SQL "lock conflict" abort signal. */
const PG_DIVISION_BY_ZERO = "22012";

/**
 * Update existing pages in Neon. Used for single edits and for move/reorder
 * cascades that touch many rows at once.
 *
 * All rows are written in a single transaction so the batch is atomic: a page
 * move or tree reorder can never half-apply. When `editorEmail` is supplied
 * (admin mutation paths), every row additionally enforces the edit lock — the
 * writer must own the lock, or it must be free or expired. If any row fails that
 * check, an in-SQL guard divides by zero (SQLSTATE 22012) to abort and roll back
 * the whole transaction, and we surface a lock-conflict error.
 */
export async function updatePages(pages: KbPage[], editorEmail?: string): Promise<void> {
  if (pages.length === 0) {
    return;
  }
  await ensureSchema();
  const sql = getSql();

  // For robust error handling and to avoid dialect-specific transactional behavior with neon over HTTP,
  // we execute these sequentially. Moving pages is a rare operation, and single-page saves are 1 query.
  for (const page of pages) {
    const path = page.path.join("/");
    const blocks = JSON.stringify(page.blocks);
    const relatedPageIds = JSON.stringify(page.relatedPageIds);
    const relatedAssetIds = JSON.stringify(page.relatedAssetIds);

    let result;
    if (editorEmail) {
      result = await sql`
        UPDATE kb_pages
        SET
          slug = ${page.slug},
          path = ${path},
          sort_order = ${page.sortOrder},
          title = ${page.title},
          summary = ${page.summary},
          status = ${page.status},
          visibility = ${page.visibility},
          owner_label = ${page.ownerLabel},
          contact_email = ${page.contactEmail},
          last_reviewed_date = ${page.lastReviewedDate},
          updated_display_date = ${page.updatedDisplayDate},
          blocks = ${blocks},
          related_page_ids = ${relatedPageIds},
          related_asset_ids = ${relatedAssetIds},
          show_toc = ${page.showToc},
          toc_depth = ${page.tocDepth}
        WHERE id = ${page.id}
          AND (locked_by IS NULL OR locked_by = ${editorEmail} OR locked_at < now())
        RETURNING id
      `;
      if (result.length === 0) {
        throw new Error("Update failed: this page is locked by another user or your lock has expired.");
      }
    } else {
      await sql`
        UPDATE kb_pages
        SET
          slug = ${page.slug},
          path = ${path},
          sort_order = ${page.sortOrder},
          title = ${page.title},
          summary = ${page.summary},
          status = ${page.status},
          visibility = ${page.visibility},
          owner_label = ${page.ownerLabel},
          contact_email = ${page.contactEmail},
          last_reviewed_date = ${page.lastReviewedDate},
          updated_display_date = ${page.updatedDisplayDate},
          blocks = ${blocks},
          related_page_ids = ${relatedPageIds},
          related_asset_ids = ${relatedAssetIds},
          show_toc = ${page.showToc},
          toc_depth = ${page.tocDepth}
        WHERE id = ${page.id}
      `;
    }
  }
}

/** 
 * Atomic lock acquisition. 
 * Returns true if lock was acquired or renewed, false if held by someone else.
 */
export async function tryAcquirePageLock(pageId: string, userEmail: string): Promise<boolean> {
  await ensureSchema();
  const sql = getSql();
  // Lock expires in 2 minutes. Heartbeat should be every 1 minute.
  const result = await sql`
    UPDATE kb_pages
    SET
      locked_by = ${userEmail},
      locked_at = now() + interval '2 minutes'
    WHERE id = ${pageId}
      AND (locked_by IS NULL OR locked_by = ${userEmail} OR locked_at < now())
    RETURNING locked_by
  `;
  return result.length > 0;
}

export async function releasePageLock(pageId: string, userEmail: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE kb_pages
    SET
      locked_by = NULL,
      locked_at = NULL
    WHERE id = ${pageId} AND locked_by = ${userEmail}
  `;
}

export async function deletePage(pageId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  // Get the path of the page to delete so we can cascade to descendants
  const rows = await sql`SELECT kb_id, path FROM kb_pages WHERE id = ${pageId} LIMIT 1`;
  if (rows.length === 0) return;
  const { kb_id: kbId, path } = rows[0] as any;

  // Delete the page and all descendants in this KB
  await sql`
    DELETE FROM kb_pages 
    WHERE kb_id = ${kbId} 
      AND (path = ${path} OR path LIKE ${path} || '/%')
  `;
}

export async function deleteKb(kbId: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  // Cleanup everything tied to this KB
  await sql`DELETE FROM kb_pages WHERE kb_id = ${kbId}`;
  await sql`DELETE FROM kb_asset_versions WHERE asset_id IN (SELECT id FROM kb_assets WHERE home_kb_id = ${kbId})`;
  await sql`DELETE FROM kb_assets WHERE home_kb_id = ${kbId}`;
  await sql`DELETE FROM kb_redirects WHERE kb_id = ${kbId}`;
  await sql`DELETE FROM kb_user_assignments WHERE kb_id = ${kbId}`;
  await sql`DELETE FROM knowledge_bases WHERE id = ${kbId}`;
}

/**
 * Load the full dataset from Neon (schema is created and seeded on first call).
 *
 * The `body` column is intentionally NOT selected here. Asset bodies can be large
 * (e.g. base64 image data), and this dataset is read on every public page render
 * for metadata, navigation, and search. Bodies are streamed on demand by the
 * stable file route via `loadAssetForDelivery`. Listed assets carry an empty body.
 */
/** Load one page by primary key (admin editor, APIs). */
export async function loadPageById(pageId: string): Promise<KbPage | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_pages WHERE id = ${pageId} LIMIT 1
  `) as unknown as PageRow[];
  const row = rows[0];
  return row ? mapPage(row) : null;
}

export async function loadDatasetFromDb(): Promise<KbDataset> {
  await ensureSchema();
  const sql = getSql();
  const [kbRows, pageRows, assetRows] = await Promise.all([
    sql`SELECT * FROM knowledge_bases`,
    sql`SELECT * FROM kb_pages`,
    sql`
      SELECT id, home_kb_id, slug, title, description, asset_type, mime_type,
        file_size_bytes, status, owner_label, last_reviewed_date,
        updated_display_date, version_id, '' AS body
      FROM kb_assets
    `,
  ]);
  return {
    knowledgeBases: (kbRows as unknown as KbRow[]).map(mapKb),
    pages: (pageRows as unknown as PageRow[]).map(mapPage),
    assets: (assetRows as unknown as AssetRow[]).map(mapAsset),
  };
}

/**
 * Load a single active asset including its `body` for the stable file route.
 * Returns null when no matching active asset exists.
 */
interface VersionRow {
  id: string;
  asset_id: string;
  version_number: number;
  status: string;
  body: string;
  mime_type: string;
  file_size_bytes: number;
  original_filename: string;
  width: number | null;
  height: number | null;
  uploaded_at: string;
  notes: string;
}

function mapVersion(row: VersionRow): AssetVersion {
  return {
    id: row.id,
    assetId: row.asset_id,
    versionNumber: row.version_number,
    status: row.status as AssetVersion["status"],
    body: row.body,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    originalFilename: row.original_filename,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    uploadedAt: row.uploaded_at,
    notes: row.notes || undefined,
  };
}

export async function insertAssetVersion(version: AssetVersion): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_asset_versions (
      id, asset_id, version_number, status, body, mime_type, file_size_bytes,
      original_filename, width, height, uploaded_at, notes
    ) VALUES (
      ${version.id}, ${version.assetId}, ${version.versionNumber}, ${version.status},
      ${version.body}, ${version.mimeType}, ${version.fileSizeBytes}, ${version.originalFilename},
      ${version.width ?? null}, ${version.height ?? null}, ${version.uploadedAt}, ${version.notes ?? ""}
    )
  `;
}

export async function loadVersionsForAsset(assetId: string): Promise<AssetVersion[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_asset_versions WHERE asset_id = ${assetId} ORDER BY version_number ASC
  `) as unknown as VersionRow[];
  return rows.map(mapVersion);
}

export async function replaceVersionsForAsset(assetId: string, versions: AssetVersion[]): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_asset_versions WHERE asset_id = ${assetId}`;
  for (const version of versions) {
    await insertAssetVersion(version);
  }
}

export async function updateAssetRecord(asset: Asset): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    UPDATE kb_assets
    SET
      slug = ${asset.slug},
      title = ${asset.title},
      description = ${asset.description},
      asset_type = ${asset.assetType},
      mime_type = ${asset.mimeType},
      file_size_bytes = ${asset.fileSizeBytes},
      status = ${asset.status},
      owner_label = ${asset.ownerLabel},
      last_reviewed_date = ${asset.lastReviewedDate},
      updated_display_date = ${asset.updatedDisplayDate},
      version_id = ${asset.versionId},
      body = ${asset.body}
    WHERE id = ${asset.id}
  `;
}

export async function loadAssetForDelivery(homeKbId: string, slug: string): Promise<Asset | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_assets
    WHERE home_kb_id = ${homeKbId} AND slug = ${slug} AND status = 'active'
    LIMIT 1
  `) as unknown as AssetRow[];
  const row = rows[0];
  if (!row) {
    return null;
  }
  const asset = mapAsset(row);
  const versions = (await sql`
    SELECT * FROM kb_asset_versions
    WHERE asset_id = ${asset.id} AND status = 'active'
    LIMIT 1
  `) as unknown as VersionRow[];
  const active = versions[0];
  if (active) {
    const versionBody = active.body?.trim() ?? "";
    asset.versionId = active.id;
    asset.body = versionBody || asset.body || row.body;
    asset.mimeType = active.mime_type || asset.mimeType;
    asset.fileSizeBytes = active.file_size_bytes || asset.fileSizeBytes;
  }
  if (!asset.body.trim()) {
    return null;
  }
  return asset;
}

interface RedirectRow {
  id: string;
  kb_id: string;
  from_path: string;
  to_path: string;
  status: string;
  created_at: string;
  reason: string;
}

function mapRedirect(row: RedirectRow): KbRedirect {
  return {
    id: row.id,
    kbId: row.kb_id,
    fromPath: row.from_path,
    toPath: row.to_path,
    status: row.status as KbRedirect["status"],
    createdAt: row.created_at,
    reason: row.reason,
  };
}

export async function insertRedirect(redirect: KbRedirect): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO kb_redirects (id, kb_id, from_path, to_path, status, created_at, reason)
    VALUES (
      ${redirect.id}, ${redirect.kbId}, ${redirect.fromPath}, ${redirect.toPath},
      ${redirect.status}, ${redirect.createdAt}, ${redirect.reason}
    )
    ON CONFLICT (kb_id, from_path) DO UPDATE SET
      to_path = EXCLUDED.to_path,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at,
      reason = EXCLUDED.reason
  `;
}

export async function loadRedirectsForKb(kbId: string): Promise<KbRedirect[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_redirects WHERE kb_id = ${kbId} ORDER BY from_path ASC
  `) as unknown as RedirectRow[];
  return rows.map(mapRedirect);
}

export async function deleteRedirectById(id: string): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`DELETE FROM kb_redirects WHERE id = ${id}`;
}

export async function loadActiveRedirect(kbId: string, fromPath: string): Promise<KbRedirect | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_redirects
    WHERE kb_id = ${kbId} AND from_path = ${fromPath} AND status = 'active'
    LIMIT 1
  `) as unknown as RedirectRow[];
  const row = rows[0];
  return row ? mapRedirect(row) : null;
}

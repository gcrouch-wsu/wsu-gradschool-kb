import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { seedDataset } from "@/lib/demo-data";
import type { Asset, KbDataset, KbPage, KnowledgeBase } from "@/lib/types";

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

function getSql() {
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

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS knowledge_bases (
          id TEXT PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          updated_on TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS kb_pages (
          id TEXT PRIMARY KEY,
          kb_id TEXT NOT NULL,
          slug TEXT NOT NULL,
          path TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          visibility TEXT NOT NULL DEFAULT 'public',
          owner_label TEXT NOT NULL DEFAULT '',
          contact_email TEXT NOT NULL DEFAULT '',
          last_reviewed_date TEXT NOT NULL DEFAULT '',
          updated_display_date TEXT NOT NULL DEFAULT '',
          blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
          related_page_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
          related_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb
        )
      `;
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`;
      await sql`
        CREATE TABLE IF NOT EXISTS kb_assets (
          id TEXT PRIMARY KEY,
          home_kb_id TEXT NOT NULL,
          slug TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          asset_type TEXT NOT NULL DEFAULT 'document',
          mime_type TEXT NOT NULL DEFAULT '',
          file_size_bytes INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'draft',
          owner_label TEXT NOT NULL DEFAULT '',
          last_reviewed_date TEXT NOT NULL DEFAULT '',
          updated_display_date TEXT NOT NULL DEFAULT '',
          version_id TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_pages_kb_id ON kb_pages(kb_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_assets_home_kb_id ON kb_assets(home_kb_id)`;
      await seedIfEmpty();
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
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
        last_reviewed_date, updated_display_date, blocks, related_page_ids, related_asset_ids
      ) VALUES (
        ${page.id}, ${page.kbId}, ${page.slug}, ${page.path.join("/")}, ${page.sortOrder}, ${page.title},
        ${page.summary}, ${page.status}, ${page.visibility}, ${page.ownerLabel}, ${page.contactEmail},
        ${page.lastReviewedDate}, ${page.updatedDisplayDate}, ${JSON.stringify(page.blocks)},
        ${JSON.stringify(page.relatedPageIds)}, ${JSON.stringify(page.relatedAssetIds)}
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
  };
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
      last_reviewed_date, updated_display_date, blocks, related_page_ids, related_asset_ids
    ) VALUES (
      ${page.id}, ${page.kbId}, ${page.slug}, ${page.path.join("/")}, ${page.sortOrder}, ${page.title},
      ${page.summary}, ${page.status}, ${page.visibility}, ${page.ownerLabel}, ${page.contactEmail},
      ${page.lastReviewedDate}, ${page.updatedDisplayDate}, ${JSON.stringify(page.blocks)},
      ${JSON.stringify(page.relatedPageIds)}, ${JSON.stringify(page.relatedAssetIds)}
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

/** Update existing pages in Neon. Used for page edits and move cascades. */
export async function updatePages(pages: KbPage[]): Promise<void> {
  if (pages.length === 0) {
    return;
  }
  await ensureSchema();
  const sql = getSql();
  for (const page of pages) {
    await sql`
      UPDATE kb_pages
      SET
        slug = ${page.slug},
        path = ${page.path.join("/")},
        sort_order = ${page.sortOrder},
        title = ${page.title},
        summary = ${page.summary},
        status = ${page.status},
        visibility = ${page.visibility},
        owner_label = ${page.ownerLabel},
        contact_email = ${page.contactEmail},
        last_reviewed_date = ${page.lastReviewedDate},
        updated_display_date = ${page.updatedDisplayDate},
        blocks = ${JSON.stringify(page.blocks)},
        related_page_ids = ${JSON.stringify(page.relatedPageIds)},
        related_asset_ids = ${JSON.stringify(page.relatedAssetIds)}
      WHERE id = ${page.id}
    `;
  }
}

/**
 * Load the full dataset from Neon (schema is created and seeded on first call).
 *
 * The `body` column is intentionally NOT selected here. Asset bodies can be large
 * (e.g. base64 image data), and this dataset is read on every public page render
 * for metadata, navigation, and search. Bodies are streamed on demand by the
 * stable file route via `loadAssetForDelivery`. Listed assets carry an empty body.
 */
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
export async function loadAssetForDelivery(homeKbId: string, slug: string): Promise<Asset | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM kb_assets
    WHERE home_kb_id = ${homeKbId} AND slug = ${slug} AND status = 'active'
    LIMIT 1
  `) as unknown as AssetRow[];
  const row = rows[0];
  return row ? mapAsset(row) : null;
}

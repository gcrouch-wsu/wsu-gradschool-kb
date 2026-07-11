import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;
type Query = ReturnType<Sql>;

interface Migration {
  id: string;
  up: (sql: Sql) => Promise<void>;
}

const MIGRATION_ADVISORY_LOCK_ID = 705_202_601;

// Backfill a baseline (revision 1) for every page that has no revisions yet, so
// pages created before revision history still have a recoverable snapshot.
// Idempotent via NOT EXISTS + a deterministic id. The snapshot mirrors
// PageRevisionSnapshot (camelCase keys); path is split from the stored
// '/'-joined string back into an array. Exported so it can be exercised
// directly by the live-DB test suite.
export async function backfillBaselineRevisions(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO kb_page_revisions (id, page_id, kb_id, revision_number, title, author_email, action, snapshot, created_at)
    SELECT
      'revision-backfill-' || p.id,
      p.id,
      p.kb_id,
      1,
      p.title,
      'system',
      'save',
      jsonb_build_object(
        'title', p.title,
        'slug', p.slug,
        'path', CASE WHEN COALESCE(p.path, '') = '' THEN '[]'::jsonb ELSE to_jsonb(string_to_array(p.path, '/')) END,
        'summary', p.summary,
        'status', p.status,
        'visibility', p.visibility,
        'ownerLabel', p.owner_label,
        'contactEmail', p.contact_email,
        'lastReviewedDate', p.last_reviewed_date,
        'blocks', COALESCE(p.blocks, '[]'::jsonb),
        'relatedPageIds', COALESCE(p.related_page_ids, '[]'::jsonb),
        'relatedAssetIds', COALESCE(p.related_asset_ids, '[]'::jsonb),
        'showToc', COALESCE(p.show_toc, true),
        'tocDepth', COALESCE(p.toc_depth, 3),
        'showSummary', COALESCE(p.show_summary, true),
        'showPrintButton', COALESCE(p.show_print_button, true),
        'nextReviewDate', p.next_review_date
      ),
      now()
    FROM kb_pages p
    WHERE NOT EXISTS (SELECT 1 FROM kb_page_revisions r WHERE r.page_id = p.id)
  `;
}

const migrations: Migration[] = [
  {
    id: "001_initial",
    async up(sql) {
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
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_assets_home_slug ON kb_assets(home_kb_id, slug)`;
    },
  },
  {
    id: "002_versions_redirects",
    async up(sql) {
      await sql`
        CREATE TABLE IF NOT EXISTS kb_asset_versions (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          version_number INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          body TEXT NOT NULL DEFAULT '',
          mime_type TEXT NOT NULL DEFAULT '',
          file_size_bytes INTEGER NOT NULL DEFAULT 0,
          original_filename TEXT NOT NULL DEFAULT '',
          width INTEGER,
          height INTEGER,
          uploaded_at TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_asset_versions_asset ON kb_asset_versions(asset_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS kb_redirects (
          id TEXT PRIMARY KEY,
          kb_id TEXT NOT NULL,
          from_path TEXT NOT NULL,
          to_path TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_redirects_from ON kb_redirects(kb_id, from_path)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_redirects_kb ON kb_redirects(kb_id)`;
    },
  },
  {
    id: "003_staged_imports",
    async up(sql) {
      await sql`
        CREATE TABLE IF NOT EXISTS kb_staged_imports (
          id TEXT PRIMARY KEY,
          kb_id TEXT NOT NULL,
          source_type TEXT NOT NULL DEFAULT 'docx',
          original_filename TEXT NOT NULL DEFAULT '',
          source_blob_url TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'uploaded',
          parsed_title TEXT,
          blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
          messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          title TEXT NOT NULL DEFAULT '',
          slug TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          parent_path TEXT NOT NULL DEFAULT '',
          visibility TEXT NOT NULL DEFAULT 'public',
          created_by TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_staged_imports_kb ON kb_staged_imports(kb_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS kb_staged_import_media (
          id TEXT PRIMARY KEY,
          staged_import_id TEXT NOT NULL,
          block_id TEXT NOT NULL,
          temporary_url TEXT NOT NULL DEFAULT '',
          mime_type TEXT NOT NULL DEFAULT '',
          original_filename TEXT NOT NULL DEFAULT '',
          proposed_title TEXT NOT NULL DEFAULT '',
          proposed_slug TEXT NOT NULL DEFAULT '',
          alt_text TEXT NOT NULL DEFAULT '',
          review_status TEXT NOT NULL DEFAULT 'pending',
          width INTEGER,
          height INTEGER
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_staged_import_media_import ON kb_staged_import_media(staged_import_id)`;
    },
  },
  {
    id: "004_enhanced_features",
    async up(sql) {

      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS show_toc BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS toc_depth INTEGER NOT NULL DEFAULT 3`;

      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          full_name TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'editor',
          created_at TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT ''
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS kb_user_assignments (
          kb_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          PRIMARY KEY (kb_id, user_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_user_assignments_user ON kb_user_assignments(user_id)`;
    },
  },
  {
    id: "005_edit_locks",
    async up(sql) {
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS locked_by TEXT`;
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS locked_at TEXT`;
    },
  },
  {
    id: "006_fts_search",
    async up(sql) {

      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS search_vector tsvector`;
      await sql`ALTER TABLE kb_assets ADD COLUMN IF NOT EXISTS search_vector tsvector`;

      await sql`
        UPDATE kb_pages
        SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
                            setweight(to_tsvector('english', coalesce(blocks::text, '')), 'C')
      `;
      await sql`
        CREATE OR REPLACE FUNCTION kb_pages_search_trigger() RETURNS trigger AS $$
        begin
          new.search_vector :=
            setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(new.summary, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(new.blocks::text, '')), 'C');
          return new;
        end
        $$ LANGUAGE plpgsql;
      `;
      await sql`DROP TRIGGER IF EXISTS tsvectorupdate ON kb_pages`;
      await sql`
        CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE
        ON kb_pages FOR EACH ROW EXECUTE FUNCTION kb_pages_search_trigger()
      `;

      await sql`
        UPDATE kb_assets
        SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
                            setweight(to_tsvector('english', coalesce(slug, '')), 'C')
      `;
      await sql`
        CREATE OR REPLACE FUNCTION kb_assets_search_trigger() RETURNS trigger AS $$
        begin
          new.search_vector :=
            setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(new.description, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(new.slug, '')), 'C');
          return new;
        end
        $$ LANGUAGE plpgsql;
      `;
      await sql`DROP TRIGGER IF EXISTS tsvectorupdate_assets ON kb_assets`;
      await sql`
        CREATE TRIGGER tsvectorupdate_assets BEFORE INSERT OR UPDATE
        ON kb_assets FOR EACH ROW EXECUTE FUNCTION kb_assets_search_trigger()
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_kb_pages_search ON kb_pages USING GIN(search_vector)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_assets_search ON kb_assets USING GIN(search_vector)`;
    },
  },
  {
    id: "007_hardening",
    async up(sql) {

      await sql`ALTER TABLE kb_pages ALTER COLUMN locked_at TYPE TIMESTAMPTZ USING NULLIF(locked_at, '')::TIMESTAMPTZ`;

      await sql`
        CREATE OR REPLACE FUNCTION kb_extract_blocks_text(blocks jsonb) RETURNS text AS $$
        declare
          block jsonb;
          result text := '';
        begin
          if blocks is null or jsonb_typeof(blocks) <> 'array' then
            return '';
          end if;
          for block in select * from jsonb_array_elements(blocks)
          loop
            if block->>'text' is not null then
              result := result || ' ' || (block->>'text');
            end if;
            if block->>'caption' is not null then
              result := result || ' ' || (block->>'caption');
            end if;
            if jsonb_typeof(block->'items') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(item_text, ' ')
                   from jsonb_array_elements_text(block->'items') as items_t(item_text)), '');
            end if;
            if jsonb_typeof(block->'rows') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(cell, ' ')
                   from (select row_el
                           from jsonb_array_elements(block->'rows') as r(row_el)
                          where jsonb_typeof(row_el) = 'array') rows_only,
                        jsonb_array_elements_text(rows_only.row_el) as c(cell)), '');
            end if;
            if block->>'type' = 'card' and jsonb_typeof(block->'blocks') = 'array' then
              result := result || ' ' || kb_extract_blocks_text(block->'blocks');
            end if;
          end loop;
          return trim(result);
        end
        $$ LANGUAGE plpgsql IMMUTABLE;
      `;

      await sql`
        CREATE OR REPLACE FUNCTION kb_pages_search_trigger() RETURNS trigger AS $$
        begin
          new.search_vector :=
            setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(new.summary, '')), 'B') ||
            setweight(to_tsvector('english', coalesce(kb_extract_blocks_text(new.blocks), '')), 'C');
          return new;
        end
        $$ LANGUAGE plpgsql;
      `;

      await sql`
        UPDATE kb_pages
        SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
                            setweight(to_tsvector('english', coalesce(kb_extract_blocks_text(blocks), '')), 'C')
      `;
    },
  },
  {
    id: "008_cross_kb_aliases",
    async up(sql) {
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS alias_target_id TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_pages_alias ON kb_pages(alias_target_id) WHERE alias_target_id IS NOT NULL`;
    },
  },
  {
    id: "009_editor_note_search",
    async up(sql) {

      await sql`
        CREATE OR REPLACE FUNCTION kb_extract_blocks_text(blocks jsonb) RETURNS text AS $$
        declare
          block jsonb;
          result text := '';
        begin
          if blocks is null or jsonb_typeof(blocks) <> 'array' then
            return '';
          end if;
          for block in select * from jsonb_array_elements(blocks)
          loop
            if block->>'text' is not null then
              result := result || ' ' || (block->>'text');
            end if;
            if block->>'caption' is not null then
              result := result || ' ' || (block->>'caption');
            end if;
            if jsonb_typeof(block->'items') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(item_text, ' ')
                   from jsonb_array_elements_text(block->'items') as items_t(item_text)), '');
            end if;
            if jsonb_typeof(block->'rows') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(cell, ' ')
                   from (select row_el
                           from jsonb_array_elements(block->'rows') as r(row_el)
                          where jsonb_typeof(row_el) = 'array') rows_only,
                        jsonb_array_elements_text(rows_only.row_el) as c(cell)), '');
            end if;
            if block->>'type' = 'card' and jsonb_typeof(block->'blocks') = 'array' then
              result := result || ' ' || kb_extract_blocks_text(block->'blocks');
            end if;
          end loop;
          return trim(result);
        end
        $$ LANGUAGE plpgsql IMMUTABLE;
      `;

      await sql`
        UPDATE kb_pages
        SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
                            setweight(to_tsvector('english', coalesce(kb_extract_blocks_text(blocks), '')), 'C')
      `;
    },
  },
  {
    id: "010_kb_theme",
    async up(sql) {

      await sql`ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS theme JSONB`;
    },
  },
  {
    id: "011_page_show_summary",
    async up(sql) {
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS show_summary BOOLEAN NOT NULL DEFAULT TRUE`;
    },
  },
  {
    id: "012_video_columns",
    async up(sql) {

      await sql`ALTER TABLE kb_assets ADD COLUMN IF NOT EXISTS video_provider TEXT`;
      await sql`ALTER TABLE kb_assets ADD COLUMN IF NOT EXISTS video_external_id TEXT`;
      await sql`ALTER TABLE kb_assets ADD COLUMN IF NOT EXISTS video_url TEXT`;
    },
  },
  {
    id: "013_alt_text_and_fts_index",
    async up(sql) {

      await sql`ALTER TABLE kb_assets ADD COLUMN IF NOT EXISTS alt_text TEXT NOT NULL DEFAULT ''`;

      await sql`CREATE INDEX IF NOT EXISTS idx_kb_pages_staff_prune ON kb_pages(kb_id, visibility, path)`;
    },
  },
  {
    id: "014_site_settings",
    async up(sql) {

      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          id TEXT PRIMARY KEY DEFAULT 'singleton',
          home_eyebrow TEXT NOT NULL DEFAULT '',
          home_title TEXT NOT NULL DEFAULT '',
          home_intro TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
    },
  },
  {
    id: "015_audit_log_and_procedure_sections",
    async up(sql) {
      await sql`
        CREATE TABLE IF NOT EXISTS kb_audit_log (
          id TEXT PRIMARY KEY,
          actor_email TEXT NOT NULL DEFAULT '',
          actor_role TEXT NOT NULL DEFAULT '',
          action TEXT NOT NULL DEFAULT '',
          entity_type TEXT NOT NULL DEFAULT '',
          entity_id TEXT NOT NULL DEFAULT '',
          entity_label TEXT NOT NULL DEFAULT '',
          kb_id TEXT,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_audit_created ON kb_audit_log(created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_audit_entity ON kb_audit_log(entity_type, entity_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_audit_kb ON kb_audit_log(kb_id)`;

      await sql`
        CREATE OR REPLACE FUNCTION kb_extract_blocks_text(blocks jsonb) RETURNS text AS $$
        declare
          block jsonb;
          result text := '';
        begin
          if blocks is null or jsonb_typeof(blocks) <> 'array' then
            return '';
          end if;
          for block in select * from jsonb_array_elements(blocks)
          loop
            if block->>'text' is not null then
              result := result || ' ' || (block->>'text');
            end if;
            if block->>'title' is not null and block->>'type' in ('card', 'procedure_section') then
              result := result || ' ' || (block->>'title');
            end if;
            if block->>'caption' is not null then
              result := result || ' ' || (block->>'caption');
            end if;
            if jsonb_typeof(block->'items') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(item_text, ' ')
                   from jsonb_array_elements_text(block->'items') as items_t(item_text)), '');
            end if;
            if jsonb_typeof(block->'rows') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(cell, ' ')
                   from (select row_el
                           from jsonb_array_elements(block->'rows') as r(row_el)
                          where jsonb_typeof(row_el) = 'array') rows_only,
                        jsonb_array_elements_text(rows_only.row_el) as c(cell)), '');
            end if;
            if block->>'type' in ('card', 'procedure_section') and jsonb_typeof(block->'blocks') = 'array' then
              result := result || ' ' || kb_extract_blocks_text(block->'blocks');
            end if;
          end loop;
          return trim(result);
        end
        $$ LANGUAGE plpgsql IMMUTABLE;
      `;

      await sql`
        UPDATE kb_pages
        SET search_vector = setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
                            setweight(to_tsvector('english', coalesce(kb_extract_blocks_text(blocks), '')), 'C')
      `;
    },
  },
  {
    id: "016_expanded_site_settings",
    async up(sql) {
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_text TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS footer_links JSONB NOT NULL DEFAULT '[]'::jsonb`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS header_links JSONB NOT NULL DEFAULT '[]'::jsonb`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS contact_info TEXT NOT NULL DEFAULT ''`;
    },
  },
  {
    id: "017_single_active_version",
    async up(sql) {
      await sql`
        UPDATE kb_asset_versions v
        SET status = 'replaced'
        WHERE status = 'active'
          AND EXISTS (
            SELECT 1 FROM kb_asset_versions newer
            WHERE newer.asset_id = v.asset_id
              AND newer.status = 'active'
              AND newer.version_number > v.version_number
          )
      `;
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_asset_versions_one_active
        ON kb_asset_versions (asset_id)
        WHERE status = 'active'
      `;
    },
  },
  {
    id: "018_rate_limits",
    async up(sql) {
      await sql`
        CREATE TABLE IF NOT EXISTS kb_rate_limits (
          bucket_key TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          reset_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_rate_limits_reset ON kb_rate_limits(reset_at)`;
    },
  },
  {
    id: "019_content_lifecycle",
    async up(sql) {
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS next_review_date TEXT`;
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`;
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS verified_by TEXT`;
    },
  },
  {
    id: "020_site_settings_global_theme",
    async up(sql) {
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS global_theme JSONB`;
    },
  },
  {
    id: "021_site_settings_home_blocks",
    async up(sql) {
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS home_blocks JSONB NOT NULL DEFAULT '[]'::jsonb`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS show_kb_list BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS kb_list_title TEXT NOT NULL DEFAULT 'Published knowledge bases'`;
    },
  },
  {
    id: "022_site_branding_layout",
    async up(sql) {
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS brand_text TEXT NOT NULL DEFAULT 'WSU Knowledge Base'`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS logo_width INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS header_alignment TEXT NOT NULL DEFAULT 'left'`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS hero_alignment TEXT NOT NULL DEFAULT 'left'`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS content_width INTEGER NOT NULL DEFAULT 0`;
    },
  },
  {
    id: "023_brand_text_style",
    async up(sql) {
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS brand_text_color TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS brand_text_size TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS brand_text_weight TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS brand_text_font TEXT NOT NULL DEFAULT ''`;
    },
  },
  {
    id: "024_kb_list_title_style",
    async up(sql) {
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS kb_list_title_color TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS kb_list_title_size TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS kb_list_title_weight TEXT NOT NULL DEFAULT ''`;
      await sql`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS kb_list_title_font TEXT NOT NULL DEFAULT ''`;
    },
  },
  {
    id: "025_kb_homepage_page",
    async up(sql) {
      await sql`ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS home_page_id TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS idx_knowledge_bases_home_page ON knowledge_bases(home_page_id)`;
    },
  },
  {
    id: "026_page_print_button",
    async up(sql) {
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS show_print_button BOOLEAN NOT NULL DEFAULT TRUE`;
    },
  },
  {
    id: "027_page_revisions",
    async up(sql) {
      await sql`
        CREATE TABLE IF NOT EXISTS kb_page_revisions (
          id TEXT PRIMARY KEY,
          page_id TEXT NOT NULL,
          kb_id TEXT NOT NULL,
          revision_number INTEGER NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          author_email TEXT NOT NULL DEFAULT '',
          action TEXT NOT NULL DEFAULT 'save',
          snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS idx_kb_page_revisions_page
        ON kb_page_revisions(page_id, revision_number DESC)
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_page_revisions_created ON kb_page_revisions(created_at DESC)`;
      // One revision_number per page — the edit lock serialises writers, so a
      // collision means a genuine concurrent save and the transaction should
      // abort rather than silently duplicate a number.
      await sql`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_kb_page_revisions_number
        ON kb_page_revisions(page_id, revision_number)
      `;
      // Give every pre-existing page a baseline revision 1.
      await backfillBaselineRevisions(sql);
    },
  },
  {
    id: "028_page_views",
    async up(sql) {
      await sql`
        CREATE TABLE IF NOT EXISTS kb_page_views (
          page_id TEXT NOT NULL,
          kb_id TEXT NOT NULL,
          day DATE NOT NULL,
          view_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (page_id, day)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_page_views_kb_day ON kb_page_views(kb_id, day DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_page_views_day ON kb_page_views(day DESC)`;
    },
  },
];

export async function runMigrations(sql: Sql): Promise<void> {
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK_ID})`,
    sql`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,
  ]);
  for (const migration of migrations) {
    const applied = (await sql`
      SELECT id FROM _schema_migrations WHERE id = ${migration.id} LIMIT 1
    `) as unknown as Array<{ id: string }>;
    if (applied.length > 0) {
      continue;
    }
    const queries = await collectMigrationQueries(sql, migration);
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(${MIGRATION_ADVISORY_LOCK_ID})`,
      ...queries,
      sql`INSERT INTO _schema_migrations (id) VALUES (${migration.id}) ON CONFLICT (id) DO NOTHING`,
    ]);
  }
}

async function collectMigrationQueries(sql: Sql, migration: Migration): Promise<Query[]> {
  const queries: Query[] = [];
  const collector = ((strings: TemplateStringsArray, ...params: unknown[]) => {
    queries.push(sql(strings, ...params));
    return Promise.resolve([]) as unknown as Query;
  }) as Sql;
  await migration.up(collector);
  return queries;
}

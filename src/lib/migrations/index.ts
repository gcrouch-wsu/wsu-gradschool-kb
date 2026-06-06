import type { NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

interface Migration {
  id: string;
  up: (sql: Sql) => Promise<void>;
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
      // TOC settings for pages
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS show_toc BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS toc_depth INTEGER NOT NULL DEFAULT 3`;

      // User management (project_spec.md §5 Phase 1)
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
      // Add tsvector columns
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS search_vector tsvector`;
      await sql`ALTER TABLE kb_assets ADD COLUMN IF NOT EXISTS search_vector tsvector`;

      // Backfill and create triggers for pages
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

      // Backfill and create triggers for assets
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

      // Create GIN indices for fast search
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_pages_search ON kb_pages USING GIN(search_vector)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_kb_assets_search ON kb_assets USING GIN(search_vector)`;
    },
  },
  {
    id: "007_hardening",
    async up(sql) {
      // 1. Hardening Edit Locks
      // Convert locked_at to timestamptz for atomic server-side expiry checks
      await sql`ALTER TABLE kb_pages ALTER COLUMN locked_at TYPE TIMESTAMPTZ USING NULLIF(locked_at, '')::TIMESTAMPTZ`;

      // 2. Improving Search Quality (De-noising FTS)
      // Create a function to extract plain text from our blocks JSONB structure
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
            -- List items: ["first", "second", ...]
            if jsonb_typeof(block->'items') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(item_text, ' ')
                   from jsonb_array_elements_text(block->'items') as items_t(item_text)), '');
            end if;
            -- Table rows: array of arrays of cell strings
            if jsonb_typeof(block->'rows') = 'array' then
              result := result || ' ' || coalesce(
                (select string_agg(cell, ' ')
                   from (select row_el
                           from jsonb_array_elements(block->'rows') as r(row_el)
                          where jsonb_typeof(row_el) = 'array') rows_only,
                        jsonb_array_elements_text(rows_only.row_el) as c(cell)), '');
            end if;
            -- Recurse into cards
            if block->>'type' = 'card' and jsonb_typeof(block->'blocks') = 'array' then
              result := result || ' ' || kb_extract_blocks_text(block->'blocks');
            end if;
          end loop;
          return trim(result);
        end
        $$ LANGUAGE plpgsql IMMUTABLE;
      `;

      // Update the page search trigger to use the new extraction function
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

      // Re-index all pages with clean text
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
      // Editor notes are internal-only and must never make a published page
      // matchable by their text in public search. Skip them in the extractor
      // (and keep list/table/caption recall + card recursion).
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
            -- Internal editor notes are excluded from the search index.
            if block->>'type' = 'editor_note' then
              continue;
            end if;
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
      // Per-KB "Manage Styles" theme (colors, fonts, type scale, editor allowlists).
      await sql`ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS theme JSONB`;
    },
  },
  {
    id: "011_page_show_summary",
    async up(sql) {
      await sql`ALTER TABLE kb_pages ADD COLUMN IF NOT EXISTS show_summary BOOLEAN NOT NULL DEFAULT TRUE`;
    },
  },
];

export async function runMigrations(sql: Sql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  for (const migration of migrations) {
    const applied = (await sql`
      SELECT id FROM _schema_migrations WHERE id = ${migration.id} LIMIT 1
    `) as unknown as Array<{ id: string }>;
    if (applied.length > 0) {
      continue;
    }
    await migration.up(sql);
    await sql`INSERT INTO _schema_migrations (id) VALUES (${migration.id})`;
  }
}

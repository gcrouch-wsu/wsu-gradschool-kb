# WSU Knowledge Base — Build & Handoff Guide

A public, multi–knowledge-base platform for Washington State University's Graduate School,
replacing public Confluence content. Clean accessible public KBs + a focused admin for pages,
managed assets (images/docs/video), DOCX imports, redirects, and review.

This document is the **handoff reference** for future work: what exists, how it's built, how to
run/test it, the non-obvious gotchas, and ideas for what to build next. Resolved-issue history
lives in git, not here.

---

## 1. Goals

1. Clearer, more polished, more accessible public KB front-ends than Confluence.
2. Multiple public KBs from one app.
3. Images/documents/video as first-class **managed assets**, not loose attachments.
4. Replace an asset's file without breaking its public link.
5. Show where an asset is used before replace/archive.
6. Strong accessibility, search, navigation, and content governance.

## 2. Users & roles

- **Public** — no login; reads published KBs.
- **Owner** — full access (KB-wide), plus user management, KB creation, theming, site settings.
- **Admin** — KB-wide content/asset management.
- **Editor** — scoped to assigned KBs only (`kb_user_assignments`).

Role checks: `requireAdminMutation` (valid same-origin session) + per-route role/scope checks;
KB scope via `canAccessKb` / `accessibleKbIds` / `filterKbsForSession` in `src/lib/auth.ts`.

## 3. Tech stack

- **Next.js 16 / React 19 / TypeScript**, App Router. Server Components for reads; route handlers
  under `src/app/api/admin/**` for mutations.
- **Neon Postgres** (`@neondatabase/serverless`, HTTP driver) — all metadata/content.
- **Vercel Blob** — image/document bytes and temporary DOCX uploads.
- **Styling**: hand-written CSS in `src/app/globals.css` with WSU-brand CSS variables; per-KB theme
  tokens injected as scoped CSS variables.
- **Tests**: Vitest. **CI**: GitHub Actions (`.github/workflows/ci.yml`).

---

## 4. Architecture & key modules

### Content model
- A page's body is a `ContentBlock[]` union (`src/lib/types.ts`): paragraph, heading (H2/H3), list
  with optional custom start number, alert (rendered in the editor as a reader-visible info box),
  image with separate optional caption, table, asset_link, card (recursive, max depth 3), top-level
  procedure_section, video, and section_divider. Legacy block-level editor notes and warning alert
  variants have been fully removed from the content model.
- **Serialization** (`src/lib/page-document.ts`): `blocksToDocumentHtml` (blocks → editor HTML) and
  `documentHtmlToBlocks` (editor HTML → blocks). Inline rich text is sanitized by
  `src/lib/rich-text.ts` (allowlist rebuild; the public renderer uses the same sanitizer).

### Editor (`src/components/PageDocumentEditor.tsx`)
- The editor groups blocks into **sections**; a run of inline blocks renders as one
  `contentEditable` "flow" surface, round-tripped through `page-document.ts` on input/blur.
  Tables, procedure sections, cards, videos, and asset links are their own section editors.
- Toolbar formatting, links, alt text, and **editor notes** live in
  `src/lib/page-editor-format.ts` (selection save/restore + `document.execCommand`, plus DOM
  helpers). Selection plumbing is in `src/lib/rich-text-selection.ts`.
- **Notes are Word-style anchored comments**: a selected-text note wraps the selected text in an
  inline `<span class="doc-note" data-note-body="…">`; a cursor-position note inserts an empty
  `<span class="doc-note doc-note--point" data-note-body="…"></span>` between characters. They
  render as a highlight/pin in the editor and are **stripped from the public page and search** —
  preserved in stored block HTML only because the editor storage paths call
  `sanitizeRichText(html, { keepNotes: true })`; the public `RichText` renderer omits the flag and
  unwraps selected-text notes while dropping point markers. Add/edit/remove via `NoteDialog` +
  `commitNote`/`removeNote` (mirrors the link flow).
- **Procedure sections**: top-level structural panels for complex procedures. They default to H2,
  can be changed to H3, appear in the public TOC, and contain fully mixed content. Section titles
  are manual; numbered lists inside any editor surface can continue numbering with a contextual
  "Starts at" control.
- **Info boxes**: the toolbar label is "Info box" for the single reader-visible info-style alert
  block (`role="note"`). Warning variants were removed; future reader-visible variants should be a
  deliberate product addition rather than legacy support.
- **Publishing readiness**: `AdminPageEditorForm` shows a live client-side checklist for common
  accessibility/governance blockers before the server publish gate runs.

### Assets (`src/lib/kb-store.ts`, `src/lib/asset-lifecycle.ts`)
- Stable public route `/kb/{kbSlug}/files/{assetSlug}` serves the **active version** (so file
  replacement doesn't break links). Version history + usage tracking included.
- Archive means hidden, not deleted. Owners/Admins can permanently delete archived assets only
  when no page references them; deletion removes the asset and its versions. Editors can archive
  assets they can manage but cannot permanently delete them.
- **Video** assets are external links with dedicated columns (`video_provider`,
  `video_external_id`, `video_url`); the file route 307-redirects to the canonical URL
  (`videoDeliveryUrl` in `src/lib/video.ts`), it does not stream bytes.
- Image **alt text** can be saved to the asset's own `alt_text` column (separate from the human
  `description`), and the media picker pre-fills inserted library images from that default when it
  exists. Optional visible captions are stored separately from alt text; when a caption exists and
  alt is empty, the editor offers to use the caption as a starting point but does not force it.

### Search (Postgres FTS, in `kb-store.ts` + `migrations`)
- `tsvector` columns + GIN indices, maintained by a trigger using a block-text extractor that
  indexes paragraph/heading/list/table/caption/procedure-section text (not raw JSON, not editor
  notes).
- `websearch_to_tsquery` + `:*` prefix; query tokens sanitized so punctuation never 500s.
- A correlated `NOT EXISTS` prune hides any public page under a `staff` ancestor from public search.

### Edit locks (`src/lib/db.ts`)
- DB-backed per-page locks: `tryAcquirePageLock`, 5-minute TTL, 60s client heartbeat, and
  client-side retry grace for brief network drops (`AdminPageEditorForm`). All page writes go through
  `updatePages`, which runs the whole batch in
  **one `sql.transaction`** so a multi-row move/reorder is atomic; a lock conflict on any row
  aborts and rolls back the batch. Status-only changes use `updatePageStatusColumn` (no lock, no
  full-row rewrite). **See the gotcha in §7 about the abort guard.**

### Site settings (`src/lib/site-settings.ts`, `/admin/settings`)
- Owner-editable home hero copy (eyebrow/title/intro), single-row `site_settings` table, read by
  the home page; falls back to defaults when unset or no DB.

### Audit log (`src/lib/audit-log.ts`, `/admin/audit`)
- Owner/Admin-only global audit page with basic filters for search, action, entity type, KB, and
  date range. It stores actor metadata, action, entity metadata, KB id, timestamp, and small JSON
  details only; it intentionally does not store full before/after snapshots.
- Current audited actions cover page creation/update/publish/archive/delete and asset
  upload/metadata/status/version/delete actions.

### Home page (`src/app/page.tsx`)
- Renders published KBs as a **list** (scales better than cards). A signed-in **editor** also sees
  their assigned KBs (drafts badged); owners/admins/public see all published.

### Page archive/delete policy
- Archive means hidden from the public site, not deleted. Editors can archive pages in their
  assigned KBs. Owners/Admins can permanently delete only after a page is archived.
- Permanent page deletion is blocked while child pages exist or another page references the page as
  a related page. This keeps page trees and cross-links coherent.

### Imports & redirects
- DOCX staged import (`/admin/import`) with style/image extraction and review before commit.
- Auto-redirects recorded when a published page's path changes; managed at `/admin/redirects`.

---

## 5. Data model & migrations

- Schema is created and migrated **automatically on first request** when `DATABASE_URL` is set —
  there is no manual migration step. Versioned migrations live in `src/lib/migrations/index.ts`
  (tracked in `_schema_migrations`); `ensureSchema()` runs migrations → seeds (if empty) → app-side
  backfills. Current head: **`015_audit_log_and_procedure_sections`**.
- Core tables: `knowledge_bases`, `kb_pages`, `kb_assets`, `kb_asset_versions`, `kb_redirects`,
  `kb_staged_imports` (+ media), `users`, `kb_user_assignments`, `site_settings`,
  `kb_audit_log`.
- Seed data: `src/lib/demo-data.ts` (used both for the no-DB in-memory mode and first-run seeding).

---

## 6. Running, testing, CI

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run check      # tsc --noEmit
npm test           # Vitest unit suite (in-memory; live-DB tests self-skip)
npm run test:a11y  # Playwright + axe smoke tests for public pages
npm run test:db    # live-DB integration suite against DATABASE_URL (reads .env.local)
```

**Environment** (`.env.local`; see `.env.example`):
- `KB_ADMIN_EMAIL` / `KB_ADMIN_PASSWORD` / `KB_ADMIN_SESSION_SECRET` — bootstrap owner + cookie
  signing (aliases `BOOTSTRAP_OWNER_*` also accepted). Required in production.
- `DATABASE_URL` — Neon connection string. **Unset = in-memory seed mode** (fine for quick local UI
  work; not durable). Set = Neon (schema auto-creates/seeds).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob; without it, DOCX import skips images.

**CI** (`.github/workflows/ci.yml`): on every push/PR runs type-check, unit tests, production
build, and public-page axe smoke tests against the in-memory seed dataset. It runs
`npm run test:db` **only when a `DATABASE_URL` repo secret is set** (point it at a dedicated Neon
**test** branch — the suite writes/deletes data). The live-DB step is set per-step, never job-wide,
so the in-memory run never sees a database.

---

## 7. Conventions & gotchas (read before changing these areas)

- **Postgres folds constant expressions at plan time.** The edit-lock abort guard divides by the
  *non-constant* updated-row count — `SELECT 1 / (SELECT count(*) FROM updated)`. A literal `1 / 0`
  is folded and raises on **every** save, not just conflicts. Keep the divisor runtime-evaluated.
- **`sanitizeRichText` is used for both storage and public render.** Notes survive only with
  `{ keepNotes: true }` (editor storage paths in `page-document.ts`); the default strips them. Don't
  flip the default on, or note bodies leak to the public page/search.
- **`getDataset()` in `kb-store.ts` is wrapped in React `cache()`.** Within a request it memoizes;
  raw SQL writes won't be reflected by a cached read in the same request. Tests that need the real
  write path use the lower-level `db.ts` functions directly.
- **`@next/env` skips `.env.local` when `NODE_ENV=test`.** The DB test setup
  (`vitest.db.setup.ts`) parses `.env.local` manually for that reason.
- **In-memory vs Neon**: everything works without a DB via the seed dataset, but locks, FTS, users,
  assignments, theming persistence, and site settings only do something real with `DATABASE_URL`.
- **The editor surface binds once** (stable ref callback in `PageDocumentEditor`); re-creating the
  ref each render previously thrashed selection/caret. Keep callbacks stable / behind refs.
- **Editor debug panel** is opt-in only (`?editorDebug=1` or `localStorage["kb-editor-debug"]="1"`),
  not on by default in dev.

---

## 8. Current feature status

**Working & verified (unit + live-DB):**
- Multi-KB public site, 3-column docs layout, breadcrumbs, depth-controlled right-rail TOC.
- Block editor (rich text, alignment, links, media picker, cards, tables, video, info boxes,
  procedure sections, selected-text notes, cursor-position note pins, separate captions/alt text,
  and continued numbering controls).
- Managed assets with stable links + versions; managed video model; per-image alt text.
- Postgres FTS with staff-visibility prune and punctuation safety.
- Auth (HMAC cookies), Owner/Admin/Editor roles, per-KB editor scoping on mutations **and** list
  views; owner-only user management with a search+chips KB-assignment picker.
- Per-KB theming ("Manage Styles"); owner Site Settings; summary-display toggle.
- DOCX staged import; auto-redirects.
- Edit locks with atomic multi-row writes; accessible PDF export; publishing gate.
- Owner/Admin audit log; archive-first permanent delete with reference safeguards.
- CI (type-check + unit + build + public axe smoke tests always; live-DB when the secret is
  configured).

**Thin / partial:**
- KB management: create/edit + theming exist; **templates and advanced per-KB settings** are thin.
- Asset library: table + media picker + alt/description editing; **no advanced file management or
  direct-to-blob large uploads**.
- Notes UX: inline highlight + point pin only (no positioned margin rail).
- TOC: no scroll-spy active-section highlighting.

## 9. Known limitations

- No per-KB "manager/admin" tier — Admin is all-or-nothing (KB-wide).
- The contenteditable editor is custom; complex selection edge cases may still surface and should be
  verified in a real browser after editor changes.
- Rate limiting exists for login/search but hasn't been load-verified.

---

## 10. Future improvement ideas

**Editor**
- Notes: a positioned **margin/comment rail** (true Word-style), comment threads/resolve, and a
  hardened editor core (e.g., a maintained rich-text framework) if contenteditable
  selection bugs persist.

**Public experience**
- Home: search/filter and pagination as KB count grows; optional grouping/categories.
- TOC scroll-spy; "copy link to heading"; previous/next page navigation.

**KB management**
- KB **templates** and advanced per-KB settings (default visibility, nav options, landing layout).
- Bulk page operations; trash/restore; scheduled publish.

**Assets**
- Direct-to-Blob large uploads; image variants/resizing; bulk import; richer usage/impact view.

**Governance & ops**
- Per-KB activity feed built from the global audit log.
- Add `npm run test:db` to CI against an ephemeral Neon branch per PR (currently one shared secret).
- More integration coverage (publish gate, import commit, redirect creation) in the gated suite.
- Broader accessibility regression coverage beyond the current public-page axe smoke tests and a
  real rate-limit load test.

## 23. Post-Launch Roadmap & Maintenance

Based on the final production audit, the following items are prioritized for post-launch:

1. **Heading Levels in Cards**: Card titles currently use a `strong` tag. To support better accessibility in deep documents, add a level selector (H2/H3) to card blocks to align with the document outline.
2. **Search Tuning**: Monitor Postgres FTS weights (`setweight`) as content grows. Current weights: A (title), B (summary), C (blocks).
3. **Session Security**: Ensure the `kb_admin_session` cookie remains pinned to `Secure; HttpOnly; SameSite=Lax` in all production environments.

## 24. Global Content & Data Retention

1. **Audit Log Retention**: Audit log entries (Section 21) shall be retained for **30 days** before being eligible for automated cleanup.
2. **Site-Wide Editable Content**: Global page content, including headers, footers, and site-wide labels, shall be stored in the `site_settings` table. 
3. **Owner Management**: A dedicated "Settings" tab/screen shall be accessible strictly to users with the **Owner** role. This screen allows editing of:
   - Home page hero content (eyebrow, title, intro).
   - Global Header/Footer text and links.
   - Platform-wide contact information.

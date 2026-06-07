# WSU Knowledge Base — Project Spec & AI Handoff

**Mission: replace Confluence with a much better, fully accessible app for public knowledge bases.**

This is a public, multi–knowledge-base platform for Washington State University's Graduate School. It
exists to retire public Confluence content and deliver something measurably better in its place:
faster, cleaner, easier to navigate, and accessible to everyone — paired with a focused admin for
pages, managed assets (images/docs/video), DOCX imports, redirects, and review.

**This document is the canonical reference.** The source tree is intentionally comment-free, so the
rationale, architecture, gotchas, and roadmap live here rather than inline. It is written to get a
new contributor — human or AI agent — up to speed quickly: the goal, the scope, how it's built, how
to run/test it, the non-obvious gotchas, and the prioritized backlog. Resolved-issue history lives in
git, not here.

> Quick map: §1–2 (goal & scope) → §3 (roles) → §4 (stack) → §5 (architecture) → §6 (data) →
> §7 (run/test) → **§8 (gotchas — read before editing core areas)** → §9–10 (status & limits) →
> §11 (future work) → §12 (tagged AI-agent backlog).

---

## 1. Goal

**Replace public Confluence with a much better, fully accessible KB app.** Confluence is the baseline
to beat on every axis — readability, navigation, search, page polish, file handling, and especially
accessibility. The platform serves multiple public KBs from a single deployment, governed by a small
editorial team, with accessibility treated as a first-class, non-negotiable requirement (the target
is WCAG 2.1 AA, enforced by a publish-time gate and automated axe checks — see §5/§7).

Concretely, the platform must:

1. Provide cleaner, more polished, more navigable public KB front-ends than Confluence.
2. Be **fully accessible**: semantic markup, keyboard operability, sufficient contrast, alt text, and
   correct heading/landmark structure — verified, not assumed.
3. Serve multiple public KBs from one deployment.
4. Treat images/documents/video as first-class **managed assets**, not loose attachments.
5. Replace an asset's file without breaking its public link.
6. Show where an asset is used before replace/archive.
7. Offer strong search, navigation, content governance, and a smooth migration path off Confluence
   (DOCX import + automatic redirects so existing links keep working).

## 2. Scope

**In scope (built):** public multi-KB reading experience; a custom block/rich-text editor; managed
assets with versioning and stable URLs; Postgres full-text search; Owner/Admin/Editor auth with
per-KB scoping; per-KB theming and owner-level site settings; DOCX staged import; automatic
redirects; DB-backed edit locks; a publish-time accessibility/governance gate; an audit log; and
accessible PDF export.

**Out of scope (intentionally, for now):** an approval/review *workflow* (editors publish directly,
gated by the publish checks); a per-KB "manager" role tier; a public account system (the public is
anonymous); WYSIWYG parity with Word; and real-time multi-cursor co-editing (concurrency is handled
with locks, not CRDTs).

---

## 3. Users & roles

- **Public** — no login; reads published KBs.
- **Owner** — full access (KB-wide), plus user management, KB creation, theming, site settings.
- **Admin** — KB-wide content/asset management.
- **Editor** — scoped to assigned KBs only (`kb_user_assignments`).

Role checks: `requireAdminMutation` (valid session + same-origin request) plus per-route role/scope
checks. KB scope is enforced via `canAccessKb` / `accessibleKbIds` / `filterKbsForSession` in
`src/lib/auth.ts`, applied to **both** mutations (`requireKbAccess`) and admin list views.

## 4. Tech stack

- **Next.js 16 / React 19 / TypeScript**, App Router. Server Components for reads; route handlers
  under `src/app/api/admin/**` for mutations.
- **Neon Postgres** (`@neondatabase/serverless`, HTTP driver) — all metadata/content.
- **Vercel Blob** (`@vercel/blob`) — image/document bytes and temporary DOCX uploads.
- **DOCX parsing**: `mammoth`; HTML parsing/sanitizing: `node-html-parser`.
- **Styling**: hand-written CSS in `src/app/globals.css` with WSU-brand CSS variables; per-KB theme
  tokens injected as scoped CSS variables.
- **Security headers**: static ones (HSTS, nosniff, Referrer-Policy) in `next.config.ts`; the
  per-request CSP with a unique script nonce is set in `src/proxy.ts` (the App Router middleware).
- **Tests**: Vitest (unit) + Playwright/axe (a11y). **CI**: GitHub Actions (`.github/workflows/ci.yml`).

---

## 5. Architecture & key modules

### Content model
- A page's body is a `ContentBlock[]` union (`src/lib/types.ts`): paragraph, heading (H2/H3), list
  with optional custom start number, alert (rendered in the editor as a reader-visible info box),
  image with separate optional caption, table, asset_link, card (recursive, max depth 3), top-level
  procedure_section, video, and section_divider.
- **Serialization** (`src/lib/page-document.ts`): `blocksToDocumentHtml` (blocks → editor HTML) and
  `documentHtmlToBlocks` (editor HTML → blocks). Inline rich text is sanitized by
  `src/lib/rich-text.ts` (allowlist *rebuild* — the input is parsed and re-emitted from an allowlist
  of inline tags, dropping every attribute except a validated `href`). The public renderer uses the
  same sanitizer.

### Editor (`src/components/PageDocumentEditor.tsx`)
- The editor groups blocks into **sections**; a run of inline blocks renders as one
  `contentEditable` "flow" surface, round-tripped through `page-document.ts` on input/blur. Tables,
  procedure sections, cards, videos, and asset links are their own section editors.
- Toolbar formatting, links, alt text, and editor notes live in `src/lib/page-editor-format.ts`
  (selection save/restore + `document.execCommand`, plus DOM helpers). Selection plumbing is in
  `src/lib/rich-text-selection.ts`.
- **Notes are Word-style anchored comments**: a selected-text note wraps the text in an inline
  `<span class="doc-note" data-note-body="…">`; a cursor-position note inserts an empty
  `doc-note doc-note--point` span. They render as a highlight/pin in the editor and are **stripped
  from the public page and search** — preserved in stored block HTML only because the editor storage
  paths call `sanitizeRichText(html, { keepNotes: true })`; the public `RichText` renderer omits the
  flag. Add/edit/remove via `NoteDialog` + `commitNote`/`removeNote`.
- **Procedure sections**: top-level structural panels for complex procedures. Default to H2, can be
  H3, appear in the public TOC, and contain fully mixed content.
- **Info boxes**: the single reader-visible info-style alert block (`role="note"`); toolbar label is
  "Info box". (Legacy warning variants were removed.)
- **Publishing readiness**: `AdminPageEditorForm` shows a live client-side checklist for common
  accessibility/governance blockers before the server publish gate runs.

### Publish gate (`src/lib/publish-gate.ts`)
- `validatePageForPublish` returns human-readable blocking issues (empty = publishable). Checks:
  required metadata (title, summary, responsible office, valid contact email, last-reviewed date),
  heading-hierarchy skips, tables without a header row/column, images missing alt text (unless
  decorative), references to non-active assets, and vague/empty link text. Because editors publish
  directly, this gate is the primary quality control.

### Assets (`src/lib/kb-store.ts`, `src/lib/asset-lifecycle.ts`)
- Stable public route `/kb/{kbSlug}/files/{assetSlug}` serves the **active version**, so replacing a
  file doesn't break links. Version history + usage tracking included.
- Archive = hidden, not deleted. Owners/Admins can permanently delete archived assets only when no
  page references them. Editors can archive but not permanently delete.
- **Video** assets are external links with dedicated columns (`video_provider`, `video_external_id`,
  `video_url`); the file route 307-redirects to the canonical URL (`videoDeliveryUrl` in
  `src/lib/video.ts`) rather than streaming bytes.
- Image **alt text** has its own `alt_text` column (separate from the human `description`); the media
  picker pre-fills inserted library images from it. Visible captions are stored separately from alt.

### Search (Postgres FTS, in `kb-store.ts` + migrations)
- `tsvector` columns + GIN indices on `kb_pages` and `kb_assets`, kept fresh by **`BEFORE INSERT OR
  UPDATE` triggers** (`tsvectorupdate` / `tsvectorupdate_assets`, migration `006`, function updated
  through `009`/`015`). Pages index title/summary/block-text (via the `kb_extract_blocks_text`
  PL/pgSQL extractor — paragraph/heading/list/table/caption/procedure-section text, not raw JSON or
  notes); assets index title/description/slug. Weights: A (title), B (summary/description), C (body).
- `searchKb` ORs a `:*` prefix `to_tsquery` with `websearch_to_tsquery` and takes the greater rank;
  query tokens are reduced to alphanumerics so punctuation can never raise a syntax error.
- A correlated `NOT EXISTS` prune hides any public page under a `staff` ancestor from public search.

### Edit locks (`src/lib/db.ts`)
- DB-backed per-page locks: `tryAcquirePageLock`, 5-minute TTL, 60s client heartbeat, client-side
  retry grace for brief network drops (`AdminPageEditorForm`). All page writes go through
  `updatePages`, which runs the whole batch in **one `sql.transaction`** so a multi-row move/reorder
  is atomic; a lock conflict on any row aborts and rolls back the batch. Status-only changes use
  `updatePageStatusColumn` (no lock, no full-row rewrite). **See the §8 gotcha about the abort guard.**

### Site settings (`src/lib/db.ts` `loadSiteSettings`/`saveSiteSettings`, `/admin/settings`)
- Owner-editable, single-row `site_settings` table read by the public shell. Covers the home hero
  copy (eyebrow/title/intro), global **header links**, **footer text + links**, and platform
  **contact info**. Falls back to defaults when unset or no DB. The Settings screen is owner-only,
  gated in the UI and at the API.

### Audit log (`src/lib/audit-log.ts`, `/admin/audit`)
- Owner/Admin-only global audit page with filters (search, action, entity type, KB, date range). It
  stores actor metadata, action, entity metadata, KB id, timestamp, and small JSON details only — no
  full before/after snapshots. Audited actions cover page create/update/publish/archive/delete and
  asset upload/metadata/status/version/delete.
- **Retention:** policy is 30 days. `cleanupAuditLog()` implements the purge, **but is not yet wired
  to a scheduler** — see §12 FB-01.

### Home page (`src/app/page.tsx`)
- Renders published KBs as a **list** (scales better than cards). A signed-in **editor** also sees
  their assigned KBs (drafts badged); owners/admins/public see all published.

### Page archive/delete policy
- Archive = hidden from the public site, not deleted. Editors can archive pages in their assigned
  KBs. Owners/Admins can permanently delete only after a page is archived, and only when no child
  pages exist and no other page references it as a related page (keeps trees/cross-links coherent).

### Imports & redirects
- DOCX staged import (`/admin/import`) with style/image extraction and review before commit;
  embedded images are promoted to managed image assets (Blob-backed when configured).
- Auto-redirects recorded when a published page's path changes; managed at `/admin/redirects`.

---

## 6. Data model & migrations

- Schema is created and migrated **automatically on first request** when `DATABASE_URL` is set —
  there is no manual migration step. Versioned migrations live in `src/lib/migrations/index.ts`
  (tracked in `_schema_migrations`); `ensureSchema()` runs migrations → seeds (if empty) → app-side
  backfills. **Current head: `016_expanded_site_settings`.**
- Core tables: `knowledge_bases`, `kb_pages`, `kb_assets`, `kb_asset_versions`, `kb_redirects`,
  `kb_staged_imports` (+ media), `users`, `kb_user_assignments`, `site_settings`, `kb_audit_log`.
- Seed data: `src/lib/demo-data.ts` (used for both the no-DB in-memory mode and first-run seeding).

---

## 7. Running, testing, CI

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
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob; without it, DOCX import skips images and uploads fall back
  to data-backed assets.

**CI** (`.github/workflows/ci.yml`): on every push/PR runs type-check, unit tests, production build,
and public-page axe smoke tests against the in-memory seed dataset. It runs `npm run test:db` **only
when a `DATABASE_URL` repo secret is set** (point it at a dedicated Neon **test** branch — the suite
writes/deletes data). The live-DB step sets `DATABASE_URL` per-step, never job-wide, so the
in-memory run never sees a database.

---

## 8. Conventions & gotchas (read before changing these areas)

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
  assignments, theming persistence, audit log, and site settings only do something real with
  `DATABASE_URL`.
- **The editor surface binds once** (stable ref callback in `PageDocumentEditor`); re-creating the
  ref each render previously thrashed selection/caret. Keep callbacks stable / behind refs.
- **CSP is per-request in `src/proxy.ts`, not `next.config.ts`** — Next emits inline bootstrap
  scripts that need a per-request nonce + `strict-dynamic`. Don't move CSP to static headers, and
  don't add inline `<script>` without the nonce.
- **Editor debug panel** is opt-in only (`?editorDebug=1` or `localStorage["kb-editor-debug"]="1"`).

---

## 9. Current feature status

**Working & verified (unit + live-DB):**
- Multi-KB public site, 3-column docs layout, breadcrumbs, depth-controlled right-rail TOC.
- Block editor (rich text, alignment, links, media picker, cards, tables, video, info boxes,
  procedure sections, selected-text notes, cursor-position note pins, separate captions/alt text,
  continued numbering controls).
- Managed assets with stable links + versions; managed video model; per-image alt text.
- Postgres FTS with staff-visibility prune and punctuation safety.
- Auth (HMAC cookies), Owner/Admin/Editor roles, per-KB editor scoping on mutations **and** list
  views; owner-only user management with a search+chips KB-assignment picker.
- Per-KB theming ("Manage Styles"); owner Site Settings (hero + header/footer/contact).
- DOCX staged import; auto-redirects.
- Edit locks with atomic multi-row writes; accessible PDF export; publishing gate.
- Owner/Admin audit log; archive-first permanent delete with reference safeguards.
- CI (type-check + unit + build + public axe smoke always; live-DB when the secret is configured).

**Thin / partial:**
- KB management: create/edit + theming exist; **templates and advanced per-KB settings** are thin.
- Asset library: table + media picker + alt/description editing; **no advanced file management or
  direct-to-blob large uploads**.
- Notes UX: inline highlight + point pin only (no positioned margin rail).
- TOC: no scroll-spy active-section highlighting.
- Audit-log retention: purge implemented but **not scheduled** (§12 FB-01).

## 10. Known limitations

- No per-KB "manager/admin" tier — Admin is all-or-nothing (KB-wide).
- The contenteditable editor is custom; complex selection edge cases may still surface and should be
  verified in a real browser after editor changes.
- Rate limiting exists for login/search but is **per-instance in-memory**, so it is advisory on
  serverless rather than a hard control (§12 FB-02).
- Bootstrap-owner sessions can't be revoked before their 8h expiry (§12 FB-04).

---

## 11. Future work (overview)

Narrative backlog; the actionable, tagged version is §12.

- **Editor**: positioned margin/comment rail (true Word-style), comment threads/resolve, and a
  hardened editor core (a maintained rich-text framework) if contenteditable selection bugs persist.
- **Public experience**: home search/filter + pagination as KB count grows; TOC scroll-spy;
  "copy link to heading"; previous/next page navigation; card title H2/H3 level selector.
- **KB management**: KB templates and advanced per-KB settings (default visibility, nav options,
  landing layout); bulk page operations; trash/restore; scheduled publish.
- **Assets**: direct-to-Blob large uploads; image variants/resizing; bulk import; richer usage/impact view.
- **Governance & ops**: wire audit-log retention; per-KB activity feed from the audit log; per-PR
  ephemeral Neon DB tests; broader integration + a11y coverage; a real rate-limit load test.

---

## 12. Future Build — AI Agent Suggestions

> **Authored by Claude (Anthropic Opus 4.8), 2026-06-07** — added as part of a full-codebase review
> at the request of the maintainer. Everything in this section is an AI-generated recommendation, not
> yet ratified by a human owner. Treat it as a backlog of *candidate* work: confirm intent before
> acting, and update the `status:` tag as items move.

### How to use this section (for future AI agents and humans)

Each item carries a single-line, machine-readable tag block so an agent can grep, filter, and pick up
work without re-deriving context. Convention:

```
[AI-AGENT-TASK] id:FB-NN  priority:high|med|low  area:<topic>  effort:S|M|L  status:open|in-progress|done|wontfix
```

- **Grep entrypoint:** `grep -n "AI-AGENT-TASK" project_spec.md` lists every candidate task.
- **Before coding:** read the *Touch points* so you load the right files first; honor the gotchas in §8.
- **Definition of done:** satisfy *Acceptance*, keep `npm run check` + `npm test` green, and add/extend a
  test in the gated live-DB suite (`src/lib/ki1.db.test.ts`) when the change touches DB behavior.
- **When you complete or reject an item,** flip its `status:` tag in place and leave a one-line note so
  the audit trail stays in the doc. Do **not** delete items.

Items are ordered by recommended priority.

---

### FB-01 — Wire the audit-log retention job (it is currently dead code)

`[AI-AGENT-TASK] id:FB-01  priority:high  area:governance  effort:S  status:open`

- **Finding:** `cleanupAuditLog()` (`src/lib/audit-log.ts:52`) implements the 30-day purge, but
  **nothing calls it** — there is no cron route and `vercel.json` defines no `crons`. The retention
  policy is unenforced; the table grows unbounded.
- **Why it matters:** a written data-retention commitment is currently not happening. Unbounded growth
  also slowly degrades the `/admin/audit` query.
- **Suggested approach:** add a protected route (e.g. `src/app/api/admin/cron/audit-cleanup/route.ts`)
  that checks a `CRON_SECRET` bearer header, calls `cleanupAuditLog()`, and returns the deleted count.
  Schedule it via `crons`. The platform now recommends `vercel.ts` over `vercel.json` — prefer migrating
  and adding `crons: [{ path: '/api/admin/cron/audit-cleanup', schedule: '0 4 * * *' }]`.
- **Touch points:** `src/lib/audit-log.ts`, `vercel.json` (or new `vercel.ts`), new cron route, `.env.example` (`CRON_SECRET`).
- **Acceptance:** a scheduled invocation deletes rows older than 30 days; the route rejects unauthenticated
  callers; a live-DB test inserts an aged row and asserts it is purged.

### FB-02 — Replace the in-memory rate limiter with a shared store

`[AI-AGENT-TASK] id:FB-02  priority:high  area:security  effort:M  status:open`

- **Finding:** `src/lib/rate-limit.ts` keeps counters on `globalThis`. On serverless/Fluid Compute each
  instance has its own map, so the login and search limits are **per-instance, not global**. An attacker
  spreading requests across warm instances largely bypasses the login lockout
  (`src/app/api/admin/session/route.ts`).
- **Why it matters:** this is the only brute-force control on admin login. It is currently advisory.
- **Suggested approach:** back the limiter with a shared atomic store. Vercel Postgres/KV are retired;
  provision **Upstash Redis via the Vercel Marketplace** (or a Neon table with atomic `INSERT … ON
  CONFLICT … RETURNING`). Keep the `rateLimit()` signature; swap the implementation behind it and fall
  back to in-memory when the store is unconfigured (local dev).
- **Touch points:** `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`, env config.
- **Acceptance:** two simulated instances share one counter; login lockout holds across them; existing
  unit tests still pass against the in-memory fallback.

### FB-03 — Harden managed-document delivery against in-origin HTML execution

`[AI-AGENT-TASK] id:FB-03  priority:high  area:security  effort:S  status:open`

- **Finding:** the asset route (`src/app/kb/[kbSlug]/files/[assetSlug]/route.ts`) serves bodies with
  `Content-Disposition: inline` and echoes the stored, uploader-supplied `mime_type` into `Content-Type`.
  `X-Content-Type-Options: nosniff` and the per-request CSP mitigate the obvious script case, but serving
  arbitrary uploaded bytes **inline, same-origin** is a classic stored-XSS surface (e.g. an SVG or
  `text/html` upload).
- **Why it matters:** editors are semi-trusted, and same-origin HTML/SVG can carry script or phishing
  chrome that rides the user's session origin.
- **Suggested approach:** (a) validate/normalize `mime_type` on upload against an allowlist; (b) serve
  anything outside a small inline-safe set (`application/pdf`, raster images) as
  `Content-Disposition: attachment`; (c) reject `image/svg+xml` or serve it as attachment.
- **Touch points:** file route, `src/components/AdminAssetUploadForm.tsx` + the asset upload API, `src/lib/asset-lifecycle.ts`.
- **Acceptance:** an uploaded `text/html`/SVG asset downloads rather than renders; PDFs/images still preview inline.

### FB-04 — Make bootstrap-owner sessions revocable on credential rotation

`[AI-AGENT-TASK] id:FB-04  priority:med  area:security  effort:S  status:open`

- **Finding:** managed-user tokens embed `version = user.updatedAt`, so editing a user invalidates their
  live sessions (`src/lib/auth.ts:158`). The bootstrap owner uses a constant `version: "1"`; rotating the
  env password/secret does not invalidate issued tokens until the 8h TTL.
- **Why it matters:** if the bootstrap password leaks, rotation does not log out an attacker for up to 8h.
- **Suggested approach:** derive the bootstrap `version` from a short hash of the current session secret
  (or password) so a rotation changes the version and `readAdminSessionToken` rejects stale tokens.
- **Touch points:** `src/lib/auth.ts` (`validateAdminCredentials`, `readAdminSessionToken`).
- **Acceptance:** rotating `KB_ADMIN_SESSION_SECRET`/`KB_ADMIN_PASSWORD` invalidates previously issued bootstrap tokens.

### FB-05 — Add ESLint + lint-in-CI and centralized error logging

`[AI-AGENT-TASK] id:FB-05  priority:med  area:dx-observability  effort:M  status:open`

- **Finding:** there is no `lint` script in `package.json` and no ESLint config; several `catch {}` blocks
  swallow errors silently (e.g. `readAdminSessionToken`, JSON body parses). CI runs type-check + tests +
  axe but not lint.
- **Why it matters:** silent failures are hard to diagnose in production; lint catches a class of bugs the
  type-checker won't.
- **Suggested approach:** add `eslint` with the Next.js config and an `npm run lint` script; add a thin
  logger (`src/lib/log.ts`) and route swallowed errors through it; wire both into CI. Consider a
  Vercel-native error/observability integration for production.
- **Touch points:** `package.json`, new ESLint config, `src/lib/*` catch sites, CI workflow.
- **Acceptance:** `npm run lint` passes in CI; previously-silent error paths emit structured logs.

### FB-06 — Fix the stale FTS docstring and confirm weight tuning

`[AI-AGENT-TASK] id:FB-06  priority:low  area:search  effort:S  status:open`

- **Finding:** the `tsvector` triggers do keep both tables fresh (`tsvectorupdate` /
  `tsvectorupdate_assets`), so search maintenance is sound — but the `searchKb` docstring
  (`src/lib/kb-store.ts:704`) still says *"Until Postgres FTS + aliases land,"* which is no longer true
  and will mislead future agents.
- **Why it matters:** a wrong comment in the search entrypoint causes mis-modeling of the system.
- **Suggested approach:** correct the docstring to describe the shipped FTS. Separately, monitor and tune
  the `setweight` weights (A=title, B=summary/description, C=body) as content grows.
- **Touch points:** `src/lib/kb-store.ts`, optionally `src/lib/migrations/index.ts`.
- **Acceptance:** the docstring reflects the shipped FTS; no behavior change required.

### FB-07 — Add a Permissions-Policy header

`[AI-AGENT-TASK] id:FB-07  priority:low  area:security  effort:S  status:open`

- **Finding:** `next.config.ts` sets HSTS, `X-Content-Type-Options`, and `Referrer-Policy`, and
  `proxy.ts` sets a strong CSP — but no `Permissions-Policy` is emitted.
- **Suggested approach:** add a restrictive default, e.g. `camera=(), microphone=(), geolocation=()`.
- **Touch points:** `next.config.ts` (`headers()`).
- **Acceptance:** responses carry a restrictive `Permissions-Policy`; no feature the app uses is broken.

### FB-08 — Per-PR ephemeral DB tests and broader gated coverage

`[AI-AGENT-TASK] id:FB-08  priority:low  area:ci  effort:M  status:open`

- **Finding:** the live-DB suite runs only against one shared `DATABASE_URL` secret. The publish gate,
  import-commit, and redirect-creation paths have limited integration coverage.
- **Suggested approach:** create an ephemeral Neon branch per PR (Neon GitHub integration) and point
  `test:db` at it; add integration cases for the publish gate, DOCX import commit, and redirect creation.
- **Touch points:** `.github/workflows/ci.yml`, `src/lib/ki1.db.test.ts`.
- **Acceptance:** each PR runs the live-DB suite against an isolated branch that is torn down afterward.

### FB-09 — Editor core hardening

`[AI-AGENT-TASK] id:FB-09  priority:med  area:editor  effort:L  status:open`

- **Finding:** the editor is a custom `contentEditable` surface (`src/components/PageDocumentEditor.tsx`);
  §10 acknowledges complex selection edge cases may still surface.
- **Suggested approach:** evaluate migrating the inline-flow surfaces to a maintained rich-text framework
  (e.g. Lexical/ProseMirror) **behind the existing `page-document.ts` block (de)serialization boundary**,
  so the `ContentBlock` model and sanitizer stay the source of truth. Add the positioned margin/comment
  rail, comment threads, and resolve as a follow-on.
- **Touch points:** `src/components/PageDocumentEditor.tsx`, `src/lib/page-document.ts`, `src/lib/page-editor-format.ts`.
- **Acceptance:** selection/caret edge cases are eliminated in a real browser; block round-trip is unchanged.

### FB-10 — Public reading-experience polish

`[AI-AGENT-TASK] id:FB-10  priority:low  area:public-ux  effort:M  status:open`

- **Items:** TOC scroll-spy active-section highlight; "copy link to heading"; previous/next page nav;
  home search/filter + pagination as KB count grows; **card title H2/H3 level selector** for outline accuracy.
- **Touch points:** `src/components/TableOfContents.tsx`, `src/app/page.tsx`, `src/components/PageBlocks.tsx`, card editor.
- **Acceptance:** each sub-item ships behind its own small PR with an axe smoke check.

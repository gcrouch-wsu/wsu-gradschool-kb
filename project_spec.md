# WSU Knowledge Base — Project Spec & AI Handoff

**Mission: replace Confluence with a much better, fully accessible app for public and private
knowledge bases.**

This is a public-and-private, multi–knowledge-base platform for Washington State University's
Graduate School. It exists to retire Confluence content and deliver something measurably better in its
place: faster, cleaner, easier to navigate, and accessible to the right audience — paired with a
focused admin for pages, managed assets (images/docs/video), DOCX imports, redirects, and review.

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

**Replace Confluence with a much better, fully accessible KB app for public and private audiences.**
Confluence is the baseline to beat on every axis — readability, navigation, search, page polish, file
handling, and especially accessibility. The platform serves multiple KBs from a single deployment:
some KBs are public and anonymously readable, while private KBs require a local, owner-provisioned
login and an explicit KB assignment. Content is governed by a small editorial team, with
accessibility treated as a first-class, non-negotiable requirement. The target is **WCAG 2.1 AA**,
enforced today by a publish-time accessibility/governance gate plus automated axe **smoke** tests on
public routes (see §5/§7). Note the honest status: this is gate + smoke coverage, **not yet a full
WCAG audit** (§10) — agents should not assume every page is fully certified.

Concretely, the platform must:

1. Provide cleaner, more polished, more navigable public and private KB front-ends than Confluence.
2. Be **accessible by construction**: semantic markup, keyboard operability, sufficient contrast, alt
   text, and correct heading/landmark structure — checked at publish time and by axe smoke tests
   (full WCAG audit coverage is still a goal, not a completed state).
3. Serve multiple public and private KBs from one deployment.
4. Treat images/documents/video as first-class **managed assets**, not loose attachments.
5. Replace an asset's file without breaking its public link.
6. Show where an asset is used before replace/archive.
7. Offer strong visibility-aware search, navigation, content governance, and a smooth migration path
   off Confluence (DOCX import + automatic redirects so existing links keep working).

## 2. Scope

**In scope (built today):** public multi-KB reading experience; a custom block/rich-text editor;
managed assets with versioning and stable URLs; Postgres full-text search; Owner/Admin/Editor auth
with per-KB scoping; configurable per-KB homepage pages; per-KB theming, a global default theme, and
owner-level site settings (home content, branding/logo, and layout); DOCX staged import; automatic
redirects; DB-backed edit locks; a publish-time accessibility/governance gate; an audit log; revision
history with restore; and print-to-PDF export (browser print over semantic HTML — see §9 for the exact
mechanism).

**In scope (required next):** first-class private KBs. A KB can be public or private; private KBs are
readable only by signed-in users with read access. Private-KB work includes a local-password `viewer`
role provisioned by Owners, reuse of `kb_user_assignments` for viewer/editor KB access, read gating
for every public surface, visibility-aware asset delivery and search, and owner-facing KB/user controls
for visibility and assignments. This is Phase 1 work and is not yet implemented in the current code.

**In scope (planned second, after Phase 1):** WSU SSO (FB-30) — Entra ID / Azure AD OIDC or SAML for
staff and private-KB viewers, superseding local viewer passwords. Blocked on WSU ITS engagement (app
registration, redirect URIs, role/claims mapping); until it lands, all authentication is local and
owner-provisioned, and Phase 1 must be designed so viewer identities can later be backed by SSO
without re-modeling KB assignments.

**Out of scope (intentionally, for now):** an approval/review *workflow* (editors publish directly,
gated by the publish checks); a per-KB "manager" role tier; self-service public signup — accounts are
provisioned by Owners; WYSIWYG parity with Word; and real-time multi-cursor co-editing (concurrency is
handled with locks, not CRDTs).

---

## 3. Users & roles

- **Anonymous public** — no login; reads published pages in public KBs only.
- **Owner** — full access (KB-wide), plus user management, KB creation, theming, site settings.
- **Admin** — KB-wide content/asset management.
- **Editor** — scoped to assigned KBs for content management (`kb_user_assignments`); after Phase 1,
  editors also read assigned private KBs and all public KBs.
- **Viewer** — Phase 1 target role. Local-password account provisioned by an Owner; reads assigned
  private KBs plus public KBs; sees no admin surfaces and can never reach mutation APIs.

Role checks: `requireAdminMutation` (valid session + same-origin request) plus per-route role/scope
checks. KB scope is enforced via `canAccessKb` / `accessibleKbIds` / `filterKbsForSession` /
`requireKbAccess` in `src/lib/auth.ts` + `src/lib/security.ts`. Phase 1 adds a read-access helper
for public/private KB visibility; use that helper for public home, KB landing/article/search, page
tree, redirects, and asset delivery.

**Intended authorization matrix** (Owner/Admin are KB-wide; Editor is limited to assigned KBs for
mutations; Viewer is read-only and Phase 1):

| Area | Owner | Admin | Editor | Viewer | Scope mechanism |
|------|-------|-------|--------|--------|-----------------|
| Public/private KB read | all | all | public + assigned private | public + assigned private | Phase 1 read-access helper |
| Pages list/edit/publish | all | all | assigned | no | `filterKbsForSession` + `requireKbAccess` |
| KB homepage assignment | all | all | assigned | no | `requireKbAccess` |
| Assets list/edit | all | all | assigned | no | `filterKbsForSession` + `requireKbAccess` |
| Imports (list/detail/edit/delete) | all | all | assigned | no | `requireKbAccess` |
| Redirects (read/create/delete) | all | all | assigned | no | `requireKbAccess` |
| Review dashboard | all | all | assigned | no | `filterKbsForSession` |
| Users / KB management | yes | no | no | no | owner-only |
| Site settings | yes | no | no | no | owner-only |
| Audit log | yes | yes | no | no | owner/admin-only |

**Authorization enforcement contract** (keep this table current when routes move or new admin
surfaces are added):

| Surface | Allowed roles | KB scoping / role gate | Implementation files |
|---------|---------------|------------------------|----------------------|
| `/admin` | Owner/Admin/Editor | Signed-in session only; navigation hides owner/admin-only links but is not the authorization boundary. Phase 1 viewers must redirect to `/`. | `src/app/admin/page.tsx` |
| `/admin/pages`, `/admin/pages/new` | Owner/Admin/all assigned Editors | The pages list uses `filterKbsForSession`; the new-page dropdown calls filtered `GET /api/admin/kbs`; writes must still pass API `requireKbAccess`. | `src/app/admin/pages/page.tsx`, `src/app/admin/pages/new/page.tsx`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/pages/route.ts` |
| `/admin/pages/[pageId]` | Owner/Admin/assigned Editor | Detail page resolves the page's KB and calls `canAccessKb(...)`; failed access returns `notFound()`. | `src/app/admin/pages/[pageId]/page.tsx` |
| Page mutation APIs | Owner/Admin/assigned Editor, except permanent delete Owner/Admin only | `PATCH`, status, layout, lock, and create routes use `requireAdminMutation` plus `requireKbAccess`; permanent delete also checks owner/admin. | `src/app/api/admin/pages/**/route.ts` |
| KB homepage API | Owner/Admin/assigned Editor | Sets or clears `knowledge_bases.home_page_id`; route uses `requireAdminMutation` plus `requireKbAccess(kbId)`. | `src/app/api/admin/kbs/[kbId]/homepage/route.ts` |
| `/admin/assets` and asset picker API | Owner/Admin/assigned Editor | UI lists use `filterKbsForSession`; picker `GET /api/admin/assets` requires a session and `requireKbAccess(kbId)`. | `src/app/admin/assets/page.tsx`, `src/app/api/admin/assets/route.ts` |
| `/admin/assets/[assetId]` | Owner/Admin/assigned Editor | Detail page resolves the asset's home KB and calls `canAccessKb(...)`; failed access returns `notFound()`. | `src/app/admin/assets/[assetId]/page.tsx` |
| Asset mutation APIs | Owner/Admin/assigned Editor, except permanent delete Owner/Admin only | Upload/metadata/status/replace/activate routes use `requireAdminMutation` plus `requireKbAccess`; permanent delete also checks owner/admin. | `src/app/api/admin/assets/**/route.ts` |
| `/admin/import` and staged import APIs | Owner/Admin/assigned Editor | Import list page uses `accessibleKbIds`; collection/item/stage/commit APIs use `requireKbAccess` after resolving or receiving `kbId`. | `src/app/admin/import/page.tsx`, `src/app/admin/import/[stagedImportId]/page.tsx`, `src/app/api/admin/import/**/route.ts` |
| `/admin/redirects` and redirect APIs | Owner/Admin/assigned Editor | UI lists use `filterKbsForSession`; API routes use `requireKbAccess` on the target/resolved KB. | `src/app/admin/redirects/page.tsx`, `src/app/api/admin/redirects/**/route.ts` |
| `/admin/review` | Owner/Admin/assigned Editor | Dashboard data is called with `accessibleKbIds(session)`; owner/admin pass `null` for all KBs. | `src/app/admin/review/page.tsx`, `src/lib/admin-review.ts` |
| `/admin/usage` | Owner/Admin/assigned Editor | Usage analytics are server-rendered from `getUsageAnalyticsForSession(session)`, which scopes through `accessibleKbIds(session)`. | `src/app/admin/usage/page.tsx`, `src/lib/page-views.ts` |
| `/admin/audit` | Owner/Admin only | Server page redirects Editors to `/admin`; audit API surface is not editor-reachable. | `src/app/admin/audit/page.tsx` |
| `/admin/settings`, `/admin/kbs`, `/admin/users` | Owner only | Segment `layout.tsx` redirects non-owners before client UI loads; corresponding write APIs are owner-only. `GET /api/admin/kbs` is intentionally editor-reachable but filtered for page creation. | `src/app/admin/{settings,kbs,users}/layout.tsx`, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/users/**/route.ts` |
| `/admin/kbs/[kbId]/styles` and KB theme APIs | Owner only | Server page and theme API both require `session.role === "owner"`. | `src/app/admin/kbs/[kbId]/styles/page.tsx`, `src/app/api/admin/kbs/[kbId]/theme/route.ts` |
| Auth endpoints | Public sign-in; signed-in logout/session delete | Login is rate-limited and creates signed HMAC cookies; logout/session delete clear the admin cookie. | `src/app/admin/sign-in/page.tsx`, `src/app/api/admin/session/route.ts`, `src/app/api/admin/logout/route.ts` |

For APIs, `requireAdminMutation` means "valid admin session plus same-origin `Origin`/`Referer`";
add it to any new state-changing admin route and keep viewers out of every mutation path. For
editor-reachable data access, add one of the KB scope guards: `requireKbAccess` for API routes,
`filterKbsForSession`/`accessibleKbIds` for list queries, and `canAccessKb(...) -> notFound()` for
server-rendered detail pages. For public/private read access after Phase 1, anonymous users and
signed-in users without access must get `notFound()` rather than a private-KB existence signal.

**Phase 1 public/private read-access surfaces to guard:**

| Surface | Anonymous | Owner/Admin | Editor | Viewer | Required behavior |
|---------|-----------|-------------|--------|--------|-------------------|
| `/` KB list | public KBs only | all KBs | public + assigned KBs | public + assigned KBs | Hide private KBs without read access. |
| `/search` global search | public KBs only | all KBs | public + assigned KBs | public + assigned KBs | Group results by readable KB; never leak private/staff results. |
| `/kb/[kbSlug]` | public KBs only | all KBs | public + assigned KBs | public + assigned KBs | `notFound()` for private KBs without access. |
| `/kb/[kbSlug]/[...pagePath]` | public pages in public KBs | all readable pages | public + assigned KB pages | public + assigned public pages | Staff-only pages require KB read access; viewers never see drafts. |
| `/kb/[kbSlug]/search` | public pages in public KBs | all readable pages | public + assigned KB pages | public + assigned public pages | Search must never leak private/staff results. |
| `/kb/[kbSlug]/files/[assetSlug]` | public assets only | all readable assets | public + assigned KB assets | public + assigned public-page assets | Authorized responses use `Cache-Control: private, no-store`. |

> ✅ **The matrix is enforced at the API, list-view, detail-page, and owner-only-page levels.** Closed
> across several passes (FB-11, FB-15, FB-17, FB-18):
> - **Editor KB scoping** — `requireKbAccess` on the redirects `GET`, the staged-import collection
>   `GET` *and* item `GET`/`PATCH`/`DELETE` (resolving `kbId` first); list/detail views scoped via
>   `accessibleKbIds` / `filterKbsForSession` / `canAccessKb(...) → notFound()`. `GET /api/admin/kbs`
>   returns the editor's assigned KBs (FB-16) so page creation works.
> - **Owner-only screens** — `/admin/settings`, `/admin/kbs`, `/admin/users` are guarded by a segment
>   `layout.tsx` server component that redirects non-owners *before* the client UI loads; their write
>   APIs were already owner-only, and `GET /api/admin/settings` is now owner-only too.
>
> When adding a new editor-reachable route or page, apply the same guard (API: `requireKbAccess`;
> list: `filterKbsForSession`; detail page: `canAccessKb → notFound`; owner-only segment: a guarding
> `layout.tsx`). Per-KB enforcement only takes real effect with `DATABASE_URL` set (assignments live in
> Neon).

## 4. Tech stack

- **Next.js 16 / React 19 / TypeScript**, App Router. Server Components for reads; route handlers
  under `src/app/api/admin/**` for mutations.
- **Neon Postgres** (`@neondatabase/serverless`, HTTP driver) — all metadata/content.
- **Vercel Blob** (`@vercel/blob`) — image/document bytes and temporary DOCX uploads.
- **DOCX parsing**: `mammoth`; HTML parsing/sanitizing: `node-html-parser`.
- **Styling**: hand-written CSS in `src/app/globals.css` with WSU-brand CSS variables; per-KB theme
  tokens injected as scoped CSS variables.
- **Security headers**: static ones (HSTS, nosniff, Referrer-Policy, Permissions-Policy) in
  `next.config.ts`; the per-request CSP with a unique script nonce is set in `src/proxy.ts` (the App
  Router middleware).
- **Tests**: Vitest (unit) + Playwright/axe (a11y) + Playwright editor regressions (`tests/editor`,
  runs against a production server). **CI**: GitHub Actions (`.github/workflows/ci.yml`).

---

## 5. Architecture & key modules

### Content model
- A page's body is a `ContentBlock[]` union (`src/lib/types.ts`): paragraph, heading (H2/H3), list
  with optional custom start number, alert (rendered in the editor as a reader-visible info box),
  image with separate optional caption, table, asset_link, card (recursive, max depth 3), top-level
  procedure_section, video, and section_divider.
- A KB can optionally point `homepagePageId` / `knowledge_bases.home_page_id` at one page in that
  KB. Public `/kb/{kbSlug}` renders that page as the KB landing page when it is visible to the
  current visitor; otherwise it falls back to the generated section list. The homepage page's tree
  link uses `/kb/{kbSlug}` as its canonical URL.
- Pages have a default-on `showPrintButton` / `show_print_button` flag. Public article and
  KB-homepage pages render the browser print-to-PDF affordance only when this flag is not false.
- **Serialization** (`src/lib/page-document.ts`): `blocksToDocumentHtml` (blocks → editor HTML) and
  `documentHtmlToBlocks` (editor HTML → blocks). Inline rich text is sanitized by
  `src/lib/rich-text.ts` (allowlist *rebuild* — the input is parsed and re-emitted from an allowlist
  of inline tags, dropping disallowed attributes). It is not "href-only": anchors keep a validated
  `href` plus an optional `target="_blank"` with a forced `rel="noopener noreferrer"`, and spans keep
  a re-validated inline `style` limited to font-family/size/color. The public renderer uses the same
  sanitizer.

### Editor (`src/components/PageDocumentEditor.tsx`)
- The editor groups blocks into **sections**; a run of inline blocks renders as one
  `contentEditable` "flow" surface, round-tripped through `page-document.ts` on input/blur. Tables,
  procedure sections, cards, videos, and asset links are their own section editors.
- **HTML source mode** is not just a view toggle: textarea edits are parsed through
  `documentHtmlToBlocks` as the user types so Save/Preview use the source draft even if the editor
  never switches back to Visual. Switching back to Visual re-parses the same draft and rebuilds the
  section list.
- Toolbar formatting, links, alt text, and editor notes live in `src/lib/page-editor-format.ts`
  (selection save/restore + `document.execCommand`, plus DOM helpers). Selection plumbing is in
  `src/lib/rich-text-selection.ts`.
- Table cells use `RichTextEditable`; on focus they bind themselves as the active editor surface so
  the shared toolbar can format/link selected text inside a cell. If a new rich-text sub-editor is
  added, it must bind through the same selection pipeline or toolbar commands will act stale.
- Toolbar state is surface-aware: when editing a table cell, page-structure/list controls collapse to
  a "Table cell: text tools only" context badge; when editing an Info box, the toolbar shows text
  formatting plus list controls only; when editing a list item, the toolbar disables impossible
  indent/outdent actions.
- **Keydown pipeline** (`handleEditorKeyDown`): Tab/Shift+Tab list nesting, **Ctrl/Cmd+K** link
  dialog, structural undo/redo (below), and a **heading-merge guard** that stops Backspace/Delete
  from silently demoting H2/H3s when deleting empty lines next to a heading or range-deleting into one.
- **Links**: the link dialog wraps the selection in a highlighted **draft marker span**
  (`doc-link-draft`) while open, so the target stays visible and survives re-renders; commit swaps
  the marker for a real `<a>` via DOM surgery (no `insertHTML`). Bare domains get `https://`, plain
  emails get `mailto:`. No-selection and cross-block selections fail early with a hint.
- **Paste & drop** (`handleEditorPaste`/`handleEditorDrop`): clipboard HTML (Word/Outlook/web) is run
  through `sanitizePageDocument` *at paste time* so the surface always shows what will save; pasted
  H1→H2 and H4–H6→H3. Pasted or dropped **image files upload to the asset library**
  (`POST /api/admin/assets/images`) and insert as proper `doc-image` figures with alt/align/size
  controls — the browser default (bare `<img>`) was silently dropped by the sanitizer.
- **Structural undo** (`src/lib/page-editor-undo.ts`): innerHTML snapshots taken before DOM-surgery
  operations (list indent/outdent, image controls, alt text, link/note commits, heading guard) so
  Ctrl+Z / the toolbar Undo–Redo buttons reverse them; typing hands control back to native undo.
- **Work protection** (`AdminPageEditorForm`): `beforeunload` warning when dirty, plus a debounced
  **localStorage draft backup** (`kb-editor-backup:{pageId}`) with a "Restore draft / Discard"
  banner on reopen; cleared on successful save. The backup snapshot includes lifecycle metadata such
  as `nextReviewDate`, not only body blocks.
- **Draft preview** (`DraftPreviewModal`): renders current unsaved blocks with public article styling
  via `blocksToSourceHtml`; videos/file links appear as placeholders (they resolve server-side).
- **Sanitizer guards** (`page-document.ts`): duplicate `data-block-id`s are re-minted on every
  sanitize (split lists used to share an id → flaky saves); inline `font-size` spans are stripped
  from headings so theme control wins.
- Toolbar extras: **symbol palette** (Ω), **Copy anchor** button when the caret is in a heading,
  keyboard-shortcuts popover, "Starts at" ordered-list control. Nested `<ol>`s stay semantic ordered
  lists and render 1./a./i.; the public renderer emits block-level list-item content when a list item
  contains nested lists so the HTML is valid. Offending H3-before-H2 headings are outlined by
  `markHeadingOrderProblems` (like missing alt).
- **Notes are Word-style anchored comments**: a selected-text note wraps the text in an inline
  `<span class="doc-note" data-note-body="…">`; a cursor-position note inserts an empty
  `doc-note doc-note--point` span. They render as a highlight/pin in the editor and are **stripped
  from the public page and search** — preserved in stored block HTML only because the editor storage
  paths call `sanitizeRichText(html, { keepNotes: true })`; the public `RichText` renderer omits the
  flag. Add/edit/remove via `NoteDialog` + `commitNote`/`removeNote`.
- **Procedure sections**: top-level structural panels for complex procedures. Default to H2, can be
  H3, appear in the public TOC, and contain fully mixed content.
- **Info boxes**: the single reader-visible info-style alert block (`role="note"`). Content is simple
  rich text: inline formatting plus bulleted/numbered lists, including nested list items. Info boxes
  intentionally do not preserve headings, tables, media, dividers, or procedure sections inside the
  callout. Save/load and public rendering use `sanitizeCalloutHtml` so real `<ul>/<ol>/<li>` markup
  survives inside the colored callout. When focused, the toolbar shows text and list tools, but no
  page-structure or insert controls. (Legacy warning variants were removed.)
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
  `src/lib/video.ts`) rather than streaming bytes. The *public page* `video` block renders a
  YouTube/Vimeo `<iframe>` embed (`src/components/PageBlocks.tsx`); the CSP `frame-src` explicitly
  allows `youtube.com` / `youtube-nocookie.com` / `player.vimeo.com` so these embeds load (FB-12).
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
- `/search` runs the same FTS path across all KBs readable by the current requester and groups results
  by KB. Anonymous callers are limited to published KBs' public pages under the current model; Phase 1
  will extend that same scope object to KB-level private visibility and viewers.

### Edit locks (`src/lib/db.ts`)
- DB-backed per-page locks: `tryAcquirePageLock`, 5-minute TTL, 60s client heartbeat, client-side
  retry grace for brief network drops (`AdminPageEditorForm`). All page writes go through
  `updatePages`, which runs the whole batch in **one `sql.transaction`** so a multi-row move/reorder
  is atomic; a lock conflict on any row aborts and rolls back the batch. Status-only changes use
  `updatePageStatusColumn` (no lock, no full-row rewrite). **See the §8 gotcha about the abort guard.**

### Site settings (`src/lib/db.ts` `loadSiteSettings`/`saveSiteSettings`, `src/lib/site-settings.ts`, `/admin/settings`)
- Owner-editable, single-row `site_settings` table read by the public shell (`layout.tsx` + home
  `page.tsx`). The owner-only Settings screen is organized into tabs:
  - **General Header/Footer** — home hero copy (eyebrow/title/intro), global **header links**,
    **footer text + links**, and platform **contact info**.
  - **Logo & Layout** — a site **logo** (uploaded to Vercel Blob via `POST /api/admin/settings/logo`,
    base64 data-URL fallback when Blob is unconfigured) with width control; **brand text** plus its
    own style (color / size / weight / font); and **placement** controls — header alignment, home-hero
    alignment, and max content width.
  - **Home Page Content** — a rich **content-block** editor for the home page and a **KB-list** toggle
    + heading.
  - **Global Styling** — a **global default theme** (`globalTheme`: colors, fonts, type scale,
    **H1-H4 heading color/font/size/effects**, **typography & spacing**, editor palette) that
    individual KBs inherit unless they define their own;
    edited with the shared `ThemeEditor`. The typography group (owner-set defaults, per-KB overridable)
    covers body/heading line-height, body/heading letter-spacing, block spacing, the heading→content
    gap (`spaceAfterHeading`), list item spacing, list indent, and the article reading measure — all
    emitted as CSS variables by `themeToCssVars` and consumed by the `.flow` rhythm system (see §8).
- All values are validated/clamped in `normalizeSiteSettings`; blank fields are blank-safe (the public
  shell omits empty elements and collapses an empty hero rather than rendering stray chrome). Falls
  back to defaults when unset or no DB. Owner-only in the UI and at the API (`GET`/`PUT`).

### Audit log (`src/lib/audit-log.ts`, `/admin/audit`)
- Owner/Admin-only global audit page with filters (search, action, entity type, KB, date range). It
  stores actor metadata, action, entity metadata, KB id, timestamp, and small JSON details only — no
  full before/after snapshots. Audited actions cover page create/update/publish/archive/delete and
  asset upload/metadata/status/version/delete.
- **Retention:** policy is 30 days. `cleanupAuditLog()` implements the purge and
  `/api/admin/cron/audit-cleanup` runs it from Vercel Cron with `CRON_SECRET` bearer auth.

### Home page (`src/app/page.tsx`)
- Renders published KBs as a **list** (scales better than cards). A signed-in **editor** also sees
  their assigned KBs (drafts badged); owners/admins/public see all published.

### KB landing pages (`src/app/kb/[kbSlug]/page.tsx`)
- A KB root route first checks for a configured `homepagePageId`. If the page is visible to the
  current visitor (published/public for public users; published/draft for signed-in staff), the KB
  root renders that page content with the standard left page tree and optional right "On this page"
  rail.
- If no homepage is configured, or the configured page is not visible to the current visitor, the
  route falls back to the generated section-list landing page.
- Direct visits to the homepage page's nested path redirect to `/kb/{kbSlug}` so there is one
  canonical URL for the landing content.
- Public article breadcrumbs were intentionally removed: the left page tree handles cross-page
  hierarchy and the right rail handles in-page headings, so a third navigation layer at the top of
  the article was redundant and created alignment clutter.

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
  backfills. **Current head: `028_page_views`.** Migrations after `018_rate_limits` add content
  lifecycle columns (`019`: `next_review_date` / `verified_at` / `verified_by`), the global default
  site theme (`020`), home content blocks + KB-list controls (`021`), branding/logo + layout columns
  (`022`: `brand_text`, `logo_url`, `logo_width`, `header_alignment`, `hero_alignment`,
  `content_width`), brand-text style columns (`023`: color/size/weight/font), KB-list
  section-heading style columns (`024`: `kb_list_title_color/size/weight/font`), KB homepage page
  assignment (`025`: `knowledge_bases.home_page_id`), per-page print-button visibility
  (`026`: `kb_pages.show_print_button`), page revision history (`027`: `kb_page_revisions` plus
  a baseline revision backfill for pre-existing pages), and page-view analytics
  (`028`: `kb_page_views` daily counters with retention-fold indexes).
- Core tables: `knowledge_bases`, `kb_pages`, `kb_assets`, `kb_asset_versions`, `kb_redirects`,
  `kb_staged_imports` (+ media), `users`, `kb_user_assignments`, `site_settings`, `kb_audit_log`,
  `kb_rate_limits`, `kb_page_revisions`, `kb_page_views`.
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
npm run test:editor # Playwright editor regression suite (builds + starts prod server; see below)
npm run test:db    # live-DB integration suite against DATABASE_URL (reads .env.local)
```

**Editor Playwright suite (`npm run test:editor`, `tests/editor/`)** covers the authenticated
admin page editor. Unlike the a11y suite it must run against a **production server**
(`next build` + `next start`), which the Playwright config starts automatically: the per-request
CSP in `src/proxy.ts` (nonce + `strict-dynamic`) does not hydrate the editor's client handlers under
the `next dev` HMR/eval runtime, so `next dev` leaves the contentEditable surfaces non-interactive.
The config injects bootstrap admin env vars and an empty `DATABASE_URL`, so the suite is hermetic
(in-memory seed dataset, no external database). A one-time sign-in (`auth.setup.ts`) posts to
`/api/admin/session` and shares the cookie via `storageState`; it runs single-worker because tests
share the page lock and the process-global in-memory store.

**Environment** (`.env.local`; see `.env.example`):
- `KB_ADMIN_EMAIL` / `KB_ADMIN_PASSWORD` / `KB_ADMIN_SESSION_SECRET` — bootstrap owner + cookie
  signing (aliases `BOOTSTRAP_OWNER_*` also accepted). Required in production.
- `DATABASE_URL` — Neon connection string. **Unset = in-memory seed mode** (fine for quick local UI
  work; not durable). Set = Neon (schema auto-creates/seeds).
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob; without it, DOCX import skips images and uploads fall back
  to data-backed assets.
- `CRON_SECRET` — bearer token Vercel Cron sends to `/api/admin/cron/audit-cleanup`,
  `/api/admin/cron/revision-cleanup`, and `/api/admin/cron/review-digest`.
- `EMAIL_PROVIDER_URL` / `EMAIL_PROVIDER_TOKEN` / `EMAIL_FROM` — optional HTTP email provider for the
  weekly review-date digest; when unset the digest cron logs structured JSON and reports skipped
  deliveries instead of failing.

**CI** (`.github/workflows/ci.yml`): on pushes to `main` and on PRs, runs type-check, lint, unit
tests, production build, public-page axe smoke tests, and the Chromium editor regression suite against
the in-memory seed dataset. It runs `npm run test:db` **only when a `DATABASE_URL` repo secret is set**
(point it at a dedicated Neon **test** branch — the suite writes/deletes data). The live-DB step sets
`DATABASE_URL` per-step, never job-wide, so the in-memory run never sees a database.

**Current CI status (2026-07-10):** `main` passes the full configured GitHub CI workflow, including
the live-DB `npm run test:db` step after the test fallback KB slugs were made unique per run.

**Per-PR live-DB (`.github/workflows/db-pr.yml`):** an opt-in workflow creates a throwaway Neon branch
per pull request, runs `npm run test:db` against it, and deletes it. Every step is gated on `HAS_NEON`,
so without the `NEON_API_KEY` + `NEON_PROJECT_ID` secrets the job is a green no-op. When configured it
supersedes the single shared `DATABASE_URL` secret above. The gated suite (`src/lib/ki1.db.test.ts`)
covers edit-lock conflicts/rollback/expiry, FTS safety + staff prune, the managed-video model, editor
KB scoping (`canAccessKb` / `accessibleKbIds` / `filterKbsForSession` / scoped review dashboard),
manual redirect persistence, and the single-active-version DB invariant.

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
- **Any rich-text sub-editor must bind the shared toolbar target.** Flow, card, procedure, and table
  cell surfaces all route through `bindPageEditor` / `rich-text-selection.ts`. Saving a range without
  binding the active surface makes toolbar commands fail because the selection is treated as outside
  the editor.
- **Nested list items may contain block children.** `itemHtml` can include nested `<ul>`/`<ol>` markup.
  Public rendering must not wrap that HTML in an inline-only element (`<span>`), or nested lists become
  invalid/misleading. Use the `list-item-rich-text` block wrapper path when nested lists are present.
- **Info-box content is simple rich text, not inline-only text.** Use `sanitizeCalloutHtml` for alert
  storage/rendering so nested `<ul>/<ol>/<li>` survive, but headings/tables/media/sections are flattened
  or dropped. Public rendering must use the `callout-rich-text` block wrapper, not the inline `RichText`
  span path.
- **CSP is per-request in `src/proxy.ts`, not `next.config.ts`** — Next emits inline bootstrap
  scripts that need a per-request nonce + `strict-dynamic`. Don't move CSP to static headers, and
  don't add inline `<script>` without the nonce.
- **CSP `frame-src` must list every embeddable video host.** Public video blocks render YouTube/Vimeo
  `<iframe>`s; the CSP in `src/proxy.ts` allowlists those hosts. If you add a provider in
  `src/components/PageBlocks.tsx` (or `src/lib/video.ts`), add its host to `frame-src` too, or the
  embed silently fails to load. Do **not** add hosts to `script-src`.
- **Print-to-PDF image loading is deliberate.** `PrintPdfButton` eagerly waits for `.article img`
  elements to finish loading/decoding, with a bounded timeout, before calling `window.print()`. Keep
  that preparation path if the button or print flow moves; otherwise browser PDF export can capture
  before lazy/managed images have painted, producing PDFs with missing screenshots.
- **Apply a KB-scope guard on every new editor-reachable route AND page.** Scoping is per-route, not
  global middleware: API routes use `requireKbAccess`, admin list views use `filterKbsForSession` /
  `accessibleKbIds`, and detail/edit server components use `canAccessKb(...) → notFound()`. A new admin
  surface is unscoped until you add one. Per-KB enforcement is real only with `DATABASE_URL`.
- **Do not route anonymous DB reads through full-corpus `getDataset()`.** Public KB/article/tree/asset
  reads use targeted loaders in `src/lib/db.ts` behind the stable `kb-store.ts` API. `getDataset()` may
  remain for admin/write paths that genuinely need broad state, but every new `isDatabaseEnabled()`
  branch needs a matching live-DB test so the in-memory and Neon paths do not drift.
- **Migration `up()` functions must be straight-line, idempotent SQL.** `runMigrations` does not
  execute a migration's `up()` directly: it first replays `up()` against a **collector** that records
  each query and returns an empty result, then runs the recorded queries in one `sql.transaction`
  under `pg_advisory_xact_lock`. Two consequences when adding a migration (Phase 1's `029` is next):
  (1) `up()` cannot branch on query results — every awaited query resolves to `[]` during collection,
  so conditional logic must live *inside* SQL (`IF NOT EXISTS`, `ON CONFLICT`, `WHERE NOT EXISTS`);
  (2) the applied-check runs *before* the lock is taken, so two racing cold starts can both execute
  the same migration — every statement must be individually idempotent, and the `_schema_migrations`
  insert uses `ON CONFLICT DO NOTHING` for that reason.
- **Editor debug panel** is opt-in only (`?editorDebug=1` or `localStorage["kb-editor-debug"]="1"`).
- **Vertical rhythm lives in the `.flow` container, not per-block margins.** Public reading surfaces
  (`.article`, the home content wrapper, `.card__blocks`, `.procedure-section__blocks`) carry the
  `flow` class. `.flow` zeroes each direct child's `margin-block` and adds spacing between siblings via
  the theme-driven `--space-block` / `--space-after-heading` / list vars. Don't add ad-hoc top/bottom
  margins to content blocks — set the theme typography values (or the CSS var fallbacks in `:root`)
  instead, or content drifts out of the shared rhythm. The editor surface (`.wysiwyg-surface`) keeps
  its own spacing and is intentionally **not** a `.flow` container. Line-heights are unitless and sizes
  are rem/ch so everything scales with reader zoom (WCAG 1.4.4/1.4.8/1.4.12).

---

## 9. Current feature status

**Working & verified (2026-07-10):** `main` passes GitHub CI with type-check, lint, unit tests,
production build, public axe smoke tests, authenticated Chromium editor regressions, and live-DB
integration tests when `DATABASE_URL` is configured.

**Complete for the current release baseline:**
- Multi-KB public site, configurable KB homepage pages, 3-column docs layout, hierarchical page-tree
  navigation, depth-controlled right-rail TOC.
- Block editor (rich text, alignment, links, media picker, cards, tables, video, info boxes,
  procedure sections, selected-text notes, cursor-position note pins, separate captions/alt text,
  continued numbering controls).
- Editor hardening round (2026-07, `feature/width-controls` branch): marker-based link dialog with
  URL normalization + Ctrl+K; paste/drop image upload to the asset library; sanitize-at-paste for
  Word/web HTML; heading-merge guard; duplicate block-id re-minting; heading font-size stripping;
  first-item list-indent fix + nested ordered-list numbering; structural undo/redo; symbol palette;
  heading anchor copy; shortcuts popover; `beforeunload` guard + localStorage draft backup/restore;
  draft preview modal. **2026-07-08 follow-up:** source-mode edits now save/preview without switching
  back to Visual; table-cell rich text binds to the shared toolbar; nested list public HTML is valid;
  review-date changes are included in the draft snapshot; list/table toolbar context is clearer;
  Info boxes preserve simple rich text and nested semantic lists through save and public render; Divider,
  Procedure section, and Info box insert controls are visibly labeled.
  **Covered by focused Chromium editor regressions, but still needing manual Chrome/Firefox/mobile QA
  before a production claim (see §10).**
- Managed assets with stable links + versions; managed video model + public YouTube/Vimeo embeds
  (CSP `frame-src` allowlisted); per-image alt text.
- Global and per-KB Postgres FTS with grouped global results, staff-visibility prune, punctuation
  safety, rate limiting, and zero-result gap logging.
- Targeted DB read loaders for public KB/article/tree/asset paths, plus a live-DB parity guard against
  legacy `getDataset()` article lookup; migration batches run under a Postgres advisory transaction
  lock and record applied migrations conflict-safely.
- Auth (HMAC cookies), Owner/Admin/Editor roles; per-KB editor scoping enforced on all editor-reachable
  list views and mutations (pages, assets, imports, redirects, review); owner-only user management.
- Per-KB theming ("Manage Styles") and a **global default theme**; owner Site Settings — home hero +
  rich content blocks, KB-list section, header/footer links, contact, a site **logo + branding**
  (brand text with color/size/weight/font), and **layout** (header/hero alignment, content width),
  all blank-safe.
- DOCX staged import; auto-redirects.
- Edit locks with atomic multi-row writes; print-to-PDF export; publishing gate.
- Page revision history with restore: every create/save snapshots the page, restores are new saves,
  baseline revisions are backfilled by migration `027`, and daily retention cleanup is scheduled.
- Owner/Admin audit log; archive-first permanent delete with reference safeguards.
- Structured JSON error logging for Vercel log drains and an operations checklist in
  `docs/OPERATIONS.md`.
- Weekly review-date digest cron (`/api/admin/cron/review-digest`) for managed DB users, with HTTP
  email-provider delivery when configured and structured JSON fallback when email is unconfigured.
- Owner-only bulk KB export (`/api/admin/kbs/[kbId]/export`) as a streamed ZIP containing `kb.json`,
  standalone semantic page HTML, and active asset-version bytes. The owner-only `kb.json` is a
  full-fidelity backup and can include raw editor-note metadata preserved in stored blocks.
- Privacy-light usage analytics (`kb_page_views`) for published public article/homepage renders,
  scoped admin reporting at `/admin/usage`, and monthly retention folding through the daily cron.
- CI (type-check + lint + unit + build + public axe smoke + Chromium editor regressions always;
  live-DB when the secret is configured) is green on `main` as of 2026-07-10.

**Remaining before a production-compliance claim:**
- Phase 1 private-KB implementation: KB-level public/private visibility, owner-provisioned viewer
  accounts, read gating for every public surface, visibility-aware asset delivery/search, and
  live-DB/in-memory tests for the access matrix.
- Manual Chrome + Firefox + mobile-width editor QA, especially around the custom `contentEditable`
  workflows covered by FB-25/FB-26.
- Manual WCAG 2.1 AA audit of representative public pages and admin/editor workflows. Until this is
  complete, describe the app as accessibility-oriented with publish gates and axe smoke tests, not as
  ADA/WCAG certified.

**Built but with known caveats (verify before relying on):**
- **"Accessible PDF"**: this is the browser's *print-to-PDF* over semantic HTML (`PrintPdfButton` +
  print CSS), which yields a clean, structured print — **not** a server-side tagged-PDF generator (FB-14).
  The export button now waits for article images to load/decode before opening the print dialog, so
  screenshot-heavy KB pages should not lose managed images during PDF export.
- **Accessibility**: enforced by the publish gate + axe **smoke** tests, not a full WCAG 2.1 AA audit.

**Thin / partial:**
- KB management: create/edit + theming exist; **templates and advanced per-KB settings** are thin.
- Asset library: table + media picker + alt/description editing; **no advanced file management or
  direct-to-blob large uploads**.
- Notes UX: inline highlight + point pin only (no positioned margin rail).
- Audit-log retention is a fixed 30-day purge scheduled through Vercel Cron (`project_backlog.md` FB-01).

## 10. Known limitations

- **Accessibility coverage is gate + smoke, not a full WCAG 2.1 AA audit** (§1, §9). Do not describe
  the product as ADA/WCAG certified until a manual audit passes. Public article tables now emit
  `scope="col"` / `scope="row"` on header cells, but this does not replace the manual audit.
- **Private KBs are required scope but not yet implemented** (FB-27). Until Phase 1 lands, KBs are
  effectively public/draft/status-scoped rather than KB-level public/private, and public routes must not
  be described as private-content safe. When Phase 1 lands, private KB pages/assets/search must remain
  dynamic and uncacheable for unauthorized readers.
- **Authentication is intentionally local for now**: owner-provisioned accounts use scrypt password
  hashes and signed HMAC cookies. There is no SSO/OIDC/SAML integration until WSU ITS engagement, and
  no server-side idle-session table or sliding idle timeout beyond the current cookie/token expiry
  behavior.
- No per-KB "manager/admin" tier — Admin is all-or-nothing (KB-wide).
- **The contenteditable editor still needs release-grade QA.** It is custom, and complex selection
  edge cases keep surfacing in real use (heading demotion on delete, list splits with duplicate ids,
  lost pasted images, touchy link insertion, stale HTML-source saves, table-cell toolbar binding, and
  nested-list / Info-box callout rendering were all found by editors/review in 2026-07 and patched
  point-by-point). Every editor change needs manual verification in a real browser (Chrome + Firefox at
  minimum), and further reports should be expected. FB-09 (migrating the flow surfaces to a maintained
  framework) remains the structural fix; FB-25 defines the release-grade browser/a11y gate.
- **Revision history is per-save snapshots, not a diff/branch model** (FB-24, delivered): every page
  create and save writes a full `kb_page_revisions` snapshot, and editors can view/restore any of the
  newest 50 per page from the History panel. There is no side-by-side diff view, no field-level
  restore, and retention is a hard 50/page cap (older revisions are purged by the daily cron). Restore
  is itself a new save, so history is never rewritten.
- Rate limiting falls back to in-memory only when `DATABASE_URL` is unset; production Neon mode uses a
  shared `kb_rate_limits` table (`project_backlog.md` FB-02).
- Review digest email delivery is pluggable HTTP-provider only today; when unconfigured, the weekly
  cron logs structured JSON and returns a non-error skipped-delivery result. Recipients come from
  managed DB users; a bootstrap env owner alone does not receive digest email.
- Usage analytics are aggregate counts only; they intentionally store no cookies, IP addresses, or user
  agents, can include bot/crawler traffic, and are skipped entirely in in-memory mode.

---

## 11. Future work (overview)

Narrative backlog; the actionable, tagged version is `project_backlog.md`.

**The two committed next builds, in order — both need planning before code:**

1. **Phase 1 — private knowledge bases (FB-27).** KB-level `public`/`private` visibility, a
   local-password `viewer` role, one read-access helper (`canReadKb`-style) consumed by every public
   surface, visibility-aware asset delivery and search. Build sequence: read-access helper + `029`
   visibility migration first; convert the existing `isStaff = Boolean(session)` call sites (public
   routes, search scope, page-view recording guards) to the helper as a behavior-preserving refactor;
   then add the viewer role, asset gating, and the access-matrix test suite. Pre-work: verify a
   **fresh-database** `ensureSchema()` bootstrap once against a new Neon branch (the advisory-lock
   collector runner has only ever executed against databases with existing schema), and keep viewers
   excluded from review digests and `/admin/usage`.
2. **WSU SSO (FB-30).** Entra ID / Azure AD OIDC or SAML for staff and private-KB viewers. Blocked on
   WSU ITS engagement; the ITS ask list (app registration, prod + preview redirect URIs, claims/groups
   for role mapping) is in FB-30. Local owner-provisioned accounts remain the break-glass path. Design
   Phase 1 viewer identities so SSO can back them later without re-modeling `kb_user_assignments`.

Other tracked work:

- **Editor / release QA**: finish the FB-25 manual release gate — Chrome + Firefox + mobile-width editor
  QA and a manual WCAG 2.1 AA audit. FB-26 editor UX implementation and Chromium regression coverage are
  delivered; page revision history with restore is delivered (FB-24). Remaining editor enhancements are
  a diff view/configurable revision retention, a positioned margin/comment rail (true Word-style),
  comment threads/resolve, and a hardened editor core (a maintained rich-text framework — FB-09) since
  contenteditable selection bugs keep surfacing.
- **Public experience**: home search/filter + pagination as KB count grows; reader-facing
  "copy link to heading"; previous/next page navigation; card title H2/H3 level selector.
- **KB management**: KB templates and advanced per-KB settings (default visibility, nav options,
  navigation options); bulk page operations; trash/restore; scheduled publish.
- **Assets**: direct-to-Blob large uploads; image variants/resizing; bulk import; richer usage/impact view.
- **Governance & ops**: per-KB activity feed from the audit log; keep GitHub/Neon CI secrets healthy;
  broader integration + a11y coverage; a real rate-limit load test; production monitoring/log review
  and rollback checklist; reader feedback, SEO/discoverability, and third-party error tracking are
  tracked in `project_backlog.md`.

---

## 12. Future Build — AI Agent Suggestions

The tagged future-build backlog has moved to [project_backlog.md](project_backlog.md). Keep AI agent task tags and history there; never delete completed items, and flip status tags in place as work lands.

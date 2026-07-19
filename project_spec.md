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
> §11 (future work) → §12 (tagged AI-agent backlog) → §13 (operations runbook) →
> §14 (Phase 1 build plan — delivered 2026-07-14; retained as the implementation audit trail).

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

**In scope (built today):** public and private multi-KB reading experience; a custom
block/rich-text editor; managed assets with versioning and stable URLs; Postgres full-text search;
Owner/Admin/Editor/Viewer auth with per-KB scoping; configurable per-KB homepage pages; per-KB
theming, a global default theme, and owner-level site settings (home content, branding/logo, and
layout); DOCX staged import; automatic redirects; DB-backed edit locks; a publish-time
accessibility/governance gate; an audit log; revision history with restore; and print-to-PDF export
(browser print over semantic HTML — see §9 for the exact mechanism). Private KBs use KB-level
`public`/`private` visibility, owner-provisioned local-password `viewer` accounts, the existing
`kb_user_assignments` table for viewer/editor access, read gating for every public surface, and
visibility-aware asset delivery/search.

**In scope (built 2026-07-16/17):** cross-page excerpt blocks (§12 FB-33) — live "Included from"
callouts that render another page's current section, reader-visibility-gated, with custom
attribution labels and a new-tab option, themeable like the info box — and the **P&P
sourced-content core** (§12 FB-34): snapshot imports from the Policies & Procedures site inside a
themed "Source:" callout with manual check-for-changes/refresh and a paste-HTML fallback.

**In scope next:** the remaining FB-34 automation — scheduled staleness polling and
review-dashboard "source updated" flags.

**Also in scope next:** WSU SSO (§12 FB-30): Entra ID / Azure AD OIDC or SAML for staff and
private-KB viewers, superseding local viewer passwords. The SSO portion is gated on WSU ITS
engagement (app registration, redirect URIs, role/claims mapping). Keep local owner-provisioned
accounts as the interim and break-glass path, and keep viewer identities keyed so SSO can back them
later without re-modeling KB assignments.

**Out of scope (intentionally, for now):** an approval/review *workflow* (editors publish directly,
gated by the publish checks); a per-KB "manager" role tier; self-service public signup — accounts are
provisioned by Owners; WYSIWYG parity with Word; and real-time multi-cursor co-editing (concurrency is
handled with locks, not CRDTs).

---

## 3. Users & roles

- **Anonymous public** — no login; reads published pages in public KBs only.
- **Owner** — full access (KB-wide), plus user management, KB creation, theming, site settings.
- **Admin** — KB-wide content/asset management.
- **Editor** — scoped to assigned KBs for content management (`kb_user_assignments`); reads all
  published public KBs plus assigned KBs (including assigned drafts).
- **Viewer** — local-password account provisioned by an Owner; reads **published** KBs only —
  published public KBs plus assigned published private KBs; unpublished (draft/archived) KBs are
  staff-only. Viewers see no admin surfaces, can never reach mutation APIs, and never see draft or
  staff-only pages. Assets referenced only by staff-only pages are staff-only in both public and
  private KBs: ordinary readers (anonymous or viewer) can fetch an asset only when at least one
  published, non-staff page references it.

Role checks: `requireAdminMutation` (valid session + same-origin request) plus per-route role/scope
checks. KB scope is enforced via `canAccessKb` / `accessibleKbIds` / `filterKbsForSession` /
`requireKbAccess` in `src/lib/auth.ts` + `src/lib/security.ts`. Public/private read scope is
enforced via `getKbReadAccess` / `filterKbsForReadAccess` in `src/lib/auth.ts`; use that helper for
public home, KB landing/article/search, page tree, redirects, asset delivery, and page-view
recording.

**Authorization matrix** (Owner/Admin are KB-wide; Editor is limited to assigned KBs for mutations;
Viewer is read-only):

| Area | Owner | Admin | Editor | Viewer | Scope mechanism |
|------|-------|-------|--------|--------|-----------------|
| Public/private KB read | all | all | published public + assigned (incl. assigned drafts) | published public + assigned published private | `getKbReadAccess` / `filterKbsForReadAccess` (KB status enforced) |
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
| `/admin` | Owner/Admin/Editor | Signed-in non-viewer session only; navigation hides owner/admin-only links but is not the authorization boundary. Viewers redirect to `/` before the admin shell renders. | `src/app/admin/layout.tsx`, `src/app/admin/page.tsx` |
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
| `/admin/usage` | Owner/Admin/assigned Editor | Usage analytics are server-rendered from `getUsageAnalyticsForSession(session)`, which scopes through `accessibleKbIds(session)`; Viewers redirect to `/`. | `src/app/admin/usage/page.tsx`, `src/lib/page-views.ts` |
| `/admin/audit` | Owner/Admin only | Server page redirects Editors to `/admin`; audit API surface is not editor-reachable. | `src/app/admin/audit/page.tsx` |
| `/admin/settings`, `/admin/kbs`, `/admin/users` | Owner only | Segment `layout.tsx` redirects non-owners before client UI loads; corresponding write APIs are owner-only. `GET /api/admin/kbs` is intentionally editor-reachable but filtered for page creation, and Owner-only user management can assign Editor/Viewer KB access. | `src/app/admin/{settings,kbs,users}/layout.tsx`, `src/app/admin/kbs/page.tsx`, `src/app/admin/users/page.tsx`, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/users/**/route.ts` |
| `/admin/kbs/[kbId]/styles` and KB theme APIs | Owner only | Server page and theme API both require `session.role === "owner"`. | `src/app/admin/kbs/[kbId]/styles/page.tsx`, `src/app/api/admin/kbs/[kbId]/theme/route.ts` |
| Excerpt picker + preview APIs | Owner/Admin/Editor (viewers rejected) | `GET /api/admin/excerpt-sources` filters KBs/pages/headings by the caller's read access (`filterKbsForReadAccess` / `getReadableExcerptSourcePageForPicker` — staff-ancestor rules included); `POST /api/admin/excerpt-preview` resolves refs with the caller's session via `resolveExcerptForRead`. Both use `requireAdminMutation`. | `src/app/api/admin/excerpt-sources/route.ts`, `src/app/api/admin/excerpt-preview/route.ts`, `src/lib/excerpts.ts` |
| Sourced-content import/check APIs | Owner/Admin/Editor (viewers rejected) | `POST /api/admin/sourced-content` and `…/check` use `requireAdminMutation`; outbound fetches are gated by `parseAllowedSourceUrl` (https + host allowlist) — no KB scoping needed, no KB data is read. | `src/app/api/admin/sourced-content/route.ts`, `src/app/api/admin/sourced-content/check/route.ts`, `src/lib/sourced-content.ts` |
| Auth endpoints | Public sign-in; signed-in logout/session delete | Login is rate-limited and creates signed HMAC cookies; logout/session delete clear the admin cookie. | `src/app/admin/sign-in/page.tsx`, `src/app/api/admin/session/route.ts`, `src/app/api/admin/logout/route.ts` |

For APIs, `requireAdminMutation` means "valid admin session plus same-origin `Origin`/`Referer`";
add it to any new state-changing admin route and keep viewers out of every mutation path. For
editor-reachable data access, add one of the KB scope guards: `requireKbAccess` for API routes,
`filterKbsForSession`/`accessibleKbIds` for list queries, and `canAccessKb(...) -> notFound()` for
server-rendered detail pages. For public/private read access after Phase 1, anonymous users and
signed-in users without access must get `notFound()` rather than a private-KB existence signal.

**Public/private read-access enforcement surfaces:**

| Surface | Anonymous | Owner/Admin | Editor | Viewer | Required behavior | Implementation files |
|---------|-----------|-------------|--------|--------|-------------------|----------------------|
| `/` KB list | published public KBs only | all KBs | published public + assigned KBs | published public + assigned published KBs | Hide private KBs without read access. | `src/app/page.tsx`, `src/lib/auth.ts` |
| `/search` global search | published public KBs only | all KBs | published public + assigned KBs | published public + assigned published KBs | Group results by readable KB; never leak private/staff results. | `src/app/search/page.tsx`, `src/lib/kb-store.ts` |
| `/kb/[kbSlug]` | published public KBs only | all KBs | published public + assigned KBs | published public + assigned published KBs | `notFound()` for private KBs without access. | `src/app/kb/[kbSlug]/page.tsx` |
| `/kb/[kbSlug]/[...pagePath]` | public pages in published public KBs | all readable pages | published public + assigned KB pages | published public + assigned published, non-staff pages | Staff-only pages require KB read access; viewers never see drafts. | `src/app/kb/[kbSlug]/[...pagePath]/page.tsx` |
| `/kb/[kbSlug]/search` | public pages in published public KBs | all readable pages | published public + assigned KB pages | published public + assigned published, non-staff pages | Search must never leak private/staff results. | `src/app/kb/[kbSlug]/search/page.tsx`, `src/lib/kb-store.ts` |
| `/kb/[kbSlug]/files/[assetSlug]` | assets with published, non-staff usage in published public KBs | all readable assets | published public + assigned KB assets | assets with published, non-staff usage in readable KBs | Authorized responses use `Cache-Control: private, no-store`; private bytes are streamed through this route instead of redirecting to public Blob URLs. | `src/app/kb/[kbSlug]/files/[assetSlug]/route.ts`, `src/lib/kb-store.ts` |

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
  procedure_section, video, section_divider, top-level excerpt (a live reference to another
  page's section — see §8 and FB-33), and top-level sourced (a snapshot imported from an
  approved external site with provenance metadata — see §8 and FB-34).
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
  by KB. The scope object is built from `getKbReadAccess`: anonymous users see published public KBs
  only; Owners/Admins see all; Editors/Viewers see public KBs plus assigned private KBs. Page and
  asset results are additionally pruned so staff-only pages/assets never leak to callers without
  staff-content access.

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
  backfills. Migrations after `018_rate_limits` add content
  lifecycle columns (`019`: `next_review_date` / `verified_at` / `verified_by`), the global default
  site theme (`020`), home content blocks + KB-list controls (`021`), branding/logo + layout columns
  (`022`: `brand_text`, `logo_url`, `logo_width`, `header_alignment`, `hero_alignment`,
  `content_width`), brand-text style columns (`023`: color/size/weight/font), KB-list
  section-heading style columns (`024`: `kb_list_title_color/size/weight/font`), KB homepage page
  assignment (`025`: `knowledge_bases.home_page_id`), per-page print-button visibility
  (`026`: `kb_pages.show_print_button`), page revision history (`027`: `kb_page_revisions` plus
  a baseline revision backfill for pre-existing pages), page-view analytics (`028`: `kb_page_views`
  daily counters with retention-fold indexes), KB public/private visibility
  (`029`: `knowledge_bases.visibility`, defaulting existing rows to `public`), sourced-block FTS
  indexing (`030`: `kb_extract_blocks_text` recurses into `sourced` blocks + vector backfill), the
  KB search widget (`031`: `knowledge_bases.search_widget_*` + `site_settings.show_home_search`),
  and page-tree non-page node fields (`032`: `kb_pages.node_kind`, `link_url`, `link_new_tab`).
  **Current head: `032_tree_node_kinds`.**
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
npm run test:a11y  # Playwright + axe smoke tests for public pages and private viewer read access
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
- `SOURCED_CONTENT_ALLOWED_HOSTS` — optional comma-separated https hosts the "P&P source" import
  may fetch from; defaults to `gradschool.wsu.edu` when unset.

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
  under `pg_advisory_xact_lock`. Two consequences when adding a migration (Phase 1's `029` followed
  this pattern):
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
- **Excerpt blocks are live references, resolved per reader at render time.** An `excerpt` block
  stores only `sourcePageId` (+ optional heading block id); `resolveExcerptForRead`
  (`src/lib/excerpts.ts`) applies `getKbReadAccess` + the article route's status/staff rules and
  collapses every failure to one indistinguishable "unavailable" callout. Never render excerpt
  content through a path that skips this resolver, never index it into the target's FTS vector,
  and keep excerpts top-level only (`documentHtmlToBlocks` drops nested ones; demotion replaces
  nested excerpts with a note, which is what makes cycles impossible). The publish gate's excerpt
  checks are injected (`checkExcerptSourceForPublish`) — pass the checker at any new gate call
  site or excerpt problems silently stop blocking publish.
- **Sourced blocks are snapshots; their server fetch is allowlist-gated.** A `sourced` block's
  content is stored on the page (indexed in FTS, validated by the gate) and changes only via an
  explicit editor refresh — never at reader render time. The import/check APIs fetch external
  HTML server-side: keep `parseAllowedSourceUrl` (https + host allowlist, default
  `gradschool.wsu.edu`, env `SOURCED_CONTENT_ALLOWED_HOSTS`) in front of every fetch, or the
  route becomes an SSRF proxy. The allowlist is hostname-only; reject userinfo, non-default ports,
  query strings, malformed anchors, and redirects before reading the response body. Reader-facing
  routes must never fetch the source.
- **`style/style.md` hand-mirrors the publish gate and editor block contract.** The agent style
  pipeline in `style/` (see `style/README.md`) checks pages against a prose copy of
  `validatePageForPublish` rules and the `documentHtmlToBlocks` allowed-block list. If you change
  publish-gate rules or the block contract, update `style/style.md` to match or the content
  pipeline silently drifts.

---

## 9. Current feature status

**Working & verified (2026-07-14):** Phase 1 is merged to `main` (PR #11) and deployed to
production. `main` passes GitHub CI: type-check, lint, unit tests, production build,
public/private-viewer axe smoke tests, route-level access tests, authenticated Chromium editor
regressions, and the Neon live-DB integration suites (including the private-KB access matrix).

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
- Auth (HMAC cookies), Owner/Admin/Editor/Viewer roles; per-KB editor scoping enforced on all
  editor-reachable list views and mutations (pages, assets, imports, redirects, review); owner-only
  user management.
- Private KBs: `knowledge_bases.visibility` (`public`/`private`), owner-facing KB visibility control,
  owner-provisioned Viewers with KB assignments, read-access helpers shared by public KB lists,
  landing/article/search/page-tree/asset routes, and private/staff-aware search and asset delivery.
  Unauthorized private content returns `notFound()`; authorized private assets use
  `Cache-Control: private, no-store` and are streamed through the route instead of redirecting to a
  public Blob URL.
- Per-KB theming ("Manage Styles") and a **global default theme**; owner Site Settings — home hero +
  rich content blocks, KB-list section, header/footer links, contact, a site **logo + branding**
  (brand text with color/size/weight/font), and **layout** (header/hero alignment, content width),
  all blank-safe.
- DOCX staged import; auto-redirects.
- Edit locks with atomic multi-row writes; print-to-PDF export; publishing gate.
- Cross-page excerpt blocks (FB-33, 2026-07-16/17, PR #12): live "Included from" callouts with
  reader-scoped resolution, custom attribution labels + new-tab control, themed `excerptBox*`
  colors, publish-gate source checks, cross-KB delete blocking, KB-export inlining, and a
  draft-preview modal that resolves excerpts to match the published render.
- P&P sourced-content core (FB-34, 2026-07-17, PR #12): "P&P source" editor insert importing an
  allowlisted external section as a snapshot in a themed `sourceBox*` provenance callout, with
  manual check-for-changes/refresh, paste-HTML fallback, gate/export recursion, and FTS indexing
  (migration `030`). Automated staleness polling remains open under FB-34.
- KB search widget + live suggestions (FB-35, 2026-07-18, PRs #14–#16): owner-configurable
  sidebar/home search boxes, document-only asset results in reader-facing search, and a
  progressive-enhancement suggestion combobox backed by the public `GET /api/search` endpoint
  (shared visibility scope via `search-scope.ts`, own `search-suggest:` rate bucket,
  `private, no-store`, no unknown-KB oracle).
- Page-tree group headings and links (FB-36, 2026-07-18/19, PR #17): non-page tree node kinds
  (`kb_pages.node_kind`, migration `032`) excluded from search, pickers, homepage assignment,
  and export page files; minimally publish-gated; admin Type selector plus a dedicated
  settings form.
- Page revision history with restore: every create/save snapshots the page, restores are new saves,
  baseline revisions are backfilled by migration `027`, and daily retention cleanup is scheduled.
- Owner/Admin audit log; archive-first permanent delete with reference safeguards.
- Structured JSON error logging for Vercel log drains and an operations runbook (§13).
- Weekly review-date digest cron (`/api/admin/cron/review-digest`) for managed DB users, with HTTP
  email-provider delivery when configured and structured JSON fallback when email is unconfigured.
- Owner-only bulk KB export (`/api/admin/kbs/[kbId]/export`) as a streamed ZIP containing `kb.json`,
  standalone semantic page HTML, and active asset-version bytes. The owner-only `kb.json` is a
  full-fidelity backup and can include raw editor-note metadata preserved in stored blocks.
- Privacy-light usage analytics (`kb_page_views`) for published public article/homepage renders,
  scoped admin reporting at `/admin/usage`, and monthly retention folding through the daily cron.
- CI (type-check + lint + unit + build + public/private-viewer axe smoke + Chromium editor
  regressions always; live-DB when the secret is configured) should run on the Phase 1 PR before
  merge. `main` was green on 2026-07-10 before the Phase 1 branch.

**Remaining before a production-compliance claim:**
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
- Audit-log retention is a fixed 30-day purge scheduled through Vercel Cron (§12 FB-01).

## 10. Known limitations

- **Accessibility coverage is gate + smoke, not a full WCAG 2.1 AA audit** (§1, §9). Do not describe
  the product as ADA/WCAG certified until a manual audit passes. Public article tables now emit
  `scope="col"` / `scope="row"` on header cells, but this does not replace the manual audit.
- **Private KB reads are intentionally dynamic and auth-gated** (FB-27). Do not add static caching,
  public redirects, sitemap exposure, or "sign in to view" affordances for private KB
  landing/article/search/asset URLs. Unauthorized private content returns `notFound()` so KB
  existence is not distinguishable, and authorized private asset responses use
  `Cache-Control: private, no-store`.
- **Not-found page responses carry HTTP 200, by framework design.** Page routes stream behind the
  root `loading.tsx` boundary, so the status code is committed before authorization or existence
  checks run; the 404 boundary UI then streams into a 200 response. This applies identically to
  nonexistent, private, and draft KB URLs (verified parity — no existence signal) and predates
  Phase 1. Asset delivery is a route handler and returns genuine 404/status codes.
  `generateMetadata` on KB landing/article/search routes also calls `notFound()` so gated pages
  never emit real titles/descriptions, but empirical probes (common bot user agents against a
  production server) still received HTTP 200 with the not-found UI — do not claim crawler-visible
  404s. Revisit status-code fidelity for SEO under FB-31.
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
  shared `kb_rate_limits` table (§12 FB-02).
- Review digest email delivery is pluggable HTTP-provider only today; when unconfigured, the weekly
  cron logs structured JSON and returns a non-error skipped-delivery result. Recipients come from
  managed DB users; a bootstrap env owner alone does not receive digest email.
- Usage analytics are aggregate counts only; they intentionally store no cookies, IP addresses, or user
  agents, can include bot/crawler traffic, and are skipped entirely in in-memory mode.

---

## 11. Future work (overview)

Narrative backlog; the actionable, tagged version is §12.

Phase 1 private knowledge bases (§12 FB-27) are delivered: KB-level `public`/`private` visibility,
local-password Viewers, one read-access helper consumed by every public surface, visibility-aware
asset delivery/search, and live-DB/in-memory access-matrix coverage. The build plan remains in §14
as the implementation audit trail.

**WSU SSO (§12 FB-30)** is the remaining near-term access item: Entra ID / Azure AD OIDC or SAML for
staff and private-KB viewers. It is gated on WSU ITS engagement; the ITS ask list (app registration,
prod + preview redirect URIs, claims/groups for role mapping) is in FB-30. Local owner-provisioned
accounts remain the interim and break-glass path. Design viewer identities so SSO can back them later
without re-modeling `kb_user_assignments`.

**Content reuse & sourcing (§12 FB-33/FB-34)**, maintainer-ratified 2026-07-16: FB-33 (live
cross-page excerpt blocks with custom attribution and new-tab controls) is **delivered**, and the
FB-34 **core** (snapshot imports from the published P&P manual in a themed provenance callout,
with manual check-for-changes/refresh and a paste-HTML fallback) is delivered on the same branch.
Remaining under FB-34: scheduled staleness polling (wp-json `modified` + section hashes) and
review-dashboard "source updated" flags.

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
- **Assets**: direct-to-Blob large uploads; image variants/resizing; bulk import; richer usage/impact
  view; a persisted asset-usage index so delivery/search visibility checks stop re-deriving usage
  from page blocks (today a per-request SQL probe).
- **Governance & ops**: per-KB activity feed from the audit log; keep GitHub/Neon CI secrets healthy;
  broader integration + a11y coverage; a real rate-limit load test; production monitoring/log review
  and rollback checklist; reader feedback, SEO/discoverability, and third-party error tracking are
  tracked in §12.

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

`[AI-AGENT-TASK] id:FB-01  priority:high  area:governance  effort:S  status:done`

- **DONE (2026-06-07):** added `src/app/api/admin/cron/audit-cleanup/route.ts`, protected by
  `CRON_SECRET` bearer auth, and scheduled it daily in `vercel.json`. `.env.example` documents
  `CRON_SECRET`.

- **Original finding:** `cleanupAuditLog()` (`src/lib/audit-log.ts:52`) implemented the 30-day purge, but
  **nothing called it** — there was no cron route and `vercel.json` defined no `crons`. The retention
  policy was unenforced; the table could grow unbounded.
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

`[AI-AGENT-TASK] id:FB-02  priority:high  area:security  effort:M  status:done`

- **DONE (2026-06-07):** `rateLimit()` is now async and uses the Neon-backed `kb_rate_limits` table
  when `DATABASE_URL` is set, with the old in-memory Map retained only as the no-DB local fallback.
  Migration `018_rate_limits` creates the table; login/search call sites now await the shared limiter.

- **Original finding:** `src/lib/rate-limit.ts` kept counters on `globalThis`. On serverless/Fluid Compute each
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

### FB-03 — Stop serving uploaded SVG inline, same-origin

`[AI-AGENT-TASK] id:FB-03  priority:high  area:security  effort:S  status:done`

- **DONE (2026-06-07):** removed `image/svg+xml` from the image upload allowlist and media-picker
  accept list, updated the upload error message, and changed the public asset route so any existing
  SVG asset is delivered with `Content-Disposition: attachment`.

- **Original finding:** upload allowlists already rejected `text/html` and arbitrary types
  (`src/lib/blob.ts:3-17`), so the broad "any HTML upload" risk did **not** apply. The remaining hole
  was specific: `image/svg+xml` **was** an allowed image type, and the asset route
  (`src/app/kb/[kbSlug]/files/[assetSlug]/route.ts`) served bodies `Content-Disposition: inline` with
  the stored MIME. An SVG can carry script, so an inline same-origin SVG was a stored-XSS surface
  (`nosniff` + CSP reduce but do not eliminate it).
- **Why it matters:** editors are semi-trusted; a same-origin SVG rides the viewer's session origin.
- **Suggested approach:** either drop `image/svg+xml` from the image allowlist, or serve SVG (and any
  non-`application/pdf`/non-raster type) with `Content-Disposition: attachment`. Optionally sanitize
  SVG on upload.
- **Touch points:** `src/lib/blob.ts`, the file delivery route, asset upload APIs (`src/app/api/admin/assets/images/route.ts`).
- **Acceptance:** an uploaded SVG downloads rather than renders inline; PDFs/raster images still preview inline.

### FB-04 — Make bootstrap-owner sessions revocable on credential rotation

`[AI-AGENT-TASK] id:FB-04  priority:med  area:security  effort:S  status:done`

- **DONE (2026-06-07):** bootstrap-owner sessions now embed a credential-derived version hash; rotating
  `KB_ADMIN_PASSWORD`/`BOOTSTRAP_OWNER_PASSWORD` or the session secret invalidates previously issued
  bootstrap tokens before their 8-hour expiry.

- **Original finding:** managed-user tokens embedded `version = user.updatedAt`, so editing a user invalidated their
  live sessions. The bootstrap owner used a constant `version: "1"`; rotating the env password/secret
  did not invalidate issued tokens until the 8h TTL.
- **Why it matters:** if the bootstrap password leaks, rotation does not log out an attacker for up to 8h.
- **Suggested approach:** derive the bootstrap `version` from a short hash of the current session secret
  (or password) so a rotation changes the version and `readAdminSessionToken` rejects stale tokens.
- **Touch points:** `src/lib/auth.ts` (`validateAdminCredentials`, `readAdminSessionToken`).
- **Acceptance:** rotating `KB_ADMIN_SESSION_SECRET`/`KB_ADMIN_PASSWORD` invalidates previously issued bootstrap tokens.

### FB-05 — Add ESLint + lint-in-CI and centralized error logging

`[AI-AGENT-TASK] id:FB-05  priority:med  area:dx-observability  effort:M  status:done`

- **DONE (2026-06-07):** added ESLint flat config, `npm run lint`, and a CI lint step. Added
  `src/lib/log.ts` and routed admin API catch blocks through `logError(...)` before returning the
  existing user-facing response. The first lint baseline passes with warnings; ratchet warning-class
  rules to errors as the existing debt is paid down.

- **Original finding:** there was no `lint` script in `package.json` and no ESLint config; several `catch {}` blocks
  swallowed errors silently (e.g. `readAdminSessionToken`, JSON body parses). CI ran type-check + tests +
  axe but not lint.
- **Why it matters:** silent failures are hard to diagnose in production; lint catches a class of bugs the
  type-checker won't.
- **Suggested approach:** add `eslint` with the Next.js config and an `npm run lint` script; add a thin
  logger (`src/lib/log.ts`) and route swallowed errors through it; wire both into CI. Consider a
  Vercel-native error/observability integration for production.
- **Touch points:** `package.json`, new ESLint config, `src/lib/*` catch sites, CI workflow.
- **Acceptance:** `npm run lint` passes in CI; previously-silent error paths emit structured logs.

### FB-06 — Stale FTS docstring (RESOLVED) / monitor search weights

`[AI-AGENT-TASK] id:FB-06  priority:low  area:search  effort:S  status:done`

- **Resolved:** this item originally flagged a misleading `searchKb` docstring. That docstring no
  longer exists — it was removed in the repo-wide comment strip (the source tree is now comment-free,
  §intro). The `tsvector` triggers keep both tables fresh, so search maintenance is sound.
- **Remaining (optional, low priority):** monitor and tune the `setweight` weights (A=title,
  B=summary/description, C=body) in `src/lib/migrations/index.ts` as content volume grows. No code
  change is required today; kept here as a watch-item.

### FB-07 — Add a Permissions-Policy header

`[AI-AGENT-TASK] id:FB-07  priority:low  area:security  effort:S  status:done`

- **DONE (2026-06-07):** `next.config.ts` now emits `Permissions-Policy: camera=(), microphone=(),
  geolocation=()` for all routes.

- **Original finding:** `next.config.ts` set HSTS, `X-Content-Type-Options`, and `Referrer-Policy`, and
  `proxy.ts` set a strong CSP — but no `Permissions-Policy` was emitted.
- **Suggested approach:** add a restrictive default, e.g. `camera=(), microphone=(), geolocation=()`.
- **Touch points:** `next.config.ts` (`headers()`).
- **Acceptance:** responses carry a restrictive `Permissions-Policy`; no feature the app uses is broken.

### FB-08 — Per-PR ephemeral DB tests and broader gated coverage

`[AI-AGENT-TASK] id:FB-08  priority:med  area:ci  effort:M  status:done`

- **DONE (2026-06-07):** added `.github/workflows/db-pr.yml`, which creates a throwaway Neon branch per
  pull request, runs `npm run test:db` against it, and deletes it — gated on `HAS_NEON` so it is a green
  no-op until the `NEON_API_KEY` + `NEON_PROJECT_ID` secrets are configured. Broadened the gated suite
  (`src/lib/ki1.db.test.ts`) with regression coverage for editor KB scoping
  (`accessibleKbIds`/`filterKbsForSession`/scoped `getAdminReviewDashboard`), manual redirect
  persistence, and the single-active-version DB invariant.
- **To activate:** add the two Neon secrets (instructions are in the workflow header) and confirm the
  Neon action versions/outputs match. Once active it supersedes the shared `DATABASE_URL` step in
  `ci.yml`.
- **Remaining (optional):** add gated cases for the publish gate and DOCX import-commit happy paths
  (currently covered only by in-memory unit tests).

### FB-09 — Editor core hardening

`[AI-AGENT-TASK] id:FB-09  priority:med  area:editor  effort:L  status:open`

- **PHASE 7 NOTE (2026-07-10):** this is now a committed post-launch milestone, not opportunistic
  hardening. Run the migration as its own dedicated effort: the recurring `contentEditable` edge cases
  are a maintenance tax, and every new custom-editor feature raises the eventual migration cost.
- **Finding:** the editor is a custom `contentEditable` surface (`src/components/PageDocumentEditor.tsx`);
  §10 acknowledges complex selection edge cases may still surface — and they have (heading demotion
  on delete, list-split duplicate ids, dropped pasted images, fragile link insertion; all patched
  point-by-point in the 2026-07 hardening round, but the underlying architecture is unchanged).
- **Suggested approach:** evaluate migrating the inline-flow surfaces to a maintained rich-text framework
  (e.g. Lexical/ProseMirror) **behind the existing `page-document.ts` block (de)serialization boundary**,
  so the `ContentBlock` model and sanitizer stay the source of truth. Add the positioned margin/comment
  rail, comment threads, and resolve as a follow-on.
- **Touch points:** `src/components/PageDocumentEditor.tsx`, `src/lib/page-document.ts`, `src/lib/page-editor-format.ts`.
- **Acceptance:** (1) the existing `page-document.test.ts` round-trip suite passes unchanged against
  the new surface; (2) a documented manual checklist of selection/caret cases (multi-block select,
  paste-with-formatting, list Tab/Shift-Tab nesting, note insert at boundary, undo after format) passes
  in Chrome + Firefox; (3) no regression in the publish gate or sanitizer output for identical input.

### FB-10 — Public reading-experience polish

`[AI-AGENT-TASK] id:FB-10  priority:low  area:public-ux  effort:M  status:open`

- **Items:** TOC scroll-spy active-section highlight; "copy link to heading" on the *public* page
  (the editor toolbar got a Copy-anchor button in 2026-07; readers still have no hover affordance);
  previous/next page nav; home search/filter + pagination as KB count grows; **card title H2/H3
  level selector** for outline accuracy.
- **Touch points:** `src/components/TableOfContents.tsx`, `src/app/page.tsx`, `src/components/PageBlocks.tsx`, card editor.
- **Acceptance:** each sub-item ships behind its own small PR with an axe smoke check.

---

> Items FB-11–FB-14 were added after an independent code review (Codex, 2026-06-07) cross-checked the
> spec against the source. They are verified against current code (file:line cited).

### FB-11 — Close the editor KB-scoping gaps (authorization)

`[AI-AGENT-TASK] id:FB-11  priority:high  area:authz  effort:M  status:done`

- **DONE (2026-06-07):** the cross-tenant gaps are closed. `requireKbAccess` was added to the redirects
  `GET` (`src/app/api/admin/redirects/route.ts`) and the staged-import `GET`/`PATCH`/`DELETE`
  (`src/app/api/admin/import/staged/[stagedImportId]/route.ts`, resolving the import's `kbId` first via
  `getStagedImportDetail`). The import / redirects / review admin pages now filter to the editor's
  assigned KBs (`accessibleKbIds` / `filterKbsForSession`), and `getAdminReviewDashboard` accepts an
  `allowedKbIds` argument that scopes its pages, assets, and staged imports
  (`src/lib/admin-review.ts`).
- **Follow-up (rolls into FB-08):** add live-DB regression tests asserting an editor assigned to KB A is
  denied on KB B for each path. Editor scoping is only exercised with `DATABASE_URL` set, so this needs
  the gated suite (`src/lib/ki1.db.test.ts`), not the in-memory run.

### FB-12 — Allow video embeds under CSP (`frame-src`)

`[AI-AGENT-TASK] id:FB-12  priority:high  area:security-csp  effort:S  status:done`

- **DONE (2026-06-07):** `src/proxy.ts` now sets
  `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com`,
  so the public YouTube/Vimeo `<iframe>` embeds load while `script-src` is unchanged. Covered by
  `src/proxy.test.ts` (asserts the video hosts are in `frame-src`, absent from `script-src`, and the
  baseline lockdown directives remain). Add a future provider's host here whenever
  `src/components/PageBlocks.tsx` gains one.

### FB-13 — Make asset version replacement transactional + enforce single active version in DB

`[AI-AGENT-TASK] id:FB-13  priority:med  area:data-integrity  effort:M  status:done`

- **DONE (2026-06-07):** `replaceVersionsForAsset` and `deleteAsset` (`src/lib/db.ts`) now run their
  delete + inserts inside a single `sql.transaction([...])`, so a mid-batch failure rolls back and
  leaves prior versions intact. Migration `017_single_active_version` adds a partial unique index
  (`uq_kb_asset_versions_one_active`) enforcing one `active` version per asset (demoting any
  pre-existing duplicates first so it can't fail on existing data). `loadAssetForDelivery` now orders
  the active-version lookup by `version_number DESC` for determinism. Covered by a gated test asserting
  the DB rejects a second active version.

### FB-14 — Resolve the "accessible PDF" claim precision

`[AI-AGENT-TASK] id:FB-14  priority:low  area:accessibility  effort:S  status:done`

- **DONE (2026-06-07):** Implementation was hardened by adding a `.print-only` metadata block
  (Responsible Office, Contact, Verification status) that makes printed policy documents authoritative.
  The PDF export now includes essential governance metadata in the print output, and print CSS is
  optimized for article clarity. Precise accessibility is maintained via high-quality print-to-PDF
  over semantic HTML.
- **Audit hardening (2026-06-07):** the `verified_at` (`TIMESTAMPTZ`) value is now rendered through a
  single timezone-correct helper, `formatTimestamp` in `src/lib/format.ts`, which formats the instant
  directly in `America/Los_Angeles`. This replaced an unsafe `verifiedAt.split("T")` (which crashes or
  prints `Invalid Date` depending on how the Neon driver serializes the column) and unified the three
  former representations (print block, on-screen badge tooltip, editor confirmation) onto one helper.
  The verified badge now carries an `aria-label` with the glyph marked `aria-hidden`, and empty
  governance lines are no longer printed.
- **Image export hardening (2026-07-09):** `PrintPdfButton` now eagerly prepares `.article img`
  elements before `window.print()`: it forces eager loading, waits for load/decode where possible, and
  uses a bounded timeout so screenshot-heavy KB pages do not export before managed images have painted.

---

> Items FB-15–FB-16 were surfaced by a second independent review (Gemini, 2026-06-07), which found
> that FB-11 had closed the API/list-view gaps but **not** the detail/edit pages. Both are now fixed.

### FB-15 — Scope admin detail/edit pages to assigned KBs

`[AI-AGENT-TASK] id:FB-15  priority:high  area:authz  effort:S  status:done`

- **DONE (2026-06-07):** the detail/edit server components fetched a record by id and rendered it with
  no KB check, so an editor who knew an id could **view** (and lock) another KB's page/asset/import —
  though saves were already rejected by the scoped mutation APIs (`requireKbAccess` in
  `src/app/api/admin/pages/[pageId]/route.ts` etc.). Added `canAccessKb(session, kbId) → notFound()`
  guards to `src/app/admin/pages/[pageId]/page.tsx`, `src/app/admin/assets/[assetId]/page.tsx`, and
  `src/app/admin/import/[stagedImportId]/page.tsx` (the import review's KB picker is now filtered with
  `filterKbsForSession`).
- **Follow-up (rolls into FB-08):** add live-DB regression tests asserting an editor gets `notFound`
  on a detail page outside their assigned KBs.

### FB-16 — Let editors list their KBs for page creation

`[AI-AGENT-TASK] id:FB-16  priority:med  area:authz-ux  effort:S  status:done`

- **DONE (2026-06-07):** `GET /api/admin/kbs` previously hard-`403`d non-admins, which left the
  `admin/pages/new` KB dropdown empty for editors and broke their page-creation workflow (even though
  the role model grants editors page authoring in assigned KBs). The route now returns
  `filterKbsForSession(session, allKbs)` — owners/admins still get all KBs, editors get their assigned
  set. Because this makes the route editor-reachable, the owner-only **`/admin/kbs` management screen**
  is now guarded server-side by a segment `layout.tsx` (FB-18) so editors are redirected before its
  create/edit/delete UI renders; the KB write APIs were already owner-only.

### FB-17 — Scope the staged-import collection API

`[AI-AGENT-TASK] id:FB-17  priority:high  area:authz  effort:S  status:done`

- **DONE (2026-06-07):** `GET /api/admin/import/staged` previously returned
  `listStagedImportsForAdmin(kb)` with no scope check, so any editor could enumerate every KB's staged
  imports. It now requires `requireKbAccess` when a `kb` query is supplied, and otherwise filters the
  result by `accessibleKbIds(session)` (`src/app/api/admin/import/staged/route.ts`). Owners/admins are
  unrestricted.

### FB-18 — Server-guard the owner-only admin screens

`[AI-AGENT-TASK] id:FB-18  priority:med  area:authz-ux  effort:S  status:done`

- **DONE (2026-06-07):** `/admin/settings`, `/admin/kbs`, and `/admin/users` were client pages with no
  server role guard — they rendered owner-only controls to any signed-in user (writes were API-blocked,
  but the UI was misleading). Added a segment `layout.tsx` to each folder
  (`src/app/admin/{settings,kbs,users}/layout.tsx`) that redirects non-owners to `/admin` before the
  client UI loads. Also closed the matching data leak: `GET /api/admin/settings` is now owner-only
  (previously any signed-in admin could read site settings; only `PUT` was guarded). README's
  "accessible (tagged) PDF" wording was corrected to "print-to-PDF" to match §9/FB-14.

---

> Items FB-19–FB-23 were authored by Gemini (2026-06-07) based on industry best practices for
> world-class knowledge management systems.

### FB-19 — Semantic Hybrid Search & Gap Analysis

`[AI-AGENT-TASK] id:FB-19  priority:high  area:search  effort:M  status:in-progress`

- **Complete (2026-06-07):** Gap Analysis is implemented. A "Search Gap Analysis" report in the Admin
  Audit area identifies zero-result searches, helping Owners proactively address missing content.
  Vector-based semantic search foundation is laid.
- **Audit hardening (2026-06-07):** the original design logged *every* search to the shared
  `kb_audit_log` and filtered for zero-result rows in the page after a `LIMIT 200` — so under real
  traffic the gap report saw mostly successful searches and real admin events were crowded out of the
  capped audit view. `recordSearchEvent` (`src/lib/audit-log.ts`) now persists **only** zero-result
  queries, and `listAuditEvents` excludes `entity_type = 'search'` from the default admin audit list
  (both the SQL and in-memory paths) unless that entity type is explicitly filtered. The in-memory
  search path now records gaps too, for zero-config parity.
- **Global FTS delivered (2026-07-10) + private scope updated (2026-07-13):** `/search` now searches
  all KBs readable under `getKbReadAccess`, reuses the per-KB FTS ranking and rate limit, logs
  zero-result searches, groups results by KB, and has axe/live-DB guards that unpublished, private,
  and staff-only content do not leak into anonymous global search.
- **Remaining:** true semantic/vector ranking is not yet productized in public search. The delivered
  search path remains Postgres FTS + prefix/type-ahead + gap reporting; semantic hybrid ranking should
  stay an explicit future enhancement until a human owner confirms the need.
- **Acceptance:** Owners can identify missing content via the new `/admin/audit/search` dashboard.

### FB-20 — Content Lifecycle & Staleness Triggers

`[AI-AGENT-TASK] id:FB-20  priority:med  area:governance  effort:S  status:done`

- **DONE (2026-06-07):** Added `next_review_date`, `verified_at`, and `verified_by` to `kb_pages`.
  Implemented a "Verify now" action in the Page Editor that resets the 6-month review clock. Public
  pages now display a "✓ Verified" trust badge with governance metadata. "Needs Review" badges appear
  automatically in the admin tree for stale content.
- **Audit hardening (2026-06-07):** the verify API (`src/app/api/admin/pages/[pageId]/verify/route.ts`)
  now follows the canonical mutation sequence — `requireAdminMutation` (authn/CSRF) **before** the
  existence/404 check (closing a page-id enumeration oracle), then `getPageByIdForAdmin`, then
  `requireKbAccess`, then the mutation. The mutation is a unified `verifyPage(page, verifier)` in
  `src/lib/kb-store.ts` that branches on `isDatabaseEnabled()`: a targeted `updatePageLifecycle` UPDATE
  for Neon (no longer a full-row `updatePages` rewrite, eliminating a lost-update race and a misleading
  "page is locked" error) and `storeRuntimePage` for in-memory mode (fixing a hard crash when no
  `DATABASE_URL` is set). The route passes its already-loaded page into `verifyPage`, so the page is
  read once. Separately, the editor's "Next review date" field is now parsed by
  `PATCH /api/admin/pages/[pageId]` and threaded through `updatePage` (it was previously dropped on
  save); normal saves still preserve `verified_at`/`verified_by` via the existing-record spread.

### FB-21 — Change Requests / Proposed Edits Workflow

`[AI-AGENT-TASK] id:FB-21  priority:med  area:workflow  effort:L  status:open`

- **Finding:** Editors currently publish directly (gated only by a11y checks). Some high-stakes KBs
  require a human-in-the-loop review before changes go live.
- **Suggested approach:** Add a "Proposed" status for pages. Editors can submit a set of changes as a
  "Proposal." Owners see a side-by-side diff view and can "Approve & Publish" or "Request Changes."
- **Acceptance:** An Editor can submit an edit for review without it going live; an Owner can publish it
  with one click after reviewing the diff.

### FB-22 — Advanced A11y & Interactive UI (Scroll-Spy)

`[AI-AGENT-TASK] id:FB-22  priority:low  area:a11y-ux  effort:S  status:done`

- **DONE (2026-06-07):** The Table of Contents (`src/components/TableOfContents.tsx`) now uses an
  `IntersectionObserver` to track the user's scroll position and highlight the active section link.
  TOC active state updates smoothly, and accessibility (keyboard focus) is maintained.

### FB-23 — Knowledge-as-a-Service (KaaS) Public API

`[AI-AGENT-TASK] id:FB-23  priority:low  area:integration  effort:M  status:open`

- **Finding:** Other WSU applications may need to display KB content (e.g., a "Tuition Policy" snippet
  inside a student portal) without re-implementing the reader.
- **Suggested approach:** Provide a read-only Public API protected by API keys. Allow fetching atomic
  content blocks or full page summaries by slug.
- **Acceptance:** An external app can successfully fetch a JSON representation of a public article using
  a valid API key; the response includes metadata and sanitized content blocks.

### FB-24 — Page revision history with restore

`[AI-AGENT-TASK] id:FB-24  priority:high  area:editor  effort:L  status:done`

- **DELIVERED (2026-07-08) — smallest production-safe version:**
  - Migration `027_page_revisions` adds `kb_page_revisions` (page id, kb id, revision number,
    title, author, action, full `snapshot` JSONB, `created_at`) with a unique `(page_id,
    revision_number)` index.
  - Every content save (`updatePage`) writes a revision **inside the same transaction** as the page
    update (`updatePages(pages, editorEmail, revisions)`), so a lock-rejected save (the division-by-zero
    abort-guard) never leaves an orphan revision. `revision_number` is computed in-statement. In-memory
    mode mirrors this via a runtime store.
  - `createPage` also snapshots the initial content as revision 1, atomically with the page insert
    (`insertPage(page, revision)`), so imported/committed pages are recoverable even if never edited
    again. Author attribution threads through the create + import-commit routes.
  - Read/restore/cleanup live in `kb-store.ts`: `listPageRevisions`, `getPageRevision`,
    `restorePageRevision` (restore = a **new** save with `action:"restore"`, routed through
    `updatePage` so edit-lock semantics hold), `cleanupPageRevisions` (keep newest 50/page).
  - **Review-round hardening (2026-07-09):** (a) migration 027 backfills a baseline revision 1 for
    every pre-existing page (`backfillBaselineRevisions`, idempotent via NOT EXISTS + a deterministic
    id; snapshot mirrors `PageRevisionSnapshot`, live-DB tested). (b) Restore re-checks the **publish
    gate**: restoring a `published` revision runs `validateRevisionForRestore` and returns **422 with
    issues** (like the save route) — catching e.g. a since-archived referenced asset. (c) Restore is a
    **full** snapshot restore: `relatedPageIds`/`relatedAssetIds` are now restored too (added to
    `UpdatePageInput`; round-trip tested).
  - API: `GET /api/admin/pages/[pageId]/revisions`, `GET …/revisions/[revisionId]`,
    `POST …/revisions/[revisionId]/restore` (audit event `page.restored`); cron purge at
    `GET /api/admin/cron/revision-cleanup` (mirrors audit-cleanup, `CRON_SECRET`), scheduled daily at
    `30 4 * * *` in `vercel.json` (30 min after the audit purge).
  - UI: `PageHistoryPanel` (History fieldset on `/admin/pages/[pageId]`) lists revisions with
    author/time/status, previews any revision read-only via `DraftPreviewModal`, and restores with a
    confirm; restore reloads the editor. Restore is disabled while the page lock is held. View and
    restore track independent busy states (previewing never flips restore into "Working…"); refresh
    disables while loading; errors surface in an `aria-live="assertive"` region.
  - Tests: `page-revisions.test.ts` (in-memory: counting, snapshot round-trip, restore-as-new,
    retention) and `page-revisions.db.test.ts` (live-DB: atomic write, restore, **lock-rejected save
    writes no revision**, retention). `tests/editor/history-panel.spec.ts` covers the panel (save
    records a revision; preview leaves restore idle). Verified end-to-end over HTTP against the
    production server (save→list→view→restore, 401/404 guards).
- **DONE (2026-07-10):** acceptance (4) is closed. `main` CI passed `npm run test:db` with a real
  `DATABASE_URL`; `page-revisions.db.test.ts` verifies live-DB retention and backfill idempotency. The
  retention assertion uses a page-scoped cleanup helper, so it does not prune unrelated revision history
  if someone accidentally points the DB suite at a shared database. In-memory mode (dev/test only) has
  no baseline for seed pages until their first save — production backfills via migration 027; this
  first-save behavior is documented by test. Status-only lifecycle changes (publish/unpublish/archive
  via the `/status` route) do not snapshot — content is unchanged, so this is intentional.
- **Remaining enhancements, not release gaps:** no side-by-side diff view, no field-level restore, and
  retention is a fixed 50/page cap (not yet configurable).
- **Original finding:** every save permanently overwrites page content — there is no per-save snapshot,
  diff, or restore. The audit log (`src/lib/audit-log.ts`) records that a change happened, not the
  content. The 2026-07 hardening round added *client-side* protection only (a `localStorage` draft
  backup in `AdminPageEditorForm` keyed `kb-editor-backup:{pageId}`, plus a `beforeunload` guard);
  that protects unsaved work on one machine but cannot recover a bad save. For a heavily used
  multi-author KB this is the biggest missing trust feature.
- **Delivered approach:** a `kb_page_revisions` table (page id, revision number, full
  title/summary/metadata/blocks JSON, author, timestamp) written inside the same `updatePages`
  transaction that saves the page. Keep a bounded window (e.g. last 50 revisions or 12 months) with
  a cleanup job like the audit-log purge. UI: a "History" panel on `/admin/pages/[pageId]` listing
  revisions with author/time; selecting one shows a read-only render (reuse `DraftPreviewModal`'s
  source-HTML approach) and offers "Restore this version" — which itself saves a *new* revision
  rather than rewriting history. Do this on its own branch: it needs a migration and touches the
  page-write path.
- **Touch points:** `src/lib/db.ts` (`updatePages`), new migration, `src/app/admin/pages/[pageId]/`,
  `src/components/AdminPageEditorForm.tsx`, optionally `src/lib/audit-log.ts` for linkage.
- **Acceptance:** (1) every successful save creates a revision atomically with the page write;
  (2) an editor can view any listed revision and restore it without data loss (restore = new
  revision); (3) revision writes do not break the edit-lock batch semantics (§5 Edit locks, §8
  abort-guard gotcha); (4) retention cleanup verified against a live DB.

### FB-25 — Production release gate: WCAG audit + editor browser regressions

`[AI-AGENT-TASK] id:FB-25  priority:high  area:qa-a11y-release  effort:M  status:in-progress`

- **DELIVERED (2026-07-08) — editor regression suite:** `tests/editor/` (run via `npm run test:editor`,
  config `playwright.editor.config.ts`) now covers the highest-risk Info-box authoring paths on Chromium:
  (1) an Info box authored with bold text plus bulleted, numbered, and nested lists survives the
  HTML-source → Visual round-trip, saves & publishes, and renders on the public page inside the colored
  callout (`aside.alert--info`) as semantic nested `<ul>/<ol>/<li>` with the heading flattened out;
  (2) toolbar-driven list creation and nesting inside an Info box (Bulleted list + toolbar indent);
  (3) surface-aware toolbar context — Info box shows text + list tools and hides page-structure/insert
  controls, table cell shows text-only tools and hides list/structure controls, and the document body
  keeps Divider/Procedure/Info box discoverable. Auth reuses a shared session cookie
  (`auth.setup.ts`); the suite is hermetic (in-memory seed data). **Must run against the production
  server** — see the "Editor Playwright suite" note in §Running locally for why `next dev` cannot host it.
- **DELIVERED (2026-07-09) — more editor coverage + a real bug fix:**
  - `list-nesting.spec.ts`: builds a three-level ordered list with **keyboard** Tab/Shift+Tab, asserts
    the nested `<ol>/<li>` in the editor DOM, and that save → public render preserves the nesting with
    the intended 1./a./i. marker styles; plus a test that first-item indent and top-level outdent
    surface explanatory hints instead of acting.
  - `table-cell.spec.ts`: focus a table cell, apply **bold** and insert a **link** via the dialog,
    confirm list/page-structure controls stay hidden, and verify the public table renders the cell
    content (bold preserved; the link appears exactly once). Public article table headers now emit
    `scope="col"` / `scope="row"`, with a regression assertion on the default header-row table.
  - **Bug fixed (lists):** the keyboard test surfaced a real data-loss bug — Chromium's
    `insertOrderedList` leaves the new list wrapped in a `<p>` (`<p><ol>…</ol></p>`), and
    `serializeDocumentNode`'s paragraph branch flattened it on save, so a list created in the flow
    surface was silently lost on publish. The `<p>` branch now splits out block-level `<ol>/<ul>`
    children (unit-tested in `page-document.test.ts`).
  - **Bug fixed (table-cell links):** inserting a link inside a table cell dropped the link or
    duplicated the cell text. Root cause: the link machinery (`persistFromAnchor`,
    `clearStaleLinkDrafts`) only recognised `.wysiwyg-surface`, not the standalone `.wysiwyg-table-cell`
    editors, and `RichTextEditable` re-serialized its DOM on blur/re-render (the dialog blurs the cell),
    stripping the in-progress `doc-link-draft` marker. Fixed by teaching the link helpers about table
    cells and skipping the cell's blur/layout re-sync while a draft marker is present — without
    weakening the text-only toolbar context. Covered by `table-cell.spec.ts`.
- **DELIVERED (2026-07-09) — closing more release-gate automation gaps:**
  - `image-alt.spec.ts` drives an image from HTML source → Visual editor → **Alt** dialog → save →
    public render, asserting the missing-alt marker clears and public `img[alt]` + caption survive.
  - `work-protection.spec.ts` seeds `localStorage` before the editor mounts and verifies **Restore
    draft** restores both body content and lifecycle metadata (`nextReviewDate`). The same spec verifies
    editor-only note spans remain in editor storage but are stripped from public article HTML and from
    public search results.
- **CI wiring (2026-07-09):** `npm run test:editor` now runs in `.github/workflows/ci.yml` after the
  axe smoke step, reusing the installed Chromium. Its Playwright config starts a hermetic production
  server, so it needs no `DATABASE_URL` secret.
- **CI status (2026-07-10):** `main` passes the configured workflow, including type-check, lint, unit,
  build, public axe smoke, Chromium editor regressions, and the live-DB test step when `DATABASE_URL`
  is configured.
- **Still open (manual QA / follow-up automation):**
  - **Cross-browser / responsive:** the suite runs Chromium only, so **Firefox and mobile-width passes
    remain manual** before a production claim.
  - **WCAG audit**: the manual WCAG 2.1 AA checklist below is still outstanding.
- **Finding:** the app is accessibility-oriented and has a publish gate plus public axe smoke tests,
  but it should not be called ADA/WCAG compliant until a full manual audit and cross-browser workflow
  pass are complete. The page editor has historically failed in browser-only ways that unit tests do
  not catch.
- **Suggested approach:** keep the Playwright editor regression suite in CI and extend it when new
  editor bugs surface. It now covers the highest-risk Chromium authoring paths: Visual ↔ HTML source,
  ordered-list create + Tab / Shift+Tab + toolbar blocked-state feedback, nested ordered-list public
  render (1./a./i.), table-cell formatting/link insertion, Info-box simple rich text with nested lists,
  image alt/edit controls, local draft backup/restore including `nextReviewDate`, and note stripping
  from public/search. Pair this with a manual WCAG 2.1 AA audit
  checklist covering public pages and admin/editor workflows: keyboard-only operation, focus order,
  visible focus, labels/names, headings/landmarks, color contrast, zoom/reflow, table headers, image
  alternatives, video captions/transcripts, and mobile layouts.
- **Touch points:** `tests/a11y`, `tests/editor` (delivered), `playwright.a11y.config.ts`,
  `playwright.editor.config.ts` (delivered), `package.json` (`test:editor`), CI workflow,
  `src/components/PageDocumentEditor.tsx`, `src/components/AdminPageEditorForm.tsx`,
  `src/components/PageBlocks.tsx`, `project_spec.md`.
- **Acceptance:** (1) CI runs unit, type-check, lint, build, public axe smoke, and editor Playwright
  regressions on Chrome; (2) a documented manual pass covers Chrome + Firefox and mobile widths; (3)
  public sample pages pass the WCAG checklist or have tracked exceptions; (4) release notes clearly
  state the accessibility status without over-claiming ADA certification.

### FB-26 — Page editor UX pass for lists, toolbar context, and author feedback

`[AI-AGENT-TASK] id:FB-26  priority:high  area:editor-ux  effort:M  status:done`

- **IMPLEMENTED IN BUILD (2026-07-08), covered by Chromium browser regressions:** toolbar state now exposes
  focused-surface context and publishes a formatting context event whenever the bound editor surface
  changes. Table-cell focus switches the shared toolbar to text-only mode. Info-box focus switches to a
  simple rich-text mode: text formatting plus bulleted/numbered/nested lists, with page structure,
  insert, and editor-note controls hidden. List focus disables impossible indent/outdent actions.
  Tab/Shift+Tab report specific messages for first-item indent and top-level outdent failures. Divider,
  Procedure section, and Info box insert controls are visibly labeled, and Info boxes preserve callout
  list markup through save and public render.

- **DONE (2026-07-10):** the editor UX implementation and Chromium regression coverage are complete for
  this item. Current Chromium coverage includes nested ordered-list creation and Tab/Shift+Tab nesting;
  toolbar indent/outdent blocked states; table-cell text-only context; Info-box text/list context;
  Divider/Procedure/Info insert discoverability; image alt editing; local draft restore; and Info-box
  save/public-render persistence.
- **Remaining release confidence work:** because this remains custom `contentEditable` code, manual
  Chrome/Firefox/mobile validation is still required before calling the editor production-ready. That
  release gate is tracked under FB-25, not as an FB-26 implementation gap.
- **Touch points:** `src/components/DocumentToolbar.tsx`, `src/components/RichTextToolbar.tsx`,
  `src/components/PageDocumentEditor.tsx`, `src/components/TableBlockEditor.tsx`,
  `src/lib/page-editor-format.ts`, `src/app/globals.css`.
- **Acceptance:** (1) an editor can create a three-level ordered list with mouse or keyboard without
  source mode; (2) unavailable commands are disabled or explain why they cannot run; (3) table-cell
  formatting does not show misleading page-structure controls; (4) Info-box formatting allows bullets,
  numbered lists, and nested lists while hiding page-structure controls; (5) Divider, Procedure section,
  and Info box remain discoverable at common desktop and laptop widths; (6) browser regression tests
  cover the list, table-cell, Info-box, and insert-control workflows from FB-25.

### FB-27 — Private knowledge bases and viewer read access

`[AI-AGENT-TASK] id:FB-27  priority:high  area:authz-visibility  effort:L  status:done`

- **DONE (2026-07-13):** implemented KB-level `public`/`private` visibility (`029_kb_visibility`),
  local-password Viewers, owner-facing KB visibility and Viewer assignment UI, a shared read-access
  helper for public/private reads, private/staff-aware search and asset delivery, and live-DB plus
  in-memory access-matrix tests. The fresh-database bootstrap and Phase 1 live-DB suites passed
  against throwaway Neon databases, which were deleted after verification.
- **Review hardening (2026-07-13):** (a) KB **status** folded into `getKbReadAccess` /
  `filterKbsForReadAccess` — draft/archived KBs are now unreadable by viewers and anonymous users
  (owner/admin read all; editors read assigned drafts), closing a leak where any session could read
  unpublished public KBs; (b) the staff-only-referenced asset rule now applies inside **private**
  KBs too — assigned viewers can fetch an asset only when a published, non-staff page references it;
  (c) `assetHasPublicPublishedUsage` is a single indexed SQL `EXISTS` probe in DB mode (mirroring
  the search staff-prune pattern) instead of loading every page's blocks per asset request;
  (d) route-level Playwright coverage added (`tests/a11y/private-access.spec.ts`): anonymous and
  viewer requests to private/draft KB pages render the not-found boundary with no gated content and
  status parity with nonexistent KBs (see the §10 streaming-status note), anonymous asset requests
  return a real 404, gated asset responses carry `Cache-Control: private, no-store`, viewer
  mutations return 403, and viewers are redirected out of `/admin`.
- **Second review hardening (2026-07-14, independent Codex audit):** (a) the SQL usage probe no
  longer text-matches `blocks::text LIKE '%id%'` (which let a published page merely *mentioning* an
  asset id expose a staff-only asset); it now matches exactly what `extractAssetUsages` matches —
  top-level `image`/`asset_link` blocks via `jsonb_array_elements(...)->>'assetId'` plus
  `related_asset_ids` containment; (b) the staff-ancestor prunes in both the usage probe and the
  search `pageVisibilityFilter` now require `p2.status = 'published'`, matching the in-memory
  `isStaffOnly`-over-published semantics (a draft staff parent no longer hides its published public
  children from DB search/asset delivery); (c) live-DB regressions added: a decoy page containing an
  asset id as plain text must not make the asset reader-visible, and a published public child under
  a draft staff parent must stay searchable with its asset deliverable; (d) the §10 crawler-404
  claim was corrected (bots receive 200 + not-found UI like all page requests) and the §3 matrix
  rows now state the `published` constraints.
- **Build plan:** the complete, ordered implementation plan for this item — including the
  maintainer-action protocol for storage/infrastructure steps — remains in **§14** as the
  implementation audit trail.
- **Finding:** Closed. The product goal requires both public and private KBs; the implementation now
  uses KB-level `public`/`private` visibility, a read-only `viewer` role, and one visibility helper
  gating every public route, search path, page tree, redirect-sensitive read, and asset response.
- **Pre-work completed before migration `029`:** a fresh-database `ensureSchema()` bootstrap ran
  against a brand-new Neon database and exercised collected migrations 001-028 end-to-end. The
  bootstrap exposed and fixed the legacy `locked_at` timestamp conversion in migration `007` while
  staying within the §8 straight-line/idempotent SQL rules.
- **Implemented approach:** `knowledge_bases.visibility` defaults existing rows to `public`;
  `kb_user_assignments` is reused for Viewer/Editor private-KB read access; Owners/Admins can read
  all KBs; Editors and Viewers can read all public KBs plus assigned private KBs. Viewers redirect
  away from `/admin`, mutation APIs reject them, and Viewers never see draft or staff-only pages.
  Asset delivery and search use the same visibility semantics; authorized asset responses use
  `Cache-Control: private, no-store`.
- **Touch points:** `src/lib/types.ts`, `src/lib/auth.ts`, `src/lib/security.ts`,
  `src/lib/migrations/index.ts`, `src/lib/db.ts`, `src/lib/kb-store.ts`, public routes under
  `src/app/kb/**`, `src/app/page.tsx`, `src/app/api/admin/kbs/**`, `src/app/admin/kbs/**`,
  `src/app/admin/users/**`, `tests/a11y`, `tests/editor` only if UI surfaces change, and the live-DB
  suite (`src/lib/ki1.db.test.ts` or a new `*.db.test.ts`).
- **Acceptance:** (1) anonymous users get `notFound()` for private KB landing/article/search/asset
  routes; (2) a viewer assigned to private KB A can read A and cannot read private KB B; (3) viewer
  mutation attempts return 403 and viewers see no admin surfaces; (4) staff-only pages and assets are
  only readable by users with KB read access, and public assets remain cacheable only when referenced by
  at least one public published page; (5) public and per-KB search never return private/staff results to
  unauthorized callers; (6) live-DB and in-memory tests cover the access matrix.

### FB-28 — Third-party error tracking integration

`[AI-AGENT-TASK] id:FB-28  priority:med  area:observability  effort:M  status:open`

- **PHASE 7 NOTE (2026-07-10):** retained as the canonical third-party error-tracking backlog item;
  do not duplicate it under a new FB id.
- **Finding:** `src/lib/log.ts` now emits structured JSON suitable for Vercel log drains, but there is
  no hosted error-tracking service for grouping, alerting, release correlation, or long-term incident
  triage.
- **Suggested approach:** Pick an approved service such as Sentry, Axiom, or another WSU-supported log
  and error platform. Keep the existing structured logger as the app boundary and add a thin provider
  adapter plus environment-variable configuration.
- **Touch points:** `src/lib/log.ts`, `src/app/**/error.tsx`, API route catch blocks that call
  `logError`, `.env.example`, the §13 operations runbook, and Vercel environment configuration.
- **Acceptance:** (1) server-side exceptions are grouped by route/action and release commit; (2) client
  route errors include useful component-stack context without leaking sensitive data; (3) production
  alert routing is documented; (4) the app still works with the provider unconfigured in local/dev.

### FB-29 — Dedicated editor-framework migration

`[AI-AGENT-TASK] id:FB-29  priority:high  area:editor-architecture  effort:L  status:open`

- **Finding:** FB-09 is the general hardening umbrella; the concrete migration needs its own isolated
  effort so it does not get mixed into feature work. The current custom editable flow has required
  repeated browser-specific fixes and remains the main maintenance risk.
- **Suggested approach:** migrate the editable flow surfaces to a maintained rich-text framework
  (Lexical or ProseMirror) behind the existing `src/lib/page-document.ts` block serialization boundary.
  Preserve the `ContentBlock[]` storage model, sanitizer semantics, publish gate, source-HTML import/export,
  and public rendering output.
- **Touch points:** `src/components/PageDocumentEditor.tsx`, `src/components/RichTextEditable.tsx`,
  `src/lib/page-document.ts`, `src/lib/page-editor-format.ts`, `src/lib/rich-text.ts`, `tests/editor`.
- **Acceptance:** existing page-document round-trip tests pass unchanged; Chromium editor regressions pass;
  a documented Chrome + Firefox manual checklist covers selection, paste, list nesting, link/note insert,
  table-cell editing, undo/redo, and source-mode round-trips.

### FB-30 — WSU SSO integration

`[AI-AGENT-TASK] id:FB-30  priority:med  area:auth  effort:L  status:open`

- **Finding:** all authentication is intentionally local today: owner-provisioned scrypt passwords plus
  HMAC cookies. WSU SSO is desired, but implementation depends on WSU ITS engagement and an approved
  protocol/application registration.
- **Suggested approach:** after ITS engagement, add Entra ID / Azure AD OIDC or SAML as the staff and
  private-KB viewer authentication path. Keep local owner-provisioned accounts until migration is
  complete; when SSO lands it should cover staff and private-KB viewers, superseding local viewer
  passwords.
- **ITS engagement checklist (start this before any code):** (1) application/app registration in WSU's
  Entra ID tenant with production **and** Vercel preview redirect URIs; (2) which protocol ITS supports
  for this app class (OIDC preferred over SAML); (3) claims/groups available for mapping to
  Owner/Admin/Editor/Viewer (or agreement that role assignment stays app-local keyed by verified
  email); (4) token lifetime/refresh policy so the app's 8h session model can wrap the SSO identity;
  (5) an agreed break-glass path — the local bootstrap owner must keep working when the IdP is down.
- **Design constraints from Phase 1:** viewer identities must be modeled so an SSO subject can later
  attach to the same `users` row and `kb_user_assignments` (match on verified email; do not key
  assignments to password-era ids that would need rewriting).
- **Touch points:** `src/lib/auth.ts`, `src/lib/security.ts`, `src/app/admin/sign-in/page.tsx`,
  session cookie handling, user provisioning/role mapping, `.env.example`, `project_spec.md`.
- **Acceptance:** approved WSU SSO users can sign in, map to Owner/Admin/Editor/Viewer roles, retain
  KB assignment scoping, and local fallback behavior is explicitly documented for break-glass use.

### FB-31 — SEO and discoverability

`[AI-AGENT-TASK] id:FB-31  priority:med  area:seo  effort:M  status:open`

- **Finding:** the public KB reader has metadata per article, but there is no sitemap, robots policy,
  canonical URL handling, or Open Graph metadata. Private KB work makes this visibility-sensitive.
- **Suggested approach:** add `sitemap.ts` for public KBs' public published pages only, `robots.ts` that
  disallows private/auth/admin surfaces, canonical URLs, and Open Graph metadata. The sitemap must
  consume the Phase 1 visibility helper so private/staff pages never appear.
- **Touch points:** `src/app/sitemap.ts`, `src/app/robots.ts`, public KB routes, metadata helpers,
  Phase 1 read-access helper, `tests/a11y` or a small route-level test.
- **Acceptance:** public published pages appear in the sitemap with canonical URLs; draft, staff, private,
  admin, asset-auth, and search-result URLs do not; metadata renders useful titles/descriptions/OG tags.

### FB-32 — Reader feedback widget

`[AI-AGENT-TASK] id:FB-32  priority:med  area:governance-feedback  effort:M  status:open`

- **Finding:** the app records zero-result search events and has governance dashboards, but readers
  cannot submit page-level usefulness feedback.
- **Suggested approach:** add a lightweight "Was this page helpful?" widget on public article and KB
  homepage pages. Store aggregate feedback without cookies, IPs, or user agents; surface trends in the
  governance/search-gap dashboard so editors can prioritize unclear pages.
- **Touch points:** public KB page components, new feedback API route, a small DB migration, admin review
  dashboard, audit/search-gap surfaces, privacy notes in `project_spec.md`.
- **Acceptance:** readers can submit yes/no plus optional short feedback; repeat submissions are handled
  without invasive tracking; admins can see page-level feedback counts/trends; feedback submission never
  blocks page rendering.

---

> Items FB-33–FB-34 were ratified by the maintainer (2026-07-16) as the **next build step**, following
> a feasibility review in-session (Claude Fable 5). FB-33 is the foundation; FB-34 shares its
> callout/provenance chrome. Build FB-33 first.

### FB-33 — Cross-page excerpt blocks (internal transclusion)

`[AI-AGENT-TASK] id:FB-33  priority:high  area:content-reuse  effort:L  status:done`

- **DONE (2026-07-16, `feature/excerpt-blocks`):** delivered as designed below. Implementation notes:
  - New `excerpt` block (`sourcePageId` + optional `sourceHeadingBlockId`) serialized as a
    top-level `<div class="doc-excerpt">`; `documentHtmlToBlocks` drops excerpt divs nested inside
    cards/procedure sections. No DB migration was needed — the reference lives in the blocks JSONB
    and the FTS extractor is field-driven, so excerpt blocks index nothing on the target.
  - Resolution (`src/lib/excerpts.ts`): reader-scoped `resolveExcerptForRead` (via
    `getKbReadAccess` + `getPageByPath` for status/staff-ancestor rules; every failure collapses to
    one "unavailable" state), owner-scoped `resolveExcerptForExport` for the KB export, and
    author-facing `checkExcerptSourceForPublish` for the gate. Headings inside excerpted content
    demote to bold paragraphs; nested excerpts render as a pointer note (cap = no recursion, so
    cycles are impossible).
  - Publish gate takes an optional injected `ExcerptSourceChecker` (missing / unpublished /
    section-missing block publish); wired at the save, tree-publish, restore, and review-dashboard
    call sites. Permanent page delete is blocked while any page (any KB) references it via the
    top-level-blocks SQL probe `getExcerptReferencesToPage` (decoy-safe, mirrors the asset probe).
  - Editor: "Excerpt" toolbar insert + `ExcerptSectionEditor` cascading picker backed by
    `GET /api/admin/excerpt-sources` (session + read-access filtered; viewers rejected). Draft
    preview shows a placeholder callout (like videos); the published page resolves live.
  - Theming: `excerptBoxBg/Border/Ink` in `KbTheme` → ThemeEditor "Included Excerpt Styles" +
    contrast row → `--excerpt-box-*` CSS vars consumed by `.excerpt-box` (public) and
    `.doc-excerpt` (editor/preview placeholder).
  - Tests: `excerpts.test.ts` (section extraction, demotion, round-trip, in-memory access matrix,
    gate) and `excerpts.db.test.ts` (live-DB resolution matrix, decoy-safe reference probe, gate
    checker states). Unit, live-DB, axe, and editor Playwright suites all green.
  - The cold-start seed race found while setting up the local Neon test branch was fixed alongside
    (targetless `ON CONFLICT DO NOTHING` in `seedIfEmpty`/`backfillAssetVersions`).
  - **Independent review repair (Codex, 2026-07-16):** the excerpt-sources picker's direct
    `?page=` lookup originally checked only the source row's own status/visibility, so an editor
    without staff access could fetch title/headings of a public page under a staff-only ancestor
    (and of archived pages) by id. It now routes through
    `getReadableExcerptSourcePageForPicker` (`src/lib/excerpts.ts`), applying the same
    `getPageByPath` visibility rules as render-time resolution; live-DB regression added.
  - **Review-question decisions (2026-07-16):** (a) the unavailable callout now carries
    `aria-label="Included content unavailable"` for state parity with the available callout's
    labeled `role="note"` region; (b) long "Included from" labels intentionally wrap rather than
    truncate — visually shortening while exposing full text only to assistive tech would diverge
    the visible and accessible names and hide the section cue sighted readers use.
  - **Maintainer follow-ups (2026-07-17):** (a) excerpt blocks gained `label` (custom attribution
    overriding the default, which now names KB, page, and section via `excerptAttributionLabel`)
    and `openInNewTab` (adds `target="_blank"` + `rel="noopener noreferrer"`), editable in the
    excerpt section editor and honored by the public render and KB export; (b) the draft-preview
    modal now resolves excerpts through `POST /api/admin/excerpt-preview` (session-scoped
    `resolveExcerptForRead`, capped ref count) so preview matches the published render — videos
    and file links remain placeholders.

- **Finding:** content that applies to multiple pages/KBs must currently be duplicated, and copies
  drift when the source page changes. This is the missing Confluence "excerpt include" equivalent:
  a target page should render a section of a source page, and stay current when the source updates.
- **Approach — live reference, not copy-and-sync:** add an `excerpt` `ContentBlock` variant that
  stores a *reference* (source page id + the stable `data-block-id` of a heading, meaning "that
  heading's section"). The target page resolves the source's current blocks server-side at render
  time inside an "Included from [page]" callout frame. Because nothing is copied, source updates
  appear on every target immediately — no sync job, no staleness state for internal excerpts.
- **Design decisions (from the 2026-07-16 feasibility review):**
  - **Visibility:** resolve excerpts through the same `getKbReadAccess` semantics as every public
    surface. When the reader cannot read the source (draft/staff/private/archived relative to them),
    render a neutral "content unavailable" callout — never the content, and no existence signal
    beyond the callout itself. Live-DB access-matrix tests required (§8 convention).
  - **Headings:** demote or strip headings inside excerpted content so the target's heading
    hierarchy stays valid for the publish gate (same normalization family as DOCX import H1/H4–H6).
  - **Search:** excerpted text is *not* indexed on the target page (`kb_extract_blocks_text` sees
    only the reference); the source page matches instead. Accepted and documented behavior.
  - **Reference integrity:** archiving/permanently deleting a source page while excerpts reference
    it is blocked (or degrades to the unavailable callout on archive), mirroring the existing
    related-page/asset reference safeguards with a new usage type.
  - **Cycles:** excerpt resolution carries a depth cap (cards' max-depth-3 precedent) so A→B→A
    cannot recurse.
  - **Rendering & theming (maintainer requirement, 2026-07-16):** the excerpt renders inside a
    **themed callout box in the info-box family**, visually distinct from the info box, with a
    labeled link to the source page ("Included from: [page title]" → canonical page URL). Styling
    follows the exact `infoBox*` pattern: a new `excerptBoxBg`/`excerptBoxBorder`/`excerptBoxInk`
    color triplet in `KbTheme` (`src/lib/kb-theme.ts`), editable in the shared `ThemeEditor` (global
    default + per-KB override), emitted as CSS vars by `themeToCssVars`.
  - **Editor:** excerpts render as a non-editable placeholder block (video/asset-link precedent)
    with a picker to choose source page + section (media-picker pattern).
  - **Print/PDF and KB export** inline the resolved content; revision snapshots store the reference
    only (accepted: a target revision does not freeze excerpt content as-of that save).
- **Touch points:** `src/lib/types.ts`, `src/lib/page-document.ts`, `src/components/PageBlocks.tsx`,
  `src/components/PageDocumentEditor.tsx`, `src/lib/kb-store.ts` / `src/lib/db.ts` (resolution +
  usage tracking), `src/lib/publish-gate.ts`, `src/lib/kb-export.ts`, `style/style.md` (block
  contract mirror, §8), live-DB + in-memory tests.
- **Acceptance:** (1) editing a source page updates every target render immediately; (2) readers
  without source access see the fallback callout and never the content (in-memory + live-DB matrix
  tests); (3) source archive/permanent-delete is blocked or degrades safely while referenced;
  (4) cyclic excerpts are capped, not infinite; (5) the publish gate passes/fails correctly on pages
  containing excerpts; (6) print and KB export inline the resolved content (delivered deviation:
  the client-side draft preview shows a placeholder callout, matching the existing video/file-link
  preview behavior);
  (7) the excerpt callout colors are editable in the global and per-KB theme editors exactly like
  the info box, and the source link renders in the callout chrome.

### FB-34 — Sourced content from the published P&P manual (external excerpt with provenance)

`[AI-AGENT-TASK] id:FB-34  priority:high  area:content-sourcing  effort:M  status:in-progress`

- **CORE DELIVERED (2026-07-17, `feature/excerpt-blocks`):** the editor-facing import piece:
  - New top-level `sourced` `ContentBlock` (`sourceUrl`, `sourceAnchor`, `label`, `openInNewTab`,
    `headingText`, `retrievedAt`, `contentHash`, nested `blocks`), serialized as
    `<section class="doc-sourced">` with the snapshot content inside; round-trips the editor's
    Visual/HTML modes.
  - **"P&P source" toolbar insert** → `SourcedSectionEditor`: paste a source link with a
    `#section-anchor`, **Import from source** fetches server-side
    (`POST /api/admin/sourced-content`), extracts from the anchor heading to the next
    same-or-higher heading, absolutizes links/images, normalizes tables to the `doc-table`
    contract, sanitizes through `documentHtmlToBlocks` (h4–h6 → H3), and stores the blocks plus a
    content hash of the id-stripped block JSON. **Paste HTML instead** is the first-class fallback
    (same sanitizer, URL still recorded). Attribution label + open-in-new-tab controls match the
    FB-33 excerpt editor.
  - **SSRF containment:** server fetches are `https`-only against an allowlist (default
    `gradschool.wsu.edu`; override `SOURCED_CONTENT_ALLOWED_HOSTS`), honest UA
    `wsu-gradschool-kb/1.0`, bounded timeout and body size.
  - **Staleness (manual v1):** "Check source for changes"
    (`POST /api/admin/sourced-content/check`) re-fetches, re-extracts, and hash-compares —
    reporting unchanged / changed / anchor-missing / unreachable; "Refresh from source" re-imports
    and the editor reminds the author to save (publish re-runs the gate). Reader pages never fetch
    the source.
  - Public render: `source-box` provenance callout ("Source: [label] · retrieved [date]" linking
    to the anchored source), themed by the delivered `sourceBoxBg/Border/Ink` tokens (ThemeEditor
    "External Source Styles" + contrast row). Publish gate and KB export recurse into sourced
    content; migration `030_sourced_blocks_search` indexes sourced text in FTS (unlike live
    excerpts, the snapshot is page content), with in-memory parity via `blocksBodyText`.
- **Second review hardening (Codex, 2026-07-17):** outbound fetches tightened — URLs with
  userinfo, query strings, non-default ports, or malformed anchors are rejected; redirects are
  not followed (`redirect: "manual"`); the response body is capped by a streaming byte counter;
  imported hrefs are restricted to http/https/mailto and images to http/https; the anchor lookup
  no longer interpolates into a selector. Follow-ups: `openInNewTab` carried through draft
  preview and KB export with hidden "(opens in a new tab)" text on reader-facing attribution
  links; the editor/preview sourced placeholder falls back label → heading text → source URL.
- **Maintainer feedback round (2026-07-17):** (a) imports now compute the P&P **section number**
  ("3.1.1") structurally — the manual renders numbers with CSS counters
  (`data-numbering-mode="css-counters"`), so the extractor replays them by counting h2–h6 among
  the anchor's content siblings (the TOC `<nav>` is a different parent and never counts); the
  stored heading becomes e.g. "3.1.1 Doctoral Programs". A section deliberately includes its
  subsections (until the next same-or-higher heading). (b) The attribution **label is pre-filled
  and editable**: sourced imports default to "[document h1] — [numbered heading]" (e.g.
  "2025-2026 Graduate School Policies and Procedures — 3.1.1 Doctoral Programs"); excerpt pickers
  default to "KB: Page — Section" on selection. (c) The label/new-tab controls were redesigned:
  full-width label input, properly aligned checkbox (`.attribution-label-field` /
  `.attribution-checkbox`).
- **Maintainer feedback round 2 (2026-07-17):** (a) the sourced callout now renders the numbered
  section heading (`headingText`) as a styled non-outline heading (`.source-box__heading`) above
  the content — visually matching the P&P source without contributing to the target page's
  heading outline; mirrored in KB export and the editor placeholder. (b) Import normalization
  unwraps `blockquote`/`div`/`section`/`article`/`main` containers before sanitizing — the P&P
  wraps some sections in `<blockquote>`, which the editor sanitizer treated as one inline run,
  silently merging sibling paragraphs into a single block. (c) The new-page form gained a
  searchable **Parent page** picker (reuses `GET /api/admin/excerpt-sources?kb=` — access-scoped,
  tree-ordered) so pages can be created nested directly; the create API already accepted
  `parentPath`, and drag re-nesting in the page tree is unchanged.
- **Maintainer decision (2026-07-17): allowlisting stays host-level, not path-level.** Path
  restriction adds no SSRF protection within an already-allowlisted https origin, and would
  block future WSU source pages without a code change; the provenance callout always shows the
  exact source URL, so breadth is visible.
- **Remaining (before flipping to done):** scheduled/automated staleness (cron polling the
  `wp-json` `modified` timestamp + review-dashboard "source updated" flags with the tri-state
  relink flow) — today checking is a per-block editor action, which fits the annual publication
  cadence; and live editor QA against the real P&P page from a deployed environment.

- **Finding:** the Graduate School Policies & Procedures manual is published at
  `https://gradschool.wsu.edu/graduate-school-policies-and-procedures/` (WordPress, one ~600 KB
  page). Editors want to include specific policy sections in KB pages with a visible "this comes
  from the P&P" callout and awareness when the source changes. KB users have access to the webpage
  only — not to the maintainer's Word→HTML converter that generates it.
- **Feasibility findings (2026-07-16 live probes; revalidate before build):**
  - The page carries **341 stable heading anchors (h2–h6)** generated by the maintainer's converter
    heading map. Anchor ids persist across publication cycles **only while heading text is
    unchanged** (strict signature match, no fuzzy fallback) — a reworded heading mints a new id, so
    the stored reference must keep the heading text alongside the anchor.
  - The **WordPress REST API is open**: `wp-json/wp/v2/pages?slug=graduate-school-policies-and-procedures`
    returns the page id and a `modified` timestamp; `content.rendered` is fetchable.
  - The **WAF blocks default tool user agents** (curl → 403) but serves any self-identifying UA
    (e.g. `wsu-gradschool-kb/1.0`) on both the page and `wp-json`. The web team is not cooperative:
    assume every fetch path is revocable without notice.
  - Page-level `Last-Modified`/`ETag` are render-time stamps — **useless for change detection**.
    Use the `wp-json` `modified` field plus stored per-section content hashes.
  - The manual republishes in **discrete annual cycles** ("2025–2026", "2026–2027"), not continuous
    edits.
- **Approach — snapshot import with staleness flags, never live embedding:**
  1. An admin **"Import from source"** action accepts a P&P URL + anchor, fetches server-side
     (`wp-json` preferred, HTML page fallback, honest identifying UA), extracts from the anchor's
     heading to the next same-or-higher-level heading, sanitizes through the existing paste-HTML
     path (h4–h6 → H3 demotion), and stores real blocks inside a **sourced-content callout block**
     with metadata: source URL + anchor, heading text, retrieved date, section content hash.
  2. Public render shows the provenance callout — *"Source: Graduate School Policies and
     Procedures — [section], retrieved [date]"* — linking to the anchored source. Shares callout
     chrome with FB-33 but is its **own themed box** (maintainer requirement, 2026-07-16): a
     `sourceBoxBg`/`sourceBoxBorder`/`sourceBoxInk` triplet in `KbTheme` following the `infoBox*` /
     FB-33 `excerptBox*` pattern, editable in `ThemeEditor` (global + per-KB), emitted by
     `themeToCssVars`. Info box, KB excerpt, and P&P source are three independently styleable
     callout kinds.
  3. **Staleness:** a cron (`CRON_SECRET` pattern; confirm the Vercel plan's cron count, §13) or a
     manual "check sources" admin button polls `modified`; on change, re-extract only the referenced
     sections and compare hashes. Affected pages are **flagged in the review dashboard** with a
     tri-state: *content changed* (review + refresh) / *anchor moved* (heading text found under a
     new id — relink) / *section removed* (flag hard). **Never auto-update** — refresh is a
     deliberate editor action that re-runs the publish gate.
  4. **Never fetch in the reader render path.** Fetch failures degrade to an admin-side "source
     unreachable — last verified [date]" state; the published KB page is unaffected.
  5. **Paste-from-browser fallback is a first-class import mode:** the import action also accepts
     pasted section HTML with a manually entered source URL (same sanitizer, same callout), so the
     feature degrades to copy-paste-with-provenance if server access is ever lost entirely.
- **Touch points:** the FB-33 callout/block foundation, `src/lib/page-document.ts` /
  `src/lib/rich-text.ts` (sanitize path), a new admin import UI + API route (`requireAdminMutation`
  + `requireKbAccess`), a cron route, `src/lib/admin-review.ts` (source-updated flags), a migration
  for source metadata, `.env.example` if any config is added, `style/style.md`, tests.
- **Acceptance:** (1) an editor can import `#graduate-program-faculty` and publish a page showing
  the section inside the provenance callout; (2) a source change flags affected pages for review,
  and one-click refresh re-runs the publish gate; (3) anchor rename/removal is flagged distinctly
  from content change; (4) fetch failure or a closed API never affects public rendering; (5) the
  paste fallback produces identical block output to the fetch path; (6) polling is throttled and
  sends an honest identifying user agent; (7) the source callout colors are editable in the global
  and per-KB theme editors like the info box, independently of the FB-33 excerpt callout.

### FB-35 — KB-level search widget

`[AI-AGENT-TASK] id:FB-35  priority:med  area:public-ux  effort:S  status:done`

- **DONE (2026-07-18, maintainer-requested):** an owner-configurable search box rendered in the
  left sidebar (above the page tree) of every KB landing and article page, plus an optional
  all-KB search box on the site home page.
  - **Data:** migration `031_search_widget` — `knowledge_bases.search_widget_enabled` (default
    off), `search_widget_scope` (`'kb'` | `'all'`), `search_widget_label` (blank = derived
    default), and `site_settings.show_home_search`.
  - **Config:** the owner-only KB Management edit form (`/admin/kbs`, PATCH
    `/api/admin/kbs/[kbId]`) and the Site Settings home tab (flows through
    `normalizeSiteSettings`). The scope choice is deliberately KB-level policy, not per-page
    content — see the design rationale: search is chrome, consistency beats per-page insertion,
    and a KB-level widget only ever targets its own KB or `/search`, so no unreadable-target
    edge cases exist.
  - **Render:** `KbSearchWidget` / `HomeSearchWidget` (`src/components/KbSearchWidget.tsx`) — a
    plain GET form (`role="search"`, labeled input) posting to `/kb/{slug}/search` or `/search`;
    zero JavaScript, inheriting the results pages' rate limiting and visibility enforcement, so
    the widget adds no new security surface. Inherits KB theme tokens; no dedicated `searchBox*`
    triplet (add later if ever needed).
  - Seed KB `kb-grad-school` ships with the widget enabled so in-memory dev and the axe suite
    exercise it. Tests: `search-widget.test.ts` (settings normalization),
    `search-widget.db.test.ts` (column persistence + mapping).
  - **Independent review repairs (Codex, 2026-07-18):** (a) legacy always-on `.kb-search` forms
    on the site home page and the generated KB landing hero were removed so the configurable
    widgets fully own search chrome — **behavior change:** after deploying, the home search box
    is hidden until the owner enables `showHomeSearch`, and generated KB landings show search
    only for widget-enabled KBs (an owner should enable the widget on production KBs post-merge
    to restore the affordance); an a11y assertion covers the default-off home case.
    (b) `seedIfEmpty` now inserts the widget columns so fresh-database seeds match the in-memory
    dataset. (c) Migration-head references in README/spec were reconciled to `031`.
  - **Review-question decisions (2026-07-18):** the KB create modal intentionally stays minimal —
    create first, then configure the widget via Edit; scope/label controls stay editable while
    the enable checkbox is off so owners can preconfigure before switching on.
  - **Search-quality round (2026-07-18, maintainer feedback):** (a) reader-facing search results
    now include only `document` assets — image/video assets are excluded in both the SQL and
    in-memory paths (readers were matching image descriptions that mirror alt text; images
    surface through the pages that use them); unit + live-DB regressions added. (b) The widget's
    text submit button (nearly as wide as the input in the 260px sidebar) was replaced with a
    compact icon submit (`.kb-search-widget__submit`, magnifier + `sr-only` text).
  - **Live in-place suggestions (2026-07-18, maintainer feedback — modeled on the P&P TOC
    filter):** the widget is now a progressive-enhancement combobox (`LiveSearchForm`): typing
    (debounced 250ms, min 2 chars) opens a suggestion panel in place — top 8 results with KB
    context when global-scoped, ARIA combobox/listbox semantics (options are non-interactive
    `role="option"` items navigated via JS — axe `nested-interactive` clean), arrow-key
    navigation, Esc to close, a "See all results" option, and a polite live-region count
    announcement. Backed by the new public `GET /api/search` endpoint, which reuses the exact
    page-level visibility contract (`globalSearchScope` in `src/lib/search-scope.ts`, now shared
    with `/search`, and per-KB `getKbReadAccess`), its own rate-limit bucket
    (`search-suggest:`, 60/min), `Cache-Control: private, no-store`, and empty-result responses
    for unknown/unreadable KBs (no oracle). Without JavaScript the form still submits to the
    results pages. Covered by `tests/a11y/live-search.spec.ts` (suggestions appear, axe-clean
    with the panel open, Esc closes, Enter falls back to the results page).
  - **Deferred by design:** an in-page search content block (phase 2 if a concrete case appears).

### FB-36 — Page-tree group headings and links

`[AI-AGENT-TASK] id:FB-36  priority:med  area:public-ux  effort:M  status:done`

- **DONE (2026-07-18, maintainer-requested):** the page tree can now contain two non-page node
  kinds, modeled as `kb_pages.node_kind` (`'page'` default | `'group'` | `'link'`, migration
  `032_tree_node_kinds` with `link_url` + `link_new_tab`) so all tree machinery — paths, sort
  order, drag re-nesting, staff-ancestor pruning, locks, revisions — is reused rather than
  duplicated.
  - **Group heading:** an organizational label pages nest under; renders as a non-clickable
    uppercase label (`.page-tree__group`) in the public tree, has no article page (its URL
    returns the not-found boundary), and staff-only visibility on a group hides everything
    nested under it via the existing path-based prune.
  - **Link:** a tree item navigating to an `https://` URL or internal `/` path (validated at
    create/publish), optional new-tab with hidden "(opens in a new tab)" text.
  - **Exclusions:** groups/links never appear in search results (SQL `node_kind = 'page'` filter
    + in-memory parity), the excerpt-source picker, the KB homepage assignment (rejected in
    `setKbHomepagePage`), the generated KB-landing section cards, or KB-export page files
    (kb.json still records them).
  - **Admin:** the New Page form gained a Type selector (link shows destination + new-tab);
    `/admin/pages/[pageId]` renders `TreeNodeSettingsForm` (title/status/visibility/destination,
    no block editor) for non-page kinds; tree-manager rows show Group heading/Link badges and
    hide Set Home for them. Publish gate: non-page kinds publish on title (+ valid destination
    for links) alone.
  - Seed data adds a published "Reference" group with an external P&P link under it so in-memory
    dev and the axe suite exercise both kinds. Tests: `tree-nodes.test.ts` (search exclusion,
    homepage rejection, gate rules) and `tree-nodes.db.test.ts` (column mapping + FTS
    exclusion).
  - **Independent review repairs (Codex, 2026-07-18/19):** (a) `seedIfEmpty` now persists
    `node_kind`/`link_url`/`link_new_tab`, so fresh-database seeds keep the demo Reference
    group/link instead of degrading them into empty pages; (b) revision restore passes
    `linkUrl`/`linkNewTab` back through `updatePage`, and `validateRevisionForRestore` treats
    link revisions as links — previously a restored link node silently kept the current
    destination; unit regressions cover both paths; (c) page PATCH now rejects
    `javascript:`/`data:` link destinations on drafts too, closing the stored-unsafe-input gap
    in front of the existing create/publish/render guards; (d) migration-head doc references
    reconciled to `032`.
  - **Post-review follow-up (2026-07-19):** `generateMetadata` and redirect-target handling call
    `notFound()` for non-page nodes, so a group/link URL renders the not-found boundary without
    leaking group metadata. The Playwright regression asserts soft-404 **parity** with missing
    article routes: KB page routes stream and commit HTTP 200 for all not-found states by
    existing convention, so literal 404 statuses remain a route-wide open question, not a
    tree-node one.
  - **Deliberately unchanged (review-noted):** the review dashboard may list draft group/link
    nodes in its draft buckets (admin-only noise under the minimal non-page gate), and
    `PageTree` renders a manually DB-inserted `http://` link defensively even though every app
    validator only accepts `https://` or internal `/`.

---

## 13. Operations runbook


### Deploy Checklist

- Confirm `npm run check`, `npm run lint`, `npm test`, and `npm run build` pass locally or in CI.
- Confirm `npm run test:db` passes against the current Neon test branch before promoting changes that touch migrations or DB behavior.
- Confirm Vercel has `DATABASE_URL`, `KB_ADMIN_EMAIL`, `KB_ADMIN_PASSWORD`, `KB_ADMIN_SESSION_SECRET`, and `CRON_SECRET` configured for the target environment.
- If review-date email delivery is expected, confirm `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_TOKEN`, and `EMAIL_FROM`; otherwise expect structured JSON fallback logs.
- Confirm the Vercel plan supports the configured cron count before deploy validation; this project currently schedules audit cleanup, revision cleanup, and review digest routes.
- For Blob-backed assets, confirm the Vercel Blob environment variables are present in the target environment.
- Deploy through the GitHub-to-Vercel flow, then promote the successful Vercel deployment to production.
- After deploy, visit `/`, one public KB landing page, one article page, `/admin`, `/admin/pages`, and `/admin/assets`.
- Confirm scheduled cron routes return authorized success when called with `Authorization: Bearer $CRON_SECRET`.
- Check Vercel function logs for structured JSON errors with `timestamp`, `severity`, `route`, `message`, and `stack`.

### Rollback Checklist

- Use the Vercel dashboard to roll back or promote the last known-good production deployment.
- If a database migration caused the incident, do not point production at an older code deployment until the schema compatibility has been checked.
- Keep Neon production data on the current production branch; use a Neon branch restore only after confirming the restore point and expected data loss window.
- Re-run the public KB smoke checks and admin sign-in check after rollback.
- Record the deployment URL, commit SHA, symptom, rollback action, and follow-up issue in the project tracker.

### Neon Branch Strategy

- Use a separate Neon branch for live-DB CI and destructive manual testing.
- Run new migrations on a Neon test branch before merging to `main`.
- Avoid manual schema edits on production; add versioned migrations in `src/lib/migrations/index.ts`.
- Before large imports or risky schema changes, create a Neon branch or restore point that can be used to inspect or recover data.

### Cron Secrets

- Cron routes require `Authorization: Bearer $CRON_SECRET`.
- Rotate `CRON_SECRET` by updating Vercel environment variables, redeploying, and confirming the scheduled routes still authorize.
- Treat missing email/provider configuration as non-fatal unless the specific cron route documents otherwise.
- `/api/admin/cron/review-digest` sends weekly review-date digests when an email provider is configured; without one it logs recipients/subjects as structured JSON and reports skipped deliveries.
- `/api/admin/cron/audit-cleanup` also folds page-view rows older than 90 days into monthly totals.

### Post-Deploy Checks

- Verify migration `029_kb_visibility` applied: in Neon SQL Editor, run
  `SELECT id FROM _schema_migrations WHERE id = '029_kb_visibility';`, then confirm existing public
  KBs show `visibility = 'public'` with
  `SELECT slug, visibility FROM knowledge_bases ORDER BY slug;`.
- Public KB list renders without loading draft-only content.
- Article pages render blocks, related assets, table of contents, and PDF controls where configured.
- Asset delivery works for a known image/document asset.
- Private KB smoke check: create a private KB, add a published public-visibility page with an
  attached file, create a Viewer assigned only to that KB, then confirm in an incognito window that
  the Viewer can read the KB/page/file while an anonymous window gets 404 for the same KB, article,
  search, and file URLs.
- Test owner KB export on a media-heavy KB after deploy. The ZIP response is streamed and asset bytes are loaded one entry at a time; if an asset fetch fails mid-stream the download is truncated and a structured `kb-export` error is logged, so verify the downloaded ZIP opens cleanly.
- Admin users can sign in, edit a draft page, and see audit-log entries.
- `/admin/usage` loads aggregate view counts when `DATABASE_URL` is configured.
- Logs are structured JSON and suitable for forwarding through Vercel log drains.

---

## 14. Phase 1 build plan (private knowledge bases) — delivered; retained as audit trail

> **Status: delivered and merged to `main` 2026-07-14 (PR #11), including two review-hardening
> rounds (see §12 FB-27 notes). This section is kept verbatim as the implementation audit trail;
> do not execute it again.**

This section is the complete, ordered implementation plan for Phase 1 (§12 FB-27). An agent assigned
Phase 1 must read this spec in full first — §2 (scope), §3 (authorization matrix and the Phase-1
gating table, which is the checklist), §8 (gotchas: the migration-runner and per-route-scoping
entries are binding), §11 (sequence rationale), §12 FB-27 (acceptance criteria — the definition of
done) and FB-30 (SSO design constraints), §13 (operations) — and then execute this plan starting at
Step 0. Do not reorder steps.

### 14.1 Hard boundaries

- **No SSO code.** No OIDC/SAML/Entra dependencies or stubs. All authentication stays local
  (scrypt passwords + HMAC cookies). SSO is FB-30, gated on WSU ITS engagement. The only SSO
  obligation in this phase: viewer identity must be a normal `users` row keyed by email with access
  via `kb_user_assignments`, so an SSO subject can attach to the same row later without a data
  migration.
- **Do not touch the page editor core** (`PageDocumentEditor.tsx`, `page-document.ts`,
  `page-editor-format.ts`).
- **Documentation lives in exactly two files**: `project_spec.md` and `README.md`. Do not create new
  .md files, docs folders, or backlog files. Backlog updates go in §12; operational notes in §13.
- **Branch discipline:** one short-lived branch (`phase-1-private-kbs`), one PR to `main`, branch
  deleted on merge. No other branches.

### 14.2 MAINTAINER ACTION REQUIRED protocol

The implementing agent cannot create Neon branches/databases, change Vercel environment variables,
or add GitHub secrets. Whenever a step needs any storage or infrastructure action, the agent MUST
stop and print a block in exactly this shape, then wait for the maintainer to confirm before
continuing:

```
=== MAINTAINER ACTION REQUIRED ===
Why: <one sentence — what this unblocks>
Steps:
  1. <exact console navigation or CLI command, e.g. "Neon console → your project → Branches → New branch → name it phase1-bootstrap-test, parent: main">
  2. <exactly what value to copy and where to paste it, e.g. "copy the pooled connection string and paste it into .env.local as DATABASE_URL_TEST">
  3. <how to verify it worked, e.g. "the branch shows 'idle' in the Neon console">
Cost/risk: <e.g. "free on your Neon plan; throwaway branch, deleted at the end">
When done, reply: DONE
==================================
```

Never assume a secret or environment variable exists — check, and if missing, emit the block. Known
points where this WILL happen:

1. **Step 0 fresh-bootstrap test** needs a throwaway Neon branch (create branch → paste pooled
   connection string; the agent runs the bootstrap and tests against it, then gives the maintainer
   explicit deletion instructions).
2. **Production schema:** migration `029` applies automatically on the first request after deploy
   (§6 — no manual migration step). The PR description must state this explicitly: no Neon console
   action is needed for production, and afterward the maintainer verifies `_schema_migrations`
   contains `029` and existing KBs show `visibility = 'public'`.
3. If the CI live-DB step is skipped on the PR (no `DATABASE_URL` repo secret), emit the block with
   GitHub → Settings → Secrets instructions rather than merging without it.

No Vercel Blob changes are expected in this phase; if one appears necessary, stop and emit the
block rather than proceeding.

### 14.3 Ground rules

- Follow §3's authorization contract for every route touched and keep both §3 tables current.
- The §8 migration gotcha is binding: migration `up()` must be straight-line, idempotent SQL — no
  branching on query results, every statement tolerant of double execution.
- Unauthorized access to private content returns `notFound()` — never a redirect, never a
  "sign in to view" page, never a distinguishable error. Private KBs must not leak existence.
- Every new `isDatabaseEnabled()` branch needs matching live-DB coverage (§8); the in-memory seed
  path must implement identical visibility semantics so local dev behaves like production.
- Definition of done per step: `npm run check`, `npm run lint`, `npm test`, `npm run build` green;
  `npm run test:a11y` and `npm run test:editor` green at the end; live-DB suites green on the PR.

### 14.4 Build sequence

**Step 0 — Fresh-database bootstrap verification (pre-work).** The advisory-lock migration runner
has never executed a from-scratch bootstrap (every existing DB already had schema). Before adding
migration `029`: request a throwaway Neon branch **created from an empty database, not from
production** (MAINTAINER ACTION REQUIRED), point `DATABASE_URL` at it locally, hit the app once so
`ensureSchema()` runs migrations 001→028 through the collector, run `npm run test:db` against it,
report results, then give the maintainer explicit steps to delete the branch. If the bootstrap
fails, fix the offending migration (within §8 rules) before anything else.

**Step 1 — Migration 029 + data model.** `knowledge_bases.visibility TEXT NOT NULL DEFAULT
'public'` (values `public`|`private`); the `visibility` field on the `KnowledgeBase` type; the
demo/seed data (default public, plus one private seed KB so in-memory mode can exercise the access
matrix); every KB row mapper in `db.ts`.

**Step 2 — The read-access helper (behavior-preserving refactor first).** Add one helper beside the
existing scope helpers in `src/lib/auth.ts`/`src/lib/security.ts` (e.g. `canReadKb(session, kb)`
plus a list-filter variant): anonymous → public KBs; Owner/Admin → all; Editor → public + assigned;
(Viewer → public + assigned private, arrives in Step 3). Convert ALL existing
`isStaff = Boolean(session)` call sites to the helper **before introducing the viewer role**, so
this commit is behavior-preserving for today's users. Surfaces (§3 Phase-1 table is the checklist):
home KB list (`src/app/page.tsx`), `/kb/[kbSlug]` landing, `/kb/[kbSlug]/[...pagePath]` articles,
per-KB search, global `/search` scope object, page tree, redirects resolution, and the two
page-view recording guards. Staff-page visibility becomes per-KB through the same helper — this
intentionally fixes the current looseness where any signed-in editor reads staff pages of every KB
on public routes; note the behavior change in the PR description.

**Step 3 — Viewer role.** Add `"viewer"` to `UserRole`; `/admin/users` (owner-only) can create/edit
viewers and assign KBs with the existing picker; `kb_user_assignments` is reused unchanged.
Guarantees, each with a test: (a) viewers hitting `/admin/**` are redirected to `/` before any admin
UI renders; (b) `requireAdminMutation` rejects viewers on every mutation API (403); (c) viewers
never see draft pages or staff-only pages, even in assigned KBs; (d) viewers are excluded from
review-digest recipients (`buildRecipients`) and from `/admin/usage`; (e) `GET /api/admin/kbs` and
other editor-reachable data APIs do not become viewer-reachable.

**Step 4 — Asset delivery gating (most security-sensitive step).**
`src/app/kb/[kbSlug]/files/[assetSlug]/route.ts`, including the video 307-redirect path:
- Assets homed in a private KB require a session with read access to that KB.
- Assets in a public KB referenced ONLY by staff-visibility pages require a session with KB read
  access (derive from existing usage-tracking data; an asset referenced by at least one public
  published page stays public).
- Any response that required authorization: `Cache-Control: private, no-store`. Public assets keep
  current caching. Unauthorized → `notFound()`.
- Watch the redirect-to-Blob path: if an authorized private asset would 307 to a public Blob URL,
  that URL is itself unauthenticated — serve private asset bytes through the route instead (no
  redirect) and say so in the PR. Do not leave a public Blob URL as an authorization bypass.

**Step 5 — Search gating.** Extend the existing staff-prune `NOT EXISTS` pattern in the FTS SQL so
private-KB pages/assets never appear for callers without read access; mirror identical semantics in
the in-memory search path. Applies to per-KB search, global `/search` (its scope object should now
be built from the Step 2 helper), and zero-result gap logging.

**Step 6 — Admin UX.** Owner-only visibility control on KB create/edit (`/admin/kbs` +
`PATCH /api/admin/kbs/[kbId]`, owner-gated like status); "Private" badge on admin KB and page
lists; viewer role option in the user form. Keep the §3 tables current.

**Step 7 — The access-matrix test suite (FB-27 acceptance, verbatim).** Live-DB tests (new
`*.db.test.ts` beside `ki1.db.test.ts`) plus in-memory unit tests covering: (1) anonymous → 404 on
private KB landing/article/search/asset routes; (2) a viewer assigned to private KB A reads A and
gets 404 on private KB B; (3) viewer mutation attempts → 403 and no admin surfaces; (4) staff-only
pages and staff-only-referenced assets readable only with KB read access; public assets cacheable
only when referenced by a public published page; (5) public and per-KB search never return
private/staff results to unauthorized callers; (6) authorized private-asset responses carry
`Cache-Control: private, no-store`. Add one axe smoke case for a signed-in viewer reading a private
article.

**Step 8 — Docs + ship.**
- This spec: §2 moves private KBs from "required next" to built; §3 matrix and gating tables updated
  from "Phase 1 target" to enforced-with-file-references; §9/§10 updated honestly (private pages are
  dynamic/uncacheable by design); flip FB-27 to `status:done` with a dated note (never delete
  items); §13 gains a "private KB smoke check" post-deploy item.
- `README.md`: roles section gains Viewer; current-status section updated.
- Open ONE PR to `main`. The PR description must include: the Step 2 behavior change, the
  production-migration note from §14.2, and a **maintainer smoke-test script** in plain numbered
  steps (create a private KB → add a viewer → sign in as the viewer in an incognito window →
  confirm read works; confirm anonymous 404 on the same URLs; confirm a private page's attached
  file 404s anonymously).
- Confirm the CI live-DB step RAN (not skipped) before declaring ready. After merge, delete the
  branch and give the maintainer the §13 post-deploy checks, including verifying migration `029`
  applied and existing public KBs are unaffected.

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
> §11–12 (future work + tagged backlog) → §13 (operations runbook).
> Delivered-work history lives in git; this document stays current-state.

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

**In scope (built today):** public and private multi-KB reading; custom block/rich-text editor;
managed assets with versioning, tag organization, usage index, and stable URLs (including responsive image variants);
Postgres full-text search with an optional search widget; Owner/Admin/Editor/Viewer auth with
per-KB scoping; configurable KB homepage pages; per-KB theming, global default theme, and owner
site settings; DOCX staged import; automatic redirects; edit locks; page tags/keywords;
publish-time accessibility / governance gate; owner/admin publish approval; audit log; revision
history with compare/restore; proposed-edits workflow; review dashboard (including reader feedback);
content health dashboard; trash for archived pages; KB starter templates; home KB filter; optional
AI draft summaries in the page editor; print-to-PDF (browser print over semantic HTML); KaaS read
API; sitemap/robots/OG for public pages. Private KBs use KB-level
`public`/`private` visibility, owner-provisioned local-password `viewer` accounts,
`kb_user_assignments` for viewer/editor access, read gating on every public surface, and
visibility-aware asset delivery/search.

**Content reuse (built):** cross-page excerpt blocks (live "Included from" callouts) and P&P
sourced-content snapshots (allowlisted external import with check-for-changes / refresh).

**Release readiness (ops, not a product feature):** complete the manual release gate
(`docs/release-gate.md`, §12 FB-25) and §13 sign-off before claiming production WCAG/compliance.

**Future only** (see §11 / §12):

1. **Editor framework migration** (FB-09 / FB-29) — Lexical/ProseMirror behind `ContentBlock`;
   plan in `docs/editor-framework-migration.md`.
2. **WSU SSO** (FB-30) — Entra ID / Azure AD OIDC or SAML, gated on WSU ITS engagement.
3. **Confluence import/export bridge** (FB-37) — concept only; not scoped.

**Out of scope (intentionally, for now):** a per-KB "manager" role tier; self-service public signup
(accounts are Owner-provisioned); WYSIWYG parity with Word; real-time multi-cursor co-editing
(concurrency uses locks, not CRDTs).

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
| Pages list/edit/submit | all | all | assigned | no | `filterKbsForSession` + `requireKbAccess` |
| Publish/approve pages | all | all | no | no | Owner/Admin role checks on publish/status/restore paths |
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
| `/admin/pages`, `/admin/pages/new` | Owner/Admin/all assigned Editors | The pages list is scoped to one KB via `?kb=` (slug; id also accepted and normalized) using `KbScopePicker` + `filterKbsForSession`; the new-page dropdown calls filtered `GET /api/admin/kbs`; writes must still pass API `requireKbAccess`. | `src/app/admin/pages/page.tsx`, `src/components/AdminPagesWorkspace.tsx`, `src/app/admin/pages/new/page.tsx`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/pages/route.ts` |
| `/admin/pages/[pageId]` | Owner/Admin/assigned Editor | Detail page resolves the page's KB and calls `canAccessKb(...)`; failed access returns `notFound()`. | `src/app/admin/pages/[pageId]/page.tsx` |
| Page mutation APIs | Owner/Admin/assigned Editor, except publish/schedule/restore-published/permanent-delete Owner/Admin only | `PATCH`, status, layout, lock, create, and relocate routes use `requireAdminMutation` plus `requireKbAccess` (relocate requires access to **both** source and destination KBs); publish, schedule-publish writes, restoring published revisions, and permanent delete also check owner/admin. | `src/app/api/admin/pages/**/route.ts`, `src/lib/kb-store.ts` (`relocatePage`) |
| KB homepage API | Owner/Admin/assigned Editor | Sets or clears `knowledge_bases.home_page_id`; route uses `requireAdminMutation` plus `requireKbAccess(kbId)`. | `src/app/api/admin/kbs/[kbId]/homepage/route.ts` |
| `/admin/assets` and asset picker API | Owner/Admin/assigned Editor | UI lists use `filterKbsForSession`; picker `GET /api/admin/assets` requires a session and `requireKbAccess(kbId)`. | `src/app/admin/assets/page.tsx`, `src/app/api/admin/assets/route.ts` |
| `/admin/assets/[assetId]` | Owner/Admin/assigned Editor | Detail page resolves the asset's home KB and calls `canAccessKb(...)`; failed access returns `notFound()`. | `src/app/admin/assets/[assetId]/page.tsx` |
| Asset mutation APIs | Owner/Admin/assigned Editor, except permanent delete Owner/Admin only | Upload/metadata/status/replace/activate routes use `requireAdminMutation` plus `requireKbAccess`; permanent delete also checks owner/admin. | `src/app/api/admin/assets/**/route.ts` |
| `/admin/import` and staged import APIs | Owner/Admin/assigned Editor | Import list page uses `accessibleKbIds`; collection/item/stage/commit APIs use `requireKbAccess` after resolving or receiving `kbId`. | `src/app/admin/import/page.tsx`, `src/app/admin/import/[stagedImportId]/page.tsx`, `src/app/api/admin/import/**/route.ts` |
| `/admin/redirects` and redirect APIs | Owner/Admin/assigned Editor | UI lists use `filterKbsForSession`; API routes use `requireKbAccess` on the target/resolved KB. | `src/app/admin/redirects/page.tsx`, `src/app/api/admin/redirects/**/route.ts` |
| `/admin/review` | Owner/Admin/assigned Editor | Dashboard data is called with `accessibleKbIds(session)`; owner/admin pass `null` for all KBs. | `src/app/admin/review/page.tsx`, `src/lib/admin-review.ts` |
| `/admin/health` | Owner/Admin/assigned Editor | Content-health data is called with `accessibleKbIds(session)`; owner/admin pass `null` for all KBs. Viewers redirect to `/`. | `src/app/admin/health/page.tsx`, `src/lib/content-health.ts` |
| `/admin/usage` | Owner/Admin/assigned Editor | Usage analytics are server-rendered from `getUsageAnalyticsForSession(session)`, which scopes through `accessibleKbIds(session)`; Viewers redirect to `/`. | `src/app/admin/usage/page.tsx`, `src/lib/page-views.ts` |
| `/admin/audit` | Owner/Admin only | Server page redirects Editors to `/admin`; audit API surface is not editor-reachable. | `src/app/admin/audit/page.tsx` |
| `/admin/settings`, `/admin/kbs`, `/admin/users` | Owner only | Segment `layout.tsx` redirects non-owners before client UI loads; corresponding write APIs are owner-only except `PATCH /api/admin/kbs/[kbId]` which also lets **Admin** toggle `requireSummary`. `GET /api/admin/kbs` is intentionally editor-reachable but filtered for page creation, and Owner-only user management can assign Editor/Viewer KB access. | `src/app/admin/{settings,kbs,users}/layout.tsx`, `src/app/admin/kbs/page.tsx`, `src/app/admin/users/page.tsx`, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/users/**/route.ts` |
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

> ✅ **The matrix is enforced at the API, list-view, detail-page, and owner-only-page levels.**
> - **Editor KB scoping** — `requireKbAccess` on the redirects `GET`, the staged-import collection
>   `GET` *and* item `GET`/`PATCH`/`DELETE` (resolving `kbId` first); list/detail views scoped via
>   `accessibleKbIds` / `filterKbsForSession` / `canAccessKb(...) → notFound()`. `GET /api/admin/kbs`
>   returns the editor's assigned KBs so page creation works.
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
  page's section — see §8), and top-level sourced (a snapshot imported from an
  approved external site with provenance metadata — see §8).
- A KB can optionally point `homepagePageId` / `knowledge_bases.home_page_id` at one page in that
  KB. Public `/kb/{kbSlug}` renders that page as the KB landing page when it is visible to the
  current visitor; otherwise it falls back to the generated section list. The homepage page's tree
  link uses `/kb/{kbSlug}` as its canonical URL.
- Pages have a default-on `showPrintButton` / `show_print_button` flag. Public article and
  KB-homepage pages render the browser print-to-PDF affordance only when this flag is not false.
- Pages have optional normalized `tags` / `kb_pages.tags` keywords. The editor stores them as
  page metadata, public article pages render them as search links, and both in-memory and Postgres
  search score them.
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
- **Media picker**: preserves the saved toolbar selection. Images insert as block-level figures at
  the saved cursor/location; document assets or document uploads link selected text when the
  selection is inside one rich-text block, otherwise they insert as file-link blocks. The library tab
  searches title/slug/description/tags and can filter image/file plus used/unused assets.
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
  required metadata (title, responsible office, valid contact email, last-reviewed date; **summary
  when the KB's `requireSummary` is true**, the default), heading-hierarchy skips, tables without a
  header row/column, images missing alt text (unless decorative), references to non-active assets,
  and vague/empty link text. Owner/Admin publish entrypoints must call this gate; Editors submit
  pages for review and cannot publish, schedule publish, approve proposed pages, or restore a
  published revision. New pages default `contactEmail` to the creating editor's signed-in email.

### Assets (`src/lib/kb-store.ts`, `src/lib/asset-lifecycle.ts`)
- Stable public route `/kb/{kbSlug}/files/{assetSlug}` serves the **active version**, so replacing a
  file doesn't break links. Version history + usage tracking included.
- Assets carry optional normalized `tags` / `kb_assets.tags`. The library searches and displays tags,
  plus usage counts/page names from `kb_asset_usages`, so unused assets are visible before cleanup.
- Archive = hidden, not deleted. Owners/Admins can permanently delete archived assets only when no
  page references them. Editors can archive but not permanently delete.
- **Video** assets are external links with dedicated columns (`video_provider`, `video_external_id`,
  `video_url`); the file route 307-redirects to the canonical URL (`videoDeliveryUrl` in
  `src/lib/video.ts`) rather than streaming bytes. The *public page* `video` block renders a
  YouTube/Vimeo `<iframe>` embed (`src/components/PageBlocks.tsx`); the CSP `frame-src` explicitly
  allows `youtube.com` / `youtube-nocookie.com` / `player.vimeo.com` so these embeds load.
- Image **alt text** has its own `alt_text` column (separate from the human `description`); the media
  picker pre-fills inserted library images from it. Visible captions are stored separately from alt.

### Search (Postgres FTS, in `kb-store.ts` + migrations)
- `tsvector` columns + GIN indices on `kb_pages` and `kb_assets`, kept fresh by **`BEFORE INSERT OR
  UPDATE` triggers** (`tsvectorupdate` / `tsvectorupdate_assets`, migration `006`, function updated
  through `009`/`015`/`039`/`040`). Pages index title/summary/tags/block-text (via the
  `kb_extract_blocks_text` PL/pgSQL extractor — paragraph/heading/list/table/caption/procedure-section
  text, not raw JSON or notes); assets index title/description/tags/slug. Weights: A (title), B
  (summary/tags/description), C (body/slug).
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
  - **AI Prompt** — site defaults for **Draft with AI** (`aiSummaryPrompt`) and **Review with AI**
    page checks (`aiPagePrompt`). Blank uses built-in defaults. Each knowledge base may override both
    prompts (KB → site → built-in). Page review returns structured suggestions (prose/alt/etc.) that
    editors accept or dismiss in the page editor; cleaned summary drafts remain capped at 2,500
    characters.
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
  (tracked in `_schema_migrations`); `ensureSchema()` runs migrations → seeds (if empty) →
  app-side backfills.
- **Current head: `040_asset_tags`.** Notable recent migrations: page-tree node kinds (`032`),
  per-KB summary requirement (`033`), scheduled publish (`034`), reader feedback (`035`),
  persisted asset-usage index (`036`), site AI summary prompt (`037`), site + per-KB AI summary/page
  prompts (`038`), page tags/tag-aware FTS (`039`), and asset tags/tag-aware FTS (`040`). Earlier migrations cover FTS,
  edit locks, revisions, page views, KB visibility, search widget, branding, and rate limits — see
  `src/lib/migrations/index.ts` for the full sequence.
- Core tables: `knowledge_bases`, `kb_pages`, `kb_assets`, `kb_asset_versions`, `kb_asset_usages`,
  `kb_redirects`, `kb_staged_imports` (+ media), `users`, `kb_user_assignments`, `site_settings`,
  `kb_audit_log`, `kb_rate_limits`, `kb_page_revisions`, `kb_page_views`, `kb_page_feedback`.
- Seed data: `src/lib/demo-data.ts` (used for both the no-DB in-memory mode and first-run seeding).

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
- `AI_PROVIDER_ENDPOINT` / `AI_API_KEY` / `AI_MODEL` — optional Vercel AI Gateway (OpenAI-compatible
  chat completions) for editor **Draft with AI** summaries and **Review with AI** page suggestions.
  When unset, those routes return 501. Recommended model: `inclusionai/ling-3.0-flash-free`. System
  prompts resolve KB override → site settings (`aiSummaryPrompt` / `aiPagePrompt`) → built-in
  defaults; cleaned summary drafts are capped at 2,500 characters.

**CI** (`.github/workflows/ci.yml`): on pushes to `main` and on PRs, runs type-check, lint, unit
tests, production build, public-page axe smoke tests, and the Chromium editor regression suite against
the in-memory seed dataset. It runs `npm run test:db` **only when a `DATABASE_URL` repo secret is set**
(point it at a dedicated Neon **test** branch — the suite writes/deletes data). The live-DB step sets
`DATABASE_URL` per-step, never job-wide, so the in-memory run never sees a database.

**CI expectation:** keep `main` green on the configured workflow (type-check, lint, unit, build,
axe smoke, Chromium editor regressions; live-DB when `DATABASE_URL` is configured).

**Per-PR live-DB (`.github/workflows/db-pr.yml`):** an opt-in workflow creates a throwaway Neon branch
per pull request, runs `npm run test:db` against it, and deletes it. Every step is gated on `HAS_NEON`,
so without the `NEON_API_KEY` + `NEON_PROJECT_ID` secrets the job is a green no-op. When configured it
supersedes the single shared `DATABASE_URL` secret above. The gated suite (`src/lib/ki1.db.test.ts`)
covers edit-lock conflicts/rollback/expiry, FTS safety + staff prune, the managed-video model, editor
KB scoping (`canAccessKb` / `accessibleKbIds` / `filterKbsForSession` / scoped review dashboard),
manual redirect persistence, and the single-active-version DB invariant.

---

## 8. Conventions & gotchas (read before changing these areas)

- **Admin ↔ public shell is pathname-driven on the client.** Root layout SSR picks `admin-app`
  classes from `x-pathname`, but soft navigations do not re-run that layout. `AdminAppClassSync`
  keeps the classes in sync; `PublicSiteChrome` / `PublicSiteFooter` follow `usePathname()` so the
  public header (including the **Admin** full-load link) appears after leaving `/admin` without a
  reload. Prefer plain `<a>` / `location.assign` when intentionally crossing the boundary (View
  page, View public, top-bar Knowledge bases).
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

**As of 2026-07-26:** the public/private multi-KB platform is on `main` and in active Grad School
content use. CI covers type-check, lint, unit tests, production build, public/private-viewer axe
smoke, authenticated Chromium editor regressions, and live-DB suites when `DATABASE_URL` is set.

**Shipped product surfaces**
- Multi-KB public/private reader: 3-column docs layout, hierarchical page tree (pages, group
  headings, links), depth-controlled TOC, KB homepage pages, home KB filter/pagination,
  previous/next article nav, heading copy-link, print-to-PDF (browser print over semantic HTML).
- Block editor: rich text, alignment, links, media picker, cards, tables, video, info boxes,
  procedure sections, excerpts, P&P sourced blocks, editor notes (inline + margin rail), captions
  vs alt text, continued numbering, draft backup/restore, draft preview, publish readiness panel.
- Optional **Draft with AI** for page summaries and **Review with AI** for style/readability/grammar/
  alt suggestions (Gateway env vars; never auto-saves). System prompts are editable under
  **Admin → Settings → AI Prompt**, with per-KB overrides on the knowledge base edit form
  (resolution: KB → site → built-in). Cleaned summary drafts are capped at 2,500 characters.
- Managed assets: stable URLs, versions, tags, usage index with used/unused library visibility,
  direct-to-Blob large uploads when configured, responsive `?w=` / `srcset` image variants,
  private/staff-aware delivery, archive-first delete.
- Search: Postgres FTS (global + per-KB), tag/keyword scoring, visibility prune, search widget with
  live suggestions.
- Governance: publish gate, owner/admin publish approval, proposed-edits workflow, review dashboard
  (feedback + propose actions), content health dashboard, revision history with side-by-side
  compare/restore, trash, audit log, weekly review digest cron, reader "Was this helpful?" feedback.
- Auth & admin: Owner/Admin/Editor/Viewer, per-KB scoping, edit locks, site settings/branding,
  KB starter templates, cross-KB copy/move, DOCX import, redirects, KaaS read API, owner KB ZIP
  export, usage analytics.

**Before a production-compliance / a11y claim**
- Complete the manual release gate in `docs/release-gate.md` (§12 FB-25): Chrome + Firefox +
  mobile-width editor pass and a WCAG 2.1 AA sample audit. Optional local/CI Firefox + mobile
  Playwright: `EDITOR_CROSS_BROWSER=1`.
- Complete §13 release sign-off (deploy / cron / post-deploy + IA/search/redirects).

**Known caveats (shipped, with honest limits)**
- Print/PDF is browser print-to-PDF, not a server-side tagged PDF generator.
- Accessibility is publish-gate + axe smoke, not a completed WCAG certification.
- Notes rail has no threaded resolve UI yet.
- Editor framework migration (custom `contentEditable` → Lexical/ProseMirror) is planned, not started.
  Phase 0 Lexical spike is available at `/admin/lexical-spike`; Phase 1 flow-surface swap is next.

## 10. Known limitations

- **Accessibility coverage is gate + smoke, not a full WCAG 2.1 AA audit** (§1, §9). Do not describe
  the product as ADA/WCAG certified until a manual audit passes. Public article tables now emit
  `scope="col"` / `scope="row"` on header cells, but this does not replace the manual audit.
- **Private KB reads are intentionally dynamic and auth-gated.** Do not add static caching,
  public redirects, sitemap exposure, or "sign in to view" affordances for private KB
  landing/article/search/asset URLs. Unauthorized private content returns `notFound()` so KB
  existence is not distinguishable, and authorized private asset responses use
  `Cache-Control: private, no-store`. Cross-KB **moves into a private KB therefore do not write**
  a public redirect at the old URL (a `Location: /kb/{private-slug}/…` would disclose the private
  KB). Old public bookmarks for a page moved into a private KB will 404 / soft-404 instead.
- **Cross-KB copy/move remints block ids and rewrites absolute `/kb/{source-slug}/…` body
  links** to the destination slug. `relatedAssetIds` are preserved; assets remain on their home KB
  and the file route still gates on that home KB's read access, so a reader of the destination KB who
  cannot read the source KB may still see broken images/files.
- **Not-found page responses carry HTTP 200, by framework design.** Page routes stream behind the
  root `loading.tsx` boundary, so the status code is committed before authorization or existence
  checks run; the 404 boundary UI then streams into a 200 response. This applies identically to
  nonexistent, private, and draft KB URLs (verified parity — no existence signal) and predates
  Phase 1. Asset delivery is a route handler and returns genuine 404/status codes.
  `generateMetadata` on KB landing/article/search routes also calls `notFound()` so gated pages
  never emit real titles/descriptions, but empirical probes (common bot user agents against a
  production server) still received HTTP 200 with the not-found UI — do not claim crawler-visible
  404s. Status-code fidelity for streamed `notFound()` routes remains a known framework limit.
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
- **Revision history is per-save snapshots with optional side-by-side compare:** every page
  create and save writes a full `kb_page_revisions` snapshot; editors can view/restore any of the
  newest 50 per page and compare two revisions as a plain-text line diff from the History panel.
  There is no field-level restore, and retention is a hard 50/page cap (older revisions are purged by
  the daily cron). Restore is itself a new save, so history is never rewritten.
- Rate limiting falls back to in-memory only when `DATABASE_URL` is unset; production Neon mode uses a
  shared `kb_rate_limits` table.
- Review digest email delivery is pluggable HTTP-provider only today; when unconfigured, the weekly
  cron logs structured JSON and returns a non-error skipped-delivery result. Recipients come from
  managed DB users; a bootstrap env owner alone does not receive digest email.
- Usage analytics are aggregate counts only; they intentionally store no cookies, IP addresses, or user
  agents, can include bot/crawler traffic, and are skipped entirely in in-memory mode.
- Content health is an admin maintenance dashboard over existing page metadata and audit logs. It is
  not a crawler or automated content-quality scorer; it reports stale review dates, missing tags,
  missing governance fields, proposed pages, and logged zero-result search queries.

---

## 11. Future work (overview)

The only **product** items that remain future (not yet built) are:

1. **Editor framework migration (§12 FB-09 / FB-29)** — replace custom `contentEditable` flow
   surfaces with Lexical (preferred) or ProseMirror behind the existing `ContentBlock`
   serialization boundary. Plan: `docs/editor-framework-migration.md`. Dedicated effort — do not
   mix into unrelated feature work.
2. **WSU SSO (§12 FB-30)** — Entra ID / Azure AD OIDC or SAML for staff and private-KB viewers,
   gated on WSU ITS engagement. Local owner-provisioned accounts remain interim + break-glass.
3. **Confluence import/export bridge (§12 FB-37)** — concept only; not scoped.

**Release readiness** (FB-25) is ops/QA, not a new product surface: finish the manual checklist in
`docs/release-gate.md` and §13 sign-off.

Do not add new open FB items without maintainer ratification; fold polish into shipped features.

## 12. Future build — open backlog

Machine-readable tags for agents. Only **open** / **in-progress** work lives here. Completed FB
items were removed from this document; their history is in git.

```
[AI-AGENT-TASK] id:FB-NN  priority:high|med|low  area:<topic>  effort:S|M|L  status:open|in-progress|done|deferred|wontfix
```

- Grep: `grep -n "AI-AGENT-TASK" project_spec.md`
- Before coding: read *Touch points* and honor §8 gotchas.
- Definition of done: satisfy *Acceptance*; keep `npm run check` + `npm test` green; extend
  live-DB tests when DB behavior changes.
- When completing an item: flip `status:` and leave a one-line DONE note, or remove the item and
  update §9 / §11 so the future set stays accurate.
- **Ratified future set:** FB-09/FB-29, FB-30, FB-37. FB-25 is release QA only.

---

### FB-09 / FB-29 — Editor framework migration

`[AI-AGENT-TASK] id:FB-09  priority:high  area:editor-architecture  effort:L  status:open`
`[AI-AGENT-TASK] id:FB-29  priority:high  area:editor-architecture  effort:L  status:open`

- **Plan:** `docs/editor-framework-migration.md` (phases 0–4). Status stays open until Phase 0 spike
  is accepted.
- **Why:** the custom `contentEditable` editor still needs release-grade QA and recurring
  browser-specific fixes; migrating flow surfaces to Lexical (preferred) or ProseMirror is the
  structural fix. Keep the existing `ContentBlock[]` storage model, sanitizer, publish gate,
  source-HTML path, and public render.
- **Touch points:** `src/components/PageDocumentEditor.tsx`, `src/components/RichTextEditable.tsx`,
  `src/lib/page-document.ts`, `src/lib/page-editor-format.ts`, `src/lib/rich-text.ts`,
  `tests/editor/`, `docs/editor-framework-migration.md`.
- **Acceptance:** page-document round-trip tests pass unchanged; Chromium editor regressions pass;
  a documented Chrome + Firefox manual checklist covers selection, paste, list nesting, link/note
  insert, table-cell editing, undo/redo, and source-mode round-trips. Do not mix this migration into
  unrelated feature PRs.

### FB-25 — Production release gate (manual QA)

`[AI-AGENT-TASK] id:FB-25  priority:high  area:qa-a11y-release  effort:M  status:in-progress`

- **Already automated:** CI runs type-check, lint, unit, build, `test:a11y`, and Chromium
  `test:editor`. Firefox + mobile-width Playwright projects exist locally / when
  `EDITOR_CROSS_BROWSER=1`.
- **Still open:** signed manual pass in `docs/release-gate.md` — Chrome + Firefox + ~375px editor
  workflows, plus a WCAG 2.1 AA sample audit of representative public and admin surfaces.
- **Acceptance:** checklist in `docs/release-gate.md` is completed and recorded; product claims
  match gate + smoke coverage honestly until then (see §10).

#### Manual release gate (summary)

Full checklist: `docs/release-gate.md`. Minimum before a compliance claim:

- [ ] CI green: `check`, `lint`, `test`, `build`, `test:a11y`, `test:editor` (+ `test:db` when
      migrations/DB behavior change)
- [ ] Editor smoke on Chrome, Firefox, and narrow width (lists, info box, table cell, image alt,
      paste, excerpts/sourced, unsaved guard, publish gate)
- [ ] Keyboard / focus / landmarks / contrast / zoom sample pass on public + admin surfaces

### FB-30 — WSU SSO integration

`[AI-AGENT-TASK] id:FB-30  priority:med  area:auth  effort:L  status:open`

- **Blocked on:** WSU ITS engagement (app registration, OIDC vs SAML, claims/groups, break-glass).
- **Approach:** Entra ID / Azure AD OIDC (preferred) or SAML for staff and private-KB viewers.
  Keep local owner-provisioned accounts as interim + break-glass. Map SSO subjects onto existing
  `users` / `kb_user_assignments` by verified email.
- **Touch points:** `src/lib/auth.ts`, `src/lib/security.ts`, `src/app/admin/sign-in/page.tsx`,
  session cookies, user provisioning, `.env.example`, this spec.
- **Acceptance:** approved WSU SSO users sign in, map to roles, retain KB scoping; local fallback
  documented for IdP outages.

### FB-37 — Confluence import/export bridge (concept)

`[AI-AGENT-TASK] id:FB-37  priority:low  area:migration  effort:L  status:open`

- **Concept only — not scoped.** Complements DOCX staged import and owner KB ZIP export.
- **Possible directions:** import a Confluence space HTML/attachments archive through a staged
  review flow; export a Confluence-ingestible archive from a KB.
- **Open before scoping:** macro fidelity on import; export target format; reuse `/admin/import`
  vs a new surface.
- **Acceptance:** undefined until a scoping pass (import-only vs both directions + UX).

---

## 13. Operations runbook


### Deploy Checklist

- Confirm `npm run check`, `npm run lint`, `npm test`, and `npm run build` pass locally or in CI.
- Confirm `npm run test:db` passes against the current Neon test branch before promoting changes that touch migrations or DB behavior.
- Confirm Vercel has `DATABASE_URL`, `KB_ADMIN_EMAIL`, `KB_ADMIN_PASSWORD`, `KB_ADMIN_SESSION_SECRET`, and `CRON_SECRET` configured for the target environment.
- If AI draft summaries are expected in the editor, confirm `AI_PROVIDER_ENDPOINT`, `AI_API_KEY`, and `AI_MODEL`.
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

- Cron routes require `Authorization: Bearer $CRON_SECRET` (shared helper `isCronAuthorized` in
  `src/lib/cron-auth.ts`).
- Manual probe examples (replace host + secret):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/admin/cron/audit-cleanup
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/admin/cron/revision-cleanup
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/admin/cron/review-digest
curl -sS https://YOUR_HOST/api/health
```

- Rotate `CRON_SECRET` by updating Vercel environment variables, redeploying, and confirming the scheduled routes still authorize.
- Treat missing email/provider configuration as non-fatal unless the specific cron route documents otherwise.
- `/api/admin/cron/review-digest` sends weekly review-date digests when an email provider is configured; without one it logs recipients/subjects as structured JSON and reports skipped deliveries.
- `/api/admin/cron/audit-cleanup` also folds page-view rows older than 90 days into monthly totals.

### Post-Deploy Checks

- Probe `GET /api/health` — expect `{ "ok": true }` (no auth).
- Confirm schema head applied: `SELECT id FROM _schema_migrations ORDER BY id DESC LIMIT 5;`
  should include `040_asset_tags` (and earlier ids such as `029_kb_visibility`). Existing public
  KBs should show `visibility = 'public'` via
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
- `/admin/review` → **Check sourced content** runs without error (lists only changed/missing/unreachable P&P sources).
- Logs are structured JSON and suitable for forwarding through Vercel log drains.

### Release sign-off

Before calling a build production-ready for Grad School go-live (Confluence interop optional):

1. Complete the **Manual release gate** (`docs/release-gate.md` / §12 FB-25).
2. Complete this section’s Deploy / Cron / Post-Deploy checks.
3. Content IA: prefer a KB homepage page for editorial landings; generated landings use the page tree only (no duplicate section cards). Enable the KB search widget where readers need it; add redirects for retired URLs.
4. Confirm Print / Save as PDF is understood as **browser print-to-PDF**, not a tagged PDF generator.

---

## 14. Historical notes

Phase 1 private knowledge bases shipped 2026-07-14 (PR #11). Earlier FB backlog write-ups
and the Phase 1 step plan were removed from this document once delivered; recover them from
git history if needed. Prefer updating §9 / §11 / §12 over appending long audit trails here.

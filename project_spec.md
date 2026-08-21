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
Postgres full-text search with an optional search widget; Owner/Admin/Manager/Editor/Viewer auth with
per-KB scoping; configurable KB homepage pages; per-KB theming, global default theme, and owner
site settings; DOCX staged import; automatic redirects; edit locks; page tags/keywords;
publish-time accessibility / governance gate; owner/admin/KB-manager publish approval; audit log; revision
history with compare/restore; proposed-edits workflow; review dashboard (including reader feedback);
content health dashboard; trash for archived pages; KB starter templates; home KB filter; optional
AI draft summaries in the page editor; print-to-PDF (browser print over semantic HTML); KaaS read +
limited-write API; sitemap/robots/OG for public pages. Private KBs use KB-level
`public`/`private` visibility, owner-provisioned local-password `viewer` accounts,
`kb_user_assignments` for viewer/editor access, read gating on every public surface, and
visibility-aware asset delivery/search.

**Content reuse (built):** cross-page excerpt blocks (live "Included from" callouts) and P&P
sourced-content snapshots (allowlisted external import with check-for-changes / refresh).

**Release readiness (ops, not a product feature):** complete the manual release gate
(`docs/release-gate.md`, §12 FB-25) and §13 sign-off before claiming production WCAG/compliance.

**Remaining work** (see §11 / §12): only the manual release gate (FB-25). The 2026-07
hardening backlog (FB-38–FB-44) shipped on 2026-08-01.

**Out of scope (decided, not deferred):** **WSU SSO** and a **Confluence import/export bridge**
were both evaluated and dropped by the maintainer on 2026-08-01. Authentication stays local and
owner-provisioned; DOCX staged import plus owner KB ZIP export remain the migration path. If a
Confluence bridge is revived later, use the FB-37 revival notes in §12 rather than treating it as
approved backlog.

**Out of scope (intentionally, for now):** self-service public signup (accounts are Owner-provisioned);
WYSIWYG parity with Word; real-time multi-cursor co-editing (concurrency uses locks, not CRDTs).

## 3. Users & roles

- **Anonymous public** — no login; reads published pages in public KBs only.
- **Owner** — full access (KB-wide), plus user management, KB creation, theming, site settings.
- **Admin** — KB-wide content/asset management.
- **Manager** — KB-scoped like Editor, but may publish and approve proposed pages in assigned KBs.
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

**Authorization matrix** (Owner/Admin are KB-wide; Manager/Editor are limited to assigned KBs for
mutations; Viewer is read-only):

| Area | Owner | Admin | Manager | Editor | Viewer | Scope mechanism |
|------|-------|-------|---------|--------|--------|-----------------|
| Public/private KB read | all | all | published public + assigned (incl. assigned drafts) | published public + assigned (incl. assigned drafts) | published public + assigned published private | `getKbReadAccess` / `filterKbsForReadAccess` (KB status enforced) |
| Pages list/edit/submit | all | all | assigned | assigned | no | `filterKbsForSession` + `requireKbAccess` |
| Publish/approve pages | all | all | assigned | no | no | `canPublishInKb` / `canApproveProposedInKb` + `requireKbAccess` |
| KB homepage assignment | all | all | assigned | assigned | no | `requireKbAccess` |
| Assets list/edit | all | all | assigned | assigned | no | `filterKbsForSession` + `requireKbAccess` |
| Imports (list/detail/edit/delete) | all | all | assigned | assigned | no | `requireKbAccess` |
| Redirects (read/create/delete) | all | all | assigned | assigned | no | `requireKbAccess` |
| Review dashboard | all | all | assigned | assigned | no | `filterKbsForSession` |
| Users / KB management | yes | no | no | no | no | owner-only |
| Site settings | yes | no | no | no | no | owner-only |
| Audit log | yes | yes | no | no | no | owner/admin-only |

**Authorization enforcement contract** (keep this table current when routes move or new admin
surfaces are added):

| Surface | Allowed roles | KB scoping / role gate | Implementation files |
|---------|---------------|------------------------|----------------------|
| `/admin` | Owner/Admin/Manager/Editor | Signed-in non-viewer session only; navigation hides owner/admin-only links but is not the authorization boundary. Viewers redirect to `/` before the admin shell renders. | `src/app/admin/layout.tsx`, `src/app/admin/page.tsx` |
| `/admin/pages`, `/admin/pages/new` | Owner/Admin/all assigned Managers/Editors | The pages list is scoped to one KB via `?kb=` (slug; id also accepted and normalized) using `KbScopePicker` + `filterKbsForSession`; the new-page dropdown calls filtered `GET /api/admin/kbs`; writes must still pass API `requireKbAccess`. | `src/app/admin/pages/page.tsx`, `src/components/AdminPagesWorkspace.tsx`, `src/app/admin/pages/new/page.tsx`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/pages/route.ts` |
| `/admin/pages/[pageId]` | Owner/Admin/assigned Manager/Editor | Detail page resolves the page's KB and calls `canAccessKb(...)`; failed access returns `notFound()`. | `src/app/admin/pages/[pageId]/page.tsx` |
| Page mutation APIs | Owner/Admin/assigned Manager/Editor, except editors cannot publish/schedule/approve and restore-published/permanent-delete remain Owner/Admin only | `PATCH`, status, layout, lock, create, and relocate routes use `requireAdminMutation` plus `requireKbAccess` (relocate requires access to **both** source and destination KBs); publish, schedule-publish writes, and approving proposed pages also allow assigned Managers through `canPublishInKb` / `canApproveProposedInKb`; restoring published revisions and permanent delete still check owner/admin. | `src/app/api/admin/pages/**/route.ts`, `src/lib/kb-store.ts` (`relocatePage`) |
| KB homepage API | Owner/Admin/assigned Manager/Editor | Sets or clears `knowledge_bases.home_page_id`; route uses `requireAdminMutation` plus `requireKbAccess(kbId)`. | `src/app/api/admin/kbs/[kbId]/homepage/route.ts` |
| `/admin/assets` and asset picker API | Owner/Admin/assigned Manager/Editor | UI lists use `filterKbsForSession`; picker `GET /api/admin/assets` requires a session and `requireKbAccess(kbId)`. | `src/app/admin/assets/page.tsx`, `src/app/api/admin/assets/route.ts` |
| `/admin/assets/[assetId]` | Owner/Admin/assigned Manager/Editor | Detail page resolves the asset's home KB and calls `canAccessKb(...)`; failed access returns `notFound()`. | `src/app/admin/assets/[assetId]/page.tsx` |
| Asset mutation APIs | Owner/Admin/assigned Manager/Editor, except permanent delete Owner/Admin only | Upload/metadata/status/replace/activate routes use `requireAdminMutation` plus `requireKbAccess`; permanent delete also checks owner/admin. | `src/app/api/admin/assets/**/route.ts` |
| `/admin/import` and staged import APIs | Owner/Admin/assigned Manager/Editor | Import list page uses `accessibleKbIds`; collection/item/stage/commit APIs use `requireKbAccess` after resolving or receiving `kbId`. | `src/app/admin/import/page.tsx`, `src/app/admin/import/[stagedImportId]/page.tsx`, `src/app/api/admin/import/**/route.ts` |
| `/admin/redirects` and redirect APIs | Owner/Admin/assigned Manager/Editor | UI lists use `filterKbsForSession`; API routes use `requireKbAccess` on the target/resolved KB. | `src/app/admin/redirects/page.tsx`, `src/app/api/admin/redirects/**/route.ts` |
| `/admin/review` | Owner/Admin/assigned Manager/Editor | Dashboard data is called with `accessibleKbIds(session)`; owner/admin pass `null` for all KBs. | `src/app/admin/review/page.tsx`, `src/lib/admin-review.ts` |
| `/admin/health` | Owner/Admin/assigned Manager/Editor | Content-health data is called with `accessibleKbIds(session)`; owner/admin pass `null` for all KBs. Viewers redirect to `/`. | `src/app/admin/health/page.tsx`, `src/lib/content-health.ts` |
| `/admin/usage` | Owner/Admin/assigned Manager/Editor | Usage analytics are server-rendered from `getUsageAnalyticsForSession(session)` and `getAiUsageAnalyticsForSession(session)`, which scope through `accessibleKbIds(session)`; Viewers redirect to `/`. | `src/app/admin/usage/page.tsx`, `src/lib/page-views.ts`, `src/lib/ai-usage.ts` |
| `/admin/audit` | Owner/Admin only | Server page redirects Editors to `/admin`; audit API surface is not editor-reachable. | `src/app/admin/audit/page.tsx` |
| `/admin/settings`, `/admin/kbs`, `/admin/users` | Owner only | Segment `layout.tsx` redirects non-owners before client UI loads; corresponding write APIs are owner-only except `PATCH /api/admin/kbs/[kbId]` which also lets **Admin** toggle `requireSummary`. `GET /api/admin/kbs` is intentionally manager/editor-reachable but filtered for page creation, and Owner-only user management can assign Manager/Editor/Viewer KB access. | `src/app/admin/{settings,kbs,users}/layout.tsx`, `src/app/admin/kbs/page.tsx`, `src/app/admin/users/page.tsx`, `src/app/api/admin/settings/route.ts`, `src/app/api/admin/kbs/route.ts`, `src/app/api/admin/users/**/route.ts` |
| `/admin/kbs/[kbId]/styles` and KB theme APIs | Owner only | Server page and theme API both require `session.role === "owner"`. | `src/app/admin/kbs/[kbId]/styles/page.tsx`, `src/app/api/admin/kbs/[kbId]/theme/route.ts` |
| Excerpt picker + preview APIs | Owner/Admin/Manager/Editor (viewers rejected) | `GET /api/admin/excerpt-sources` filters KBs/pages/headings by the caller's read access (`filterKbsForReadAccess` / `getReadableExcerptSourcePageForPicker` — staff-ancestor rules included); `POST /api/admin/excerpt-preview` resolves refs with the caller's session via `resolveExcerptForRead`. Both use `requireAdminMutation`. | `src/app/api/admin/excerpt-sources/route.ts`, `src/app/api/admin/excerpt-preview/route.ts`, `src/lib/excerpts.ts` |
| Sourced-content import/check APIs | Owner/Admin/Manager/Editor (viewers rejected) | `POST /api/admin/sourced-content` and `…/check` use `requireAdminMutation`; outbound fetches are gated by `parseAllowedSourceUrl` (https + host allowlist) — no KB scoping needed, no KB data is read. | `src/app/api/admin/sourced-content/route.ts`, `src/app/api/admin/sourced-content/check/route.ts`, `src/lib/sourced-content.ts` |
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
>   returns the manager/editor's assigned KBs so page creation works.
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
- The editor groups blocks into **sections**; a run of inline text blocks renders as one
  `contentEditable` "flow" surface, round-tripped through `page-document.ts` on input/blur. Images,
  section dividers, tables, procedure sections, cards, videos, and asset links are their own section editors.
- **HTML source mode** is not just a view toggle: textarea edits are parsed through
  `documentHtmlToBlocks` as the user types so Save/Preview use the source draft even if the editor
  never switches back to Visual. Switching back to Visual re-parses the same draft and rebuilds the
  section list.
- Toolbar formatting, links, alt text, and editor notes live in `src/lib/page-editor-format.ts`
  (selection save/restore + `document.execCommand`, plus DOM helpers). Selection plumbing is in
  `src/lib/rich-text-selection.ts`.
- Table cells use `LexicalTableCellSurface` (nested Lexical); on focus they bind themselves as the active editor surface so
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
  keyboard-shortcuts popover, "Starts at" ordered-list control, and a **Continue *n*** button that
  appears when the caret is in a numbered list with an earlier list to continue — it renumbers
  across an intervening image or other block, which the sibling-only auto-continue cannot see.
  Both write through `ListNode.setStart` so the value survives the save (see §8). Nested `<ol>`s stay semantic ordered
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
    Two further groups sit alongside it: **List numbers & bullets** (`listMarkers` — colour, size in
    `em`, weight, applied to `::marker` on both the public page and the editor surface; an empty
    colour inherits the item's text) and **Navigation depth** (`pageTreeMaxDepth` — deepest tree
    level shown to readers; `pageTreeExpandDepth` — how many levels start open when the tree is
    collapsible; `tocDepth` — the KB's default "On this page" depth, used by pages whose own
    `tocDepth` is 0).
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
- Previous/next links at the foot of an article are **off by default** and opt-in per KB
  (`showPageNav`): they imply a linear reading order a reference KB does not have.
- The left page tree renders to `pageTreeMaxDepth` and, when `pageTreeCollapsible` is on, opens to
  `pageTreeExpandDepth` plus the current page's own chain. With `pageTreeCollapsible` off there are
  no chevrons and every branch renders open — that is the "always expanded" mode, not a restricted
  one, which the label does not make obvious.

### Page tree editing (`/admin/pages`, `src/components/AdminPageTreeManager.tsx`)
- The tree editor reorders and re-parents pages, group headings, and links, then commits the whole
  intended arrangement in one `PATCH /api/admin/pages/layout` batch (see the §8 gotcha about
  validating that batch against the layout it *produces*).
- Two re-parenting controls, deliberately: **Indent/Outdent** for one-level nudges relative to the
  previous sibling, and **Move under…** for "put this under X" regardless of sibling position.
  Indent alone cannot express the latter and is disabled for an only child, so Move under… is the
  general control — and the only way to re-parent a group heading, since `/admin/pages/[pageId]`
  routes `group`/`link` nodes to `TreeNodeSettingsForm`, which has no parent selector.
- Nesting depth is not capped anywhere in the model, the admin tree, or the reader tree; only
  `pageTreeMaxDepth` limits what readers are shown.

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
- **Current head: `047_kb_show_page_nav`.** Notable recent migrations: page-tree node
  kinds (`032`), per-KB summary requirement (`033`), scheduled publish (`034`), reader feedback
  (`035`), persisted asset-usage index (`036`), site AI summary prompt (`037`), site + per-KB AI
  summary/page prompts (`038`), page tags/tag-aware FTS (`039`), asset tags/tag-aware FTS (`040`),
  platform features (`041`), curated next-step copy (`042`), per-user server drafts (`043`), AI token metering (`044`), the server-draft base marker added then removed (`045`, `046`), and the per-KB previous/next opt-in (`047`).
  Earlier migrations cover FTS, edit locks, revisions, page views, KB visibility, search widget,
  branding, and rate limits — see
  `src/lib/migrations/index.ts` for the full sequence.
- Core tables: `knowledge_bases`, `kb_pages`, `kb_assets`, `kb_asset_versions`, `kb_asset_usages`,
  `kb_redirects`, `kb_staged_imports` (+ media), `users`, `kb_user_assignments`, `site_settings`,
  `webhooks`, `page_server_drafts`, `kb_audit_log`, `kb_rate_limits`, `kb_page_revisions`,
  `kb_page_views`, `kb_page_feedback`, `kb_ai_usage`.
- Seed data: `src/lib/demo-data.ts` (used for both the no-DB in-memory mode and first-run seeding).

## 7. Running, testing, CI

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run check      # tsc --noEmit
npm test           # Vitest unit suite (in-memory; live-DB tests self-skip)
npm run test:a11y  # Playwright + axe smoke tests (builds + starts a prod server on :3100)
npm run test:editor # Playwright editor regression suite (builds + starts prod server on :3101)
npm run test:db    # live-DB integration suite against DATABASE_URL (reads .env.local)
```

**Editor Playwright suite (`npm run test:editor`, `tests/editor/`)** covers the authenticated
admin page editor. It must run against a **production server** (`next build` + `next start`),
which the Playwright config starts automatically on port **3101**: the per-request CSP in
`src/proxy.ts` (nonce + `strict-dynamic`) does not hydrate the editor's client handlers under the
`next dev` HMR/eval runtime, so `next dev` leaves the contentEditable surfaces non-interactive.
The config injects bootstrap admin env vars and an empty `DATABASE_URL`, so the suite is hermetic
(in-memory seed dataset, no external database). Both Playwright suites use dedicated ports and
`reuseExistingServer: false` — see the §8 gotcha; a dev server on :3000 must never be reused. A one-time sign-in (`auth.setup.ts`) posts to
`/api/admin/session` and shares the cookie via `storageState`; it runs single-worker because tests
share the page lock and the process-global in-memory store.

**Environment** (`.env.local`; see `.env.example`):
- `KB_ADMIN_EMAIL` / `KB_ADMIN_PASSWORD` / `KB_ADMIN_SESSION_SECRET` — bootstrap owner + cookie
  signing (aliases `BOOTSTRAP_OWNER_*` also accepted). Required in production: the app throws
  rather than deriving a signing key from the credentials. Rotating the secret signs everyone out.
- `APP_PUBLIC_HOST` — optional. Comma-separated public hostname(s) the admin same-origin check
  trusts, so a spoofed `x-forwarded-host` cannot define the compared origin. Unset is the
  default and is correct wherever the hostname varies per deployment (previews, local dev);
  the check then compares against the request's own host headers. Set it only where every
  hostname is known — an omitted host 403s sign-in and every admin mutation.
- `DATABASE_URL` — Neon connection string. **Unset = in-memory seed mode** (fine for quick local UI
  work; not durable). Set = Neon (schema auto-creates/seeds). Two Vercel-managed Neon projects
  back this app: **kb-local-test** (`solitary-smoke-86654244`) for local/Development and
  **neon-crimson-battery** (`withered-dust-89775495`) for Production. `npm run test:db` writes and
  deletes against whatever `DATABASE_URL` names, so confirm the endpoint host before running it.
  Identify the target by endpoint host, not by its contents.
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob; without it, DOCX import skips images and uploads fall back
  to data-backed assets.
- `CRON_SECRET` — bearer token Vercel Cron sends to `/api/admin/cron/audit-cleanup`,
  `/api/admin/cron/revision-cleanup`, `/api/admin/cron/review-digest`,
  `/api/admin/cron/review-overdue`, `/api/admin/cron/sourced-staleness`, and
  `/api/admin/cron/scheduled-publish`.
- `EMAIL_PROVIDER_URL` / `EMAIL_PROVIDER_TOKEN` / `EMAIL_FROM` — optional HTTP email provider for the
  weekly review-date digest; when unset the digest cron logs structured JSON and reports skipped
  deliveries instead of failing.
- `SOURCED_CONTENT_ALLOWED_HOSTS` — optional comma-separated https hosts the "P&P source" import
  may fetch from; defaults to `gradschool.wsu.edu` when unset.
- `AI_PROVIDER_ENDPOINT` / `AI_API_KEY` / `AI_MODEL` — optional Vercel AI Gateway (OpenAI-compatible
  chat completions) for editor **Draft with AI** summaries and **Review with AI** page suggestions.
  When unset, those routes return 501. Recommended model: `inclusionai/ling-3.0-flash-free`. System
  prompts resolve KB override → site settings (`aiSummaryPrompt` / `aiPagePrompt`) → built-in
  defaults; cleaned summary drafts are capped at 2,500 characters. Successful calls upsert daily
  aggregates into `kb_ai_usage` (calls + prompt/completion/total tokens by feature, model, and KB)
  and surface on `/admin/usage`.

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
- **The sanitizer normalizes emphasis; don't re-add `<b>`/`<i>` on the way out.**
  `sanitizeRichText` rewrites `b`→`strong` and `i`→`em`, and drops an emphasis tag nested
  inside the same emphasis. Both tags stay in `ALLOWED_TAGS` because they arrive constantly
  (`document.execCommand("bold")` emits `<b>`, as does pasted Word HTML) — the normalization
  happens at serialization. Before this, a run formatted through both the execCommand path and
  Lexical saved as `<b><strong>text</strong></b>`, and every save handed it back, so
  `style/style.md`'s "use `<strong>`, never `<b>`" rule could not be honoured through the UI.
  Because the public renderer shares the sanitizer, stored content is normalized at render
  time — no content migration is needed.
- **`getDataset()` in `kb-store.ts` is wrapped in React `cache()`.** Within a request it memoizes;
  raw SQL writes won't be reflected by a cached read in the same request. Tests that need the real
  write path use the lower-level `db.ts` functions directly.
- **`@next/env` skips `.env.local` when `NODE_ENV=test`.** The DB test setup
  (`vitest.db.setup.ts`) parses `.env.local` manually for that reason.
- **In-memory vs Neon**: everything works without a DB via the seed dataset, but locks, FTS, users,
  assignments, theming persistence, audit log, and site settings only do something real with
  `DATABASE_URL`.
- **Each editor surface binds itself once, from its own `registerRootListener`.**
  `LexicalFlowSurface` / `LexicalTableCellSurface` call `bindPageEditor(root, emit)` there;
  `PageDocumentEditor` no longer owns that binding. Re-binding on every render thrashes
  selection/caret, so keep those effects keyed on `editor` alone and callbacks behind refs — see
  the toolbar-ownership entry below for what happens when they are not.
- **The Tab path reads two selection sources; keep them in sync.** `handleEditorTabKey` decides
  whether to act from `window.getSelection()` (via `listItemFromSelection`), then `applyIndent`
  delegates to `lexicalIndent()`, which acts on **Lexical's own selection**. Lexical syncs from
  the DOM on its next frame, so anything that moves the caret and immediately sends a key can
  indent the previously-selected item. Real editing never hits it (a human click-to-key gap is
  ~100ms against a ~16ms window), but automation does — it made
  `tests/editor/list-nesting.spec.ts` flaky on CI for four merges. If you add another path that
  reads one selection to gate and the other to act, expect the same class of bug.
- **Any rich-text sub-editor must bind the shared toolbar target.** Flow, card, procedure, and table
  cell surfaces all route through `bindPageEditor` / `rich-text-selection.ts`. Saving a range without
  binding the active surface makes toolbar commands fail because the selection is treated as outside
  the editor.
- **`tocDepth: 0` means "inherit the KB default", and is the default for new pages.**
  The per-page value used to be 2 or 3 with no way to change a whole KB at once. The public
  routes resolve `page.tocDepth > 0 ? page.tocDepth : effectiveTheme.layout.tocDepth` before
  calling `buildToc`/`hasTocEntries` — passing 0 straight through yields an empty TOC, so
  resolve it at every new call site. Pages saved before this keep their explicit 2 or 3.
- **An empty string is a real value in `listMarkers.color`** (inherit the list item's own
  colour), so `mergeTheme` must distinguish "absent" from "empty" — reading an absent key as
  a malformed colour turned the default into black. `::marker` accepts only a small set of
  properties (colour, font, content); the theme exposes exactly those, and the rule is
  applied to `.wysiwyg-surface` as well so the editor matches the published page.
- **A collapsible page tree opens to `pageTreeExpandDepth`, not to one level.**
  `initialExpandedIds` had two gaps that both read as "nested pages are missing from the
  tree", and only bite with `pageTreeCollapsible` on (with it off every branch renders open,
  which is why neither reproduces under the default theme):
  (1) a node was expanded only when the current page sat *below* it, so standing on a parent
  left its own children collapsed — exactly where you look to confirm a page was nested;
  (2) when no current page matched — which is every visit to the generated KB landing page,
  since it passes no `currentPageId` — the fallback iterated the **top-level nodes only**, so
  anything two levels deep was invisible: the first heading showed and nothing under it.
  Branches now open to `pageTreeExpandDepth` (default: all levels) regardless of the current
  page, and the current page's own chain always opens even when it is deeper than that.
- **`pageTreeMaxDepth` hides deeper branches, it does not collapse them.** It is a reader
  presentation limit only: nothing about the stored hierarchy, the admin tree, or the URLs
  changes, and pages below the cut are still reachable by link and by search.
- **A batch layout save must be validated against the layout it produces, not the one it
  replaces.** `updatePageLayout` receives the whole intended arrangement from the tree
  manager, so a child's new `parentPath` routinely names a location its parent only reaches
  in that same request. Checking each `parentPath` against the *pre-move* page list rejected
  every such batch with "Parent page not found" — an intermittent failure right after
  reorganising, which looked like data corruption rather than a validation order bug.
  Compute all resulting paths first (roots, then propagated descendants), then validate.
  The self/descendant cycle check still runs against the pre-move paths, which is correct.
- **Re-parenting is addressed by page id, not path.** Moving anything rewrites every
  descendant path, so a path held by an already-open editor tab goes stale and its save
  failed. `UpdatePageInput.parentPageId` takes precedence over `parentPath`; the editor
  form tracks the parent by id and derives the path for snapshots. Prefer ids for any new
  cross-page reference.
- **"Indent under the previous page" cannot express "move under X".** It nests a node one
  level under whatever precedes it, and is disabled for an only child — the state right
  after nesting the first page under a heading, which made deeper nesting look impossible.
  The tree manager's "Move under…" dialog is the general control, and the only way to
  re-parent a group heading at all: `/admin/pages/[pageId]` bails early for `group`/`link`
  nodes into `TreeNodeSettingsForm`, which has no parent selector.
- **Drafts are already in the reader tree for signed-in staff; the badge is what was
  missing.** `visiblePages(includeStaff)` admits `draft` and `proposed`, so `PageTree`
  labels them. This never leaks publicly because those statuses never enter an anonymous
  reader's tree. Descendants of an *archived* ancestor are still dropped for everyone
  (`isStaffVisiblePageStatus` excludes archived).
- **A new KB runtime override must be added to BOTH `getDataset` short-circuits.**
  `kb-store.ts` has two fast paths (`mergeRuntimeIntoDataset` and the no-DB `getDataset`)
  that return the untouched seed when every override map is empty — and each one lists the
  maps *by name*. Adding `runtimeKbShowPageNav` without extending those two conditions meant
  the flag was written and then silently ignored on read: the API returned 200 and the public
  page never changed. `applyKbRuntimeOverrides` alone is not enough.
- **A new `knowledge_bases` column has to be added to the hand-written row maps too.**
  `GET /api/admin/kbs` builds its `KnowledgeBase` objects field by field rather than reusing
  `db.ts`'s `mapKb`, so a column added only to `mapKb` reaches the public site but not the
  admin screen — the toggle renders permanently unchecked. Update both.
- **Paste and drop on a Lexical surface go through commands, never a DOM listener.**
  Lexical attaches its own `paste` listener to the editor root and reads the clipboard
  itself. A second listener on that same element cannot suppress it — `preventDefault()`
  does not stop a sibling listener, and `stopImmediatePropagation()` would be too late
  because Lexical registers first — so rich paste was inserted **twice**, once by each
  handler, interleaved at the same caret. Plain text was unaffected (our handler returns
  early and never preventDefaults), which is the tell. `LexicalFlowSurface` /
  `LexicalTableCellSurface` claim `PASTE_COMMAND` / `DROP_COMMAND` at
  `COMMAND_PRIORITY_CRITICAL`; returning `true` suppresses Lexical's default and returning
  `false` lets it handle the event normally.
- **Anything Lexical renders must be written through Lexical's model, not the DOM.**
  `applyOrderedListStart` set `start` on the `<ol>` element; the surface is rendered from
  editor state and saved from editor state, so the number survived until the next reconcile
  and never reached the saved page — "Starts at" looked like it did nothing. It now routes
  through `lexicalSetOrderedListStart` (`ListNode.setStart`) when a Lexical surface is
  active. The same applies to any future attribute-level editor control.
- **`lexicalHtmlConfig` needs an import for every custom export.** The editor exports inline
  colour/font styles through a custom `export` map; with no matching `import` map, Lexical's
  importer silently dropped the `style` attribute when re-hydrating. The result was that
  colour applied, saved, and rendered correctly on the public page but vanished from the
  editor on reopen, while bold (a Lexical text *format*) survived — reported as "you can
  have colour or bold, not both". Keep the two halves symmetric.
- **Lexical wraps nested lists in a structural `<li>` that must hide its own marker.**
  `theme.list.nested.listitem` is *additive* to `theme.list.listitem`, so pointing both at
  the same class made the wrapper paint an empty numbered item in the editor that the
  published page never showed. It is `doc-li--nested` with `list-style: none`. The public
  renderer never has this problem because it nests sub-lists inside the parent item's
  content (`ListItemRichText`) rather than using a wrapper. Lexical sets explicit `value`
  attributes, so the hidden wrapper does not consume a number.
- **Toolbar popovers must not recompute formatting while focus is inside them.** The
  "Starts at" number input takes the document selection out of the editor, so the next
  `selectionchange` reported "not in an ordered list" and closed the popover mid-edit.
  `DocumentToolbar` skips the recompute while `document.activeElement` is inside the
  popover; clicking away still closes it through the outside-mousedown listener.
- **Playwright's synthetic mouse cannot make a usable editor selection.** A scripted drag
  produces a range that ends *outside* the paragraph (`commonAncestorContainer` is the
  surface root) and a scripted double-click produces an empty one; Lexical correctly
  refuses both, and even typing does not replace them. Select text with
  `Range.selectNodeContents` or Shift+Arrow in editor specs. A formatting test that "fails"
  only under a mouse gesture is measuring the harness, not the editor.
- **Toolbar ownership is derived from DOM focus, never from mount or render order.**
  `lexical/toolbar-bridge.ts` tracks every mounted surface and re-resolves the active editor on each
  read (`syncActiveFromFocus`), because `focusin` alone is not enough: re-renders and DOM surgery
  happen while focus never leaves the surface, so no event fires to re-claim the toolbar. The
  surfaces' registration effects therefore depend on `editor` alone and keep every callback behind a
  ref, attaching through `editor.registerRootListener`. When they depended on callback identity
  instead, React's "destroy every effect, then create every effect" order meant each re-render
  unregistered all surfaces and then re-registered them in tree order — so the *first* flow on the
  page silently took the toolbar back on every keystroke. Bold/italic/underline then dispatched into
  an editor the caret was not in: the click appeared to do nothing and the view jumped to the top.
  Adding a surface? Track it through the bridge and keep its effect deps free of render-scoped
  closures, or the same class of bug returns.
- **`preserveFlowClientKeys` matches flows by identity, never by position.** Flow `clientKey`s are
  React keys for the Lexical surfaces, and Lexical's HTML export drops `data-block-id`, so block ids
  are re-minted on every emit — hence the inheritance passes (own key → shared block id → next
  unclaimed previous flow). A purely positional pass handed the key of whatever *used to* sit at
  index N to whatever sits there now, so moving a text box up re-labelled both boxes, React kept both
  surfaces exactly where they were, and the reorder appeared not to happen at all. Because identity
  is preserved, a wholesale document replacement (HTML→Visual, "Clean spacing") must go through
  `replaceDocument`, which prefixes an epoch to force the remount — do not rely on the new keys
  happening to differ from the old ones.
- **The empty-image-box rule is shared with the readiness panel.** `countEmptyImageBoxes` /
  `EMPTY_IMAGE_BOX_ISSUE` in `publish-gate.ts` are imported by `AdminPageEditorForm`, for the same
  reason `hasHeadingOrderSkip` is: paste-slot boxes are publish-blocked, so a panel that omits them
  reports "ready" and then 422s.
- **The editor toolbar is sticky, so programmatic scrolling needs `scroll-margin`.**
  `PageDocumentEditor` measures the toolbar with a `ResizeObserver` and publishes
  `--editor-toolbar-height`; `globals.css` spends it as `scroll-margin-block-start` on block
  editors, insert rows, surfaces, and figures. Without it, anything scrolled into view parks under
  the toolbar and the toolbar intercepts the click meant for it. The height is measured rather than
  hard-coded because the toolbar wraps to two or three rows at narrow widths (and goes `position:
  static` below the mobile breakpoint).
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
- **`userEditedRef` is a ref, never state.** Calling `setState` from the capture listener
  re-renders the editor mid HTML→Visual transition and drops in-flight content — it lost an
  editor note outright. Nothing needs to re-render when the flag flips: the work-protection
  effects already re-run on every snapshot change and read the ref then. The capture listener
  runs before React processes the same event, so the ref is set before the effect sees the
  resulting snapshot.
- **The listeners are native and capture-phase, not React props.** React's synthetic `onInput`
  on the form does not see edits inside the Lexical contentEditable, so gating on it silently
  disabled work protection for body edits while leaving it working for metadata fields.
- **Work protection is armed by a real edit, not by `dirty`.** `dirty` compares serialized
  snapshots, and the editor re-serializes on benign actions (opening the HTML source view,
  Lexical normalizing markup on first focus), so it goes true on pages nobody edited. The
  server draft, the localStorage backup, and the `beforeunload` warning all additionally require
  `userEdited`, set from `input`/`change`/`paste`/`drop`/`cut` on the form. Do not re-gate any of
  them on `dirty` alone — spurious "Server draft available" banners train editors to dismiss the
  banner on sight, which is the opposite of what a recovery feature needs.
- **Draft staleness is answered server-side, against `kb_page_revisions.created_at`.** The
  editor must warn before restoring a draft over a page that has been saved since, or the
  restore silently reverts that save. Do not compute this on the client by hashing editor state
  — `045` tried that and `046` removed it: the hash was taken over the saved snapshot, which
  becomes the editor's *normalized* content after an in-session save, so it reported "the page
  has been saved since" for drafts that were perfectly current. `kb_pages` only carries a
  day-granularity display date, so revisions are the only precise record of a save. An unknown
  answer (no revisions, no database) must surface as *unknown*, never as current.
- **Saving clears `userEditedRef`.** It previously stayed armed for the rest of the session, so
  the first benign re-serialization after a save wrote a fresh recovery draft — the user saved,
  discarded the banners, and watched them come straight back.
- **One recovery notice, not two.** The localStorage backup and the server draft both cover the
  same edits in the same browser; the local banner renders only when there is no server draft,
  which says strictly more (what changed, whether the page moved on).
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
- **Gateway credentials live in `*-gateway.ts`, never in `*-core.ts`.** `summary-draft-core.ts`
  and `page-review-core.ts` are imported by client components (the editor readiness panel, the
  settings prompt screen), so they must stay free of `process.env.AI_*` reads and provider
  `fetch`. Those live in `ai-gateway.ts`, `summary-draft-gateway.ts`, and `page-review-gateway.ts`,
  which throw if evaluated in a browser. Server callers use the `summary-draft.ts` barrel. After
  touching this boundary, rebuild and confirm `.next/static` has no gateway symbols.
- **A billed AI call that fails afterwards still has to be metered.** Provider requests that
  return 200 and then fail post-processing (empty draft, truncated prose, unparseable review) have
  already been charged. Throw `AiGatewayError` with the accumulated usage so the route records it;
  a plain `Error` silently drops the tokens from `/admin/usage`.
- **The publish gate's heading walk is shared with the editor's readiness panel.**
  `hasHeadingOrderSkip` / `collectHeadingLevels` in `publish-gate.ts` are the single source of
  truth, and `AdminPageEditorForm` imports them. Reimplementing the walk client-side is what let a
  page report "ready" and then 422 on publish. Card titles and procedure titles count as headings.
- **Playwright suites run on their own ports and never reuse a server.** `test:a11y` uses 3100 and
  `test:editor` uses 3101 (`A11Y_PORT` / `EDITOR_PORT` to override), both with
  `reuseExistingServer: false`. They configure a hermetic server with `DATABASE_URL` forced empty,
  and attaching to a dev server on 3000 instead — typically pointed at real Neon — produced a wall
  of seed-data failures that read exactly like regressions. Specs derive their absolute base URL
  from those env vars; do not hardcode a port, or the `Origin` header will not match the host and
  the same-origin guard will 403 the sign-in setup.
- **Same-origin checks use `APP_PUBLIC_HOST` and nothing else.** When set, `isSameOrigin` trusts
  only those hosts; unset, it compares against the request's own headers. Do **not** reintroduce an
  inferred allowlist: `VERCEL_PROJECT_PRODUCTION_URL` was tried and is set on preview deployments
  too, where it names production rather than the host being served — every preview 403'd its own
  sign-in. A deployment's real host set includes custom domains that no env var enumerates, so any
  inferred list is incomplete by construction.
- **Outbound requests to operator-supplied URLs go through `net-guard.ts`.** Webhook delivery
  checks the target at registration and re-resolves it at delivery. Any new feature that POSTs or
  GETs a user-supplied address needs the same guard, or it becomes an SSRF pivot; the
  sourced-content importer solves the same problem with a host allowlist instead.
- **`style/style.md` hand-mirrors the publish gate and editor block contract.** The agent style
  pipeline in `style/` (see `style/README.md`) checks pages against a prose copy of
  `validatePageForPublish` rules and the `documentHtmlToBlocks` allowed-block list. If you change
  publish-gate rules or the block contract, update `style/style.md` to match or the content
  pipeline silently drifts.

---

## 9. Current feature status

**As of 2026-08-21:** the public/private multi-KB platform is on `main` and in active Grad School
content use. CI covers type-check, lint, unit tests, production build, public/private-viewer axe
smoke, authenticated Chromium editor regressions, and live-DB suites when `DATABASE_URL` is set.

**Shipped product surfaces**
- Multi-KB public/private reader: 3-column docs layout, hierarchical page tree (pages, group
  headings, links) with per-KB render/expand depth, depth-controlled TOC (per-KB default, per-page
  override), KB homepage pages, home KB filter/pagination, previous/next article nav (**off by
  default**; per-KB opt-in via `showPageNav`), heading copy-link, print-to-PDF (browser print over
  semantic HTML).
- Block editor: rich text, alignment, links, media picker (library / upload / paste-slot / video),
  cards, tables, video, info boxes, procedure sections, excerpts, P&P sourced blocks, editor notes
  (inline + margin rail), captions vs alt text, list numbering continued across intervening blocks,
  draft backup/restore, draft preview, publish readiness panel.
- Optional **Draft with AI** for page summaries and **Review with AI** for style/readability/grammar/
  alt suggestions (Gateway env vars; never auto-saves). System prompts are editable under
  **Admin → Settings → AI Prompt**, with per-KB overrides on the knowledge base edit form
  (resolution: KB → site → built-in). Cleaned summary drafts are capped at 2,500 characters.
- Managed assets: stable URLs, versions, tags, usage index with used/unused library visibility,
  direct-to-Blob large uploads when configured, responsive `?w=` / `srcset` image variants,
  private/staff-aware delivery, archive-first delete.
- Search: Postgres FTS (global + per-KB), tag/keyword scoring, visibility prune, search widget with
  live suggestions.
- Governance: publish gate, owner/admin/KB-manager publish approval, proposed-edits workflow, review dashboard
  (feedback + propose actions), content health dashboard, revision history with side-by-side
  compare/restore, trash, audit log, weekly review digest cron, reader "Was this helpful?" feedback.
- Per-KB theming: colours, fonts, type scale, heading styles, typography/spacing, list marker
  (number/bullet) styling, navigation depth, and the editor's font/size/colour allowlist.
- Auth & admin: Owner/Admin/Manager/Editor/Viewer, per-KB scoping, edit locks, site settings/branding,
  KB starter templates, cross-KB copy/move, DOCX import, redirects, KaaS read + limited-write API, owner KB ZIP
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
- Editor framework migration: flow, cards, procedure, and table-cell surfaces use Lexical
  (Phases 1–4 + FB-26 + FB-39). The `/admin/lexical-spike` route was removed on 2026-08-01 now
  that the migration is complete. Keep `npm run test:editor` and the release-gate Firefox/mobile
  checklist green before claiming editor close-out.

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
- **Authentication is local by decision, not by deferral**: owner-provisioned accounts use scrypt
  password hashes and signed HMAC cookies. SSO/OIDC/SAML was dropped on 2026-08-01 and is not
  planned. There is still no server-side idle-session table or sliding idle timeout beyond the
  current cookie/token expiry behavior. Production must set `KB_ADMIN_SESSION_SECRET`; the app
  refuses to sign cookies without it rather than deriving a key from the bootstrap credentials.
- **Manager role** — KB-scoped publish/approve in assigned KBs; Owner/Admin remain KB-wide.
- **The contenteditable editor still needs release-grade QA.** It is custom, and complex selection
  edge cases keep surfacing in real use (heading demotion on delete, list splits with duplicate ids,
  lost pasted images, touchy link insertion, stale HTML-source saves, table-cell toolbar binding, and
  nested-list / Info-box callout rendering were all found by editors/review in 2026-07 and patched
  point-by-point). Every editor change needs manual verification in a real browser (Chrome + Firefox at
  minimum), and further reports should be expected. FB-09/FB-29/FB-26 moved flow, card, procedure,
  and table-cell surfaces to Lexical; FB-25 defines the release-grade browser/a11y gate.
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

**Product / platform items that remain future (not yet built):**

**FB-45 — readable diffs** is the one open build item: the draft and revision comparison is a
flat line diff, which does not scale to long pages. Ratified 2026-08-02.

The 2026-07 hardening backlog (FB-38–FB-44) shipped on 2026-08-01. The two remaining concepts —
WSU SSO and a Confluence import/export bridge — were dropped by the maintainer on the same date
rather than deferred; do not re-add them without maintainer direction.

**FB-25**, the manual release gate, also remains open but is QA rather than new code.

**Editor framework:** Lexical Phases 1–4 + FB-26 landed for flow, cards, procedure, and table-cell
surfaces, and FB-39 closed the nested-surface toolbar binding risk. Close-out evidence is part of
the manual release gate (FB-25): Chrome + Firefox + mobile-width editor pass.

**Release readiness** (FB-25) is ops/QA, not a new product surface: finish the manual checklist in
`docs/release-gate.md` and §13 sign-off.

Do not add new open FB items without maintainer ratification; fold small polish into shipped
features rather than inventing FB IDs for every nit.

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
- **Open set:** FB-45 (build) and FB-25 (release QA). FB-38–FB-44 are done; FB-30 and FB-37 were dropped.

---

### FB-45 — Readable diffs for drafts and revisions

`[AI-AGENT-TASK] id:FB-45  priority:med  area:editor-ux  effort:M  status:open`

- **Why:** `diffLines` renders a flat, whole-line, plain-text diff, and it backs both the
  recovery-draft banner and the revision History compare. On a long page it forces the reader to
  do the work the tool should: a one-word edit shows the whole line removed and re-added, every
  unchanged line still renders, and the `<ol>` line numbers correspond to nothing an editor can
  navigate to. `revisionPlainDocument` also flattens blocks, so a change cannot be attributed to
  a heading, a table cell, or a list item.
- **Do first (small, self-contained):**
  1. **Collapse unchanged regions** — 2–3 lines of context per change with an expandable
     "… N unchanged lines …" separator. Biggest single win for long pages.
  2. **Word-level highlighting inside changed lines** — keep the line pairing, diff within the
     lines already known to differ.
  3. **Replace line numbers with location labels** derived from the nearest preceding heading
     ("under *Need help?*"), because editors navigate by section.
  4. **Name the changed settings** when only metadata differs — today that case reads "the page
     text matches; only page settings differ", which is true and useless.
- **Then (the part that actually scales):** a **block-level change summary** read first, with the
  line diff underneath as detail on demand — "Heading *Before you begin* — text changed",
  "Paragraph added after *Step 3*", "Table row removed". Blocks carry stable `data-block-id`s,
  which is what makes this possible and what a text diff cannot use: matching ids detect a
  **moved** block (a line diff renders a move as an unrelated delete and add, often screens
  apart) and give each entry an anchor to jump to. The summary is proportional to the number of
  changes rather than the length of the page.
- **Considered and not recommended for now:** rendered track-changes over formatted content
  (most readable, but tables, images, and block-type changes all need separate handling), and
  side-by-side (needs more width than the banner has — would require a modal).
- **Accessibility:** convey add/remove with real `<ins>`/`<del>` elements rather than colour plus
  a `+`/`−` glyph, so assistive tech announces the change type. Nothing checks admin UI the way
  the publish gate checks content, so this will not be caught for you.
- **Touch points:** `src/lib/revision-diff.ts`, `src/components/AdminPageEditorForm.tsx` (draft
  banner), `src/components/PageHistoryPanel.tsx` (revision compare), `src/lib/types.ts` if the
  summary needs a block-change shape.
- **Acceptance:** a long page with a handful of edits shows what changed without scrolling past
  unchanged content; a one-word edit is visible as a word, not two whole lines; each entry says
  where the change is in the page's own vocabulary; both the draft banner and History compare use
  the same implementation.

### FB-09 / FB-29 — Editor framework migration

`[AI-AGENT-TASK] id:FB-09  priority:high  area:editor-architecture  effort:L  status:done`
`[AI-AGENT-TASK] id:FB-29  priority:high  area:editor-architecture  effort:L  status:done`

- **Plan:** `docs/editor-framework-migration.md` (phases 0–4 + FB-26). Flow, card, procedure, and
  table-cell surfaces are delivered on Lexical.
- **Why:** the editor still needs release-grade QA across Chrome, Firefox, and mobile widths, but
  the core framework migration is complete. Keep the existing `ContentBlock[]`
  storage model, sanitizer, publish gate, source-HTML path, and public render.
- **Touch points:** `src/components/PageDocumentEditor.tsx`, `src/components/LexicalFlowSurface.tsx`,
  `src/components/LexicalTableCellSurface.tsx`, `src/components/TableBlockEditor.tsx`,
  `src/lib/page-document.ts`, `src/lib/page-editor-format.ts`, `src/lib/rich-text.ts`,
  `tests/editor/`, `docs/editor-framework-migration.md`.
- **Acceptance:** page-document round-trip tests pass unchanged; Chromium editor regressions pass;
  a documented Chrome + Firefox manual checklist covers selection, paste, list nesting, link/note
  insert, table-cell editing, undo/redo, and source-mode round-trips. Do not mix this migration into
  unrelated feature PRs.

### FB-26 — Table-cell Lexical parity

`[AI-AGENT-TASK] id:FB-26  priority:med  area:editor-architecture  effort:M  status:done`

- **DONE:** Table cells use nested `LexicalTableCellSurface`; toolbar bold/link bind via the shared
  Lexical bridge; cell HTML still stores inline rich text (`sanitizeRichText`). Covered by
  `tests/editor/table-cell.spec.ts` and `tests/editor/toolbar-context.spec.ts`.

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

### Dropped: FB-30 (WSU SSO) and FB-37 (Confluence bridge)

`[AI-AGENT-TASK] id:FB-30  priority:med  area:auth  effort:L  status:wontfix`
`[AI-AGENT-TASK] id:FB-37  priority:low  area:migration  effort:L  status:wontfix`

Both were dropped by the maintainer on 2026-08-01. Authentication stays local and
owner-provisioned (§10); DOCX staged import plus owner KB ZIP export remain the migration path
off Confluence. Do not reopen either without maintainer direction — the write-ups are in git
history if they are ever revived.

#### FB-37 revival notes — Confluence import/export research (2026-08-12)

Status remains `wontfix` unless the maintainer explicitly reopens it. The practical finding is that
Confluence import is feasible, but a true import/export bridge is a product feature, not a parser
tweak. Reuse the existing staged import and export foundations first: `src/lib/staged-imports.ts`,
`src/lib/docx-import.ts`, `src/lib/import-commit.ts`, and `src/lib/kb-export.ts`.

Best first build: **Confluence HTML space export ZIP import** into the existing staged-import review
flow. Atlassian's Cloud space export supports HTML, CSV, PDF, and XML; HTML exports include page
attachments under `download/attachments/<pageId>`, which gives a workable path to recover inline
images/files and promote them into managed assets. Estimate: 1-2 weeks for a useful MVP for ordinary
pages; 3-5 weeks for robust page hierarchy, link rewriting, redirect generation, attachment review,
macro fallbacks, and bulk QA. Source:
https://support.atlassian.com/confluence-cloud/docs/export-content-to-word-pdf-html-and-xml/

API-based Confluence import is more flexible and supports repeated sync, but adds auth, rate-limit,
pagination, and permission edge cases. Confluence REST API v2 uses cursor pagination; page endpoints
support `body-format` on page reads, and attachment endpoints expose page attachment metadata and
download links with OAuth scopes such as `read:page:confluence` and `read:attachment:confluence`.
Estimate: 3-6 weeks for a reliable v1, depending on whether it needs OAuth setup or can use an
admin-supplied API token. Sources:
https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/
https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-attachment/

Avoid building around Confluence Cloud XML export. Atlassian says XML Site Export and XML Space
Export reach end of life on December 1, 2026; CSV remains supported, but CSV is a poorer fit for
rich page layout and media preservation in this app. Source:
https://support.atlassian.com/confluence/kb/xml-export-end-of-life-confluence-cloud/

Intermediate export option: **Confluence-safe single-page DOCX export**. This is much easier than a
true Confluence export bridge and fits Confluence Cloud's current one-file-to-one-page import path.
Generate `.docx`, not legacy `.doc`: Atlassian's Word import path names Word document `.docx`, and
DOCX is practical to generate with modern libraries. Keep the document intentionally plain: title,
H2/H3 headings, paragraphs, ordered/unordered lists, simple tables, hyperlinks, and embedded PNG/JPG
images with captions as ordinary paragraphs. Flatten app-specific blocks such as cards, procedure
sections, excerpts, sourced blocks, notes, and videos; turn videos into links; avoid shapes,
floating text boxes, merged table cells, custom colors, embedded objects, and complex page layout.
Include an export report listing what was flattened or converted so editors know what to inspect
after Confluence import. Estimate: 2-4 days for a basic one-page DOCX export from `ContentBlock[]`;
about 1 week for a polished Confluence-safe version with images, captions, simple tables, and
warnings; 1-2 weeks if it needs real QA against Confluence imports across representative pages.
Source:
https://support.atlassian.com/confluence-cloud/docs/import-content-into-confluence-cloud/

Exporting **from this app back into editable Confluence pages** is harder than importing. It would
need Confluence storage-format or ADF generation, page create/update/version handling, parent/page
mapping, attachment upload, link rewriting, and conflict handling. Estimate: 4-8 weeks for a
practical v1, longer if macros, permissions, comments, history, or round-trip fidelity are required.
The current owner KB ZIP export remains the right archival/static export path unless there is a real
requirement to republish content into Confluence.

### FB-38 — Session and auth hardening

`[AI-AGENT-TASK] id:FB-38  priority:high  area:auth  effort:S  status:done`

- **DONE (2026-08-01):** `getSessionSecret()` now throws in production rather than deriving a
  signing key from the bootstrap credentials; managed sessions rebind `role`/`email` from the
  `users` row instead of trusting the cookie payload; `isSameOrigin` honours an `APP_PUBLIC_HOST`
  allowlist (falling back to `VERCEL_PROJECT_PRODUCTION_URL`) so a spoofed `x-forwarded-host`
  cannot define the compared origin. Covered by `src/lib/auth.test.ts` and `src/lib/origin.test.ts`.
- **Deploy note:** production must now set `KB_ADMIN_SESSION_SECRET`. See §13.

### FB-39 — Lexical nested-surface toolbar binding

`[AI-AGENT-TASK] id:FB-39  priority:high  area:editor-architecture  effort:M  status:done`

- **DONE (2026-08-01):** flow and table-cell surfaces claim the shared toolbar on mount only when
  `hasActiveLexicalEditor()` reports it free; focus hands ownership over after that, and unmount
  releases the selection binding when the surface still held it. The shared `kb-flow` namespace
  was kept deliberately — it is what preserves node structure when pasting between flow surfaces.
  Covered by `tests/editor/toolbar-context.spec.ts` and `tests/editor/table-cell.spec.ts`.

### FB-40 — Publish-gate heading order and excerpt reachability

`[AI-AGENT-TASK] id:FB-40  priority:high  area:a11y-publish-gate  effort:M  status:done`

- **DONE (2026-08-01):** `collectHeadingLevels` walks headings, procedure-section titles, and card
  titles (at `titleLevel`) in document order, including nested blocks, so a card titled H3 before
  any H2 now blocks publish. `checkExcerptSourceForPublish` takes an optional `ExcerptAudience` and
  returns `unreachable` when the source is narrower than the host page's audience. `style/style.md`
  was updated to match. Covered by `src/lib/publish-gate.test.ts` and `src/lib/excerpts.test.ts`.

### FB-41 — Lock-safe scheduled publish

`[AI-AGENT-TASK] id:FB-41  priority:high  area:concurrency  effort:S  status:done`

- **DONE (2026-08-01):** `publishDueDraftPages` clears the schedule through
  `clearPagePublishAtColumn` (a single-column write) instead of a full-row `updatePages`, so the
  cron no longer overwrites a concurrent editor's locked draft. Regression test lives in
  `src/lib/ki1.db.test.ts` and needs a live DB (`npm run test:db`).

### FB-42 — AI client/server split and metering completeness

`[AI-AGENT-TASK] id:FB-42  priority:med  area:ai  effort:M  status:done`

- **DONE (2026-08-01):** gateway credentials and provider `fetch` moved into server-only
  `ai-gateway.ts` / `summary-draft-gateway.ts` / `page-review-gateway.ts`; the `*-core` modules
  client components import now hold prompts, parsing, and readiness only. `AiGatewayError` carries
  the tokens a billed call consumed so both AI routes meter failures that happened after the
  provider responded. Verified by grepping `.next/static` for gateway symbols after a build.
- **Note:** the original write-up claimed client bundles shipped credential paths. They did not —
  tree-shaking removed them. The real defects were the fragile module boundary and the metering
  gap, both of which are fixed.

### FB-43 — Webhook SSRF and KaaS key hardening

`[AI-AGENT-TASK] id:FB-43  priority:med  area:security  effort:M  status:done`

- **DONE (2026-08-01):** new `src/lib/net-guard.ts` rejects loopback, RFC1918, CGNAT, link-local
  (including `169.254.169.254`), multicast/reserved, IPv6 ULA/link-local, and IPv4-mapped-IPv6
  targets, plus `localhost`/`.local`/`.internal` hostnames. Webhook URLs are checked at
  registration *and* re-checked with DNS resolution at delivery. `requireKaasAuth` throttles failed
  KaaS authentication per client (10/minute, then 429). Covered by `src/lib/net-guard.test.ts` and
  `src/lib/kaas-auth.test.ts`.
- **Residual:** DNS rebinding between the resolution check and the socket connect is not closed;
  per-KB KaaS key scoping is still not implemented.

### FB-44 — Client publish-readiness parity

`[AI-AGENT-TASK] id:FB-44  priority:med  area:editor-ux  effort:S  status:done`

- **DONE (2026-08-01):** the readiness panel calls the gate's own `hasHeadingOrderSkip`, so the two
  cannot drift; `countBlockIssues` recurses into `sourced` blocks; and the panel lists the
  server-only checks ("Checked when you publish": asset active status, excerpt reachability)
  instead of implying a clean bill of health.

---

## 13. Operations runbook


### Deploy Checklist

- Confirm `npm run check`, `npm run lint`, `npm test`, and `npm run build` pass locally or in CI.
- Confirm `npm run test:db` passes against the current Neon test branch before promoting changes that touch migrations or DB behavior.
- Confirm Vercel has `DATABASE_URL`, `KB_ADMIN_EMAIL`, `KB_ADMIN_PASSWORD`, `KB_ADMIN_SESSION_SECRET`, and `CRON_SECRET` configured for the target environment.
- **`KB_ADMIN_SESSION_SECRET` is now mandatory in production.** The app throws on any cookie-signing
  path without it instead of quietly deriving a key from the bootstrap credentials, so a deployment
  missing it will fail admin sign-in outright. If this deployment previously relied on the derived
  fallback, setting the variable also invalidates every existing session cookie — expect one
  round of sign-outs.
- Optionally set `APP_PUBLIC_HOST` to the public hostname(s) this environment serves
  (comma-separated), including any custom domain. Leave it unset on Preview, whose hostname
  changes per deployment. Without it the same-origin check compares against request headers,
  which is weaker but never locks a valid host out.
- If AI draft summaries are expected in the editor, confirm `AI_PROVIDER_ENDPOINT`, `AI_API_KEY`, and `AI_MODEL`.
- If review-date email delivery is expected, confirm `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_TOKEN`, and `EMAIL_FROM`; otherwise expect structured JSON fallback logs.
- Confirm the Vercel plan supports the configured cron count before deploy validation; this project currently schedules audit cleanup, revision cleanup, review digest, review overdue, sourced staleness, and scheduled publish routes.
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
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/admin/cron/review-overdue
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/admin/cron/sourced-staleness
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://YOUR_HOST/api/admin/cron/scheduled-publish
curl -sS https://YOUR_HOST/api/health
```

- Rotate `CRON_SECRET` by updating Vercel environment variables, redeploying, and confirming the scheduled routes still authorize.
- Treat missing email/provider configuration as non-fatal unless the specific cron route documents otherwise.
- `/api/admin/cron/review-digest` sends weekly review-date digests when an email provider is configured; without one it logs recipients/subjects as structured JSON and reports skipped deliveries.
- `/api/admin/cron/review-overdue` sends overdue-review notifications, stale-excerpt notices, and related webhooks (`review.overdue`, `excerpt.stale`).
- `/api/admin/cron/revision-cleanup` keeps the newest 50 revisions per page and deletes abandoned `page_server_drafts` older than 30 days.
- `/api/admin/cron/sourced-staleness` checks P&P sourced blocks for changed/missing/unreachable sources.
- `/api/admin/cron/scheduled-publish` attempts due scheduled publishes through the normal publish gate.
- `/api/admin/cron/audit-cleanup` also folds page-view rows older than 90 days into monthly totals.

### Post-Deploy Checks

- Probe `GET /api/health` — expect `{ "ok": true }` (no auth).
- Confirm schema head applied: `SELECT id FROM _schema_migrations ORDER BY id DESC LIMIT 5;`
  should include `047_kb_show_page_nav` (and earlier ids such as `043_page_server_drafts_per_author`,
  `040_asset_tags`, and `029_kb_visibility`). Existing public
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
- If webhook endpoints are configured under `/admin/webhooks`, confirm a test publish (or overdue/stale cron) delivers to at least one HTTPS subscriber with `x-kb-signature` / `x-kb-event`.
- `/admin/usage` loads aggregate view counts and AI token metering when `DATABASE_URL` is configured.

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

**Content reviews.** `automated_review.md` logs agent-driven passes over the published KB —
the 2026-08-01 pass fixed 11 broken links, 12 Title Case headings, and the audience preambles,
and records what it left for a human. Read it before editing live pages; it also documents why
ordinary link checkers miss dead KB URLs (not-found pages return HTTP 200 — see §10).


Phase 1 private knowledge bases shipped 2026-07-14 (PR #11). Earlier FB backlog write-ups
and the Phase 1 step plan were removed from this document once delivered; recover them from
git history if needed. Prefer updating §9 / §11 / §12 over appending long audit trails here.

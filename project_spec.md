# Project Spec: Public Multi-KB Platform with Managed Assets

## 1. Project Overview

This project will create a public knowledge base platform to replace or supplement public Confluence-based Graduate School knowledge base content.

The application provides clean, accessible public knowledge bases and a focused administrative interface for managing pages, images, documents, videos, imports, redirects, and review workflows.

The primary goals are:

1. Provide clearer, more polished, and more accessible public KB front ends.
2. Support multiple public knowledge bases from one application.
3. Manage images, documents, and videos as first-class assets instead of unmanaged attachments.
4. Allow staff to replace an asset (file update) without breaking public links.
5. Show where each asset is used before replacement, archiving, or metadata changes.
6. Improve accessibility, search, navigation, and content governance.
7. Reduce reliance on Confluence for public-facing knowledge base content.

## 2. Intended Users

### Public Users
* Graduate program staff, faculty, prospective/current students, and external partners.
* No login required.

### Administrative Users (Staff)
* Owners, Admins, and Editors who maintain KB content and assets.
* Requires authentication and role-based access.

---

## Implementation Status (current repository)

The project is in a functional "Pilot Ready" state. The core architecture, high-risk
technical features, and the multi-user/security build phase are implemented, and the
Neon-only paths are now verified against a live database (KI-1 resolved). Remaining work is
administrative depth (management UIs), wiring the live-DB suite into CI, and the KI-2 follow-ups.

### Built and Verified
* **Framework**: Next.js 16 / React 19 / TypeScript / App Router / Neon Postgres.
* **Public KB**: Home pages, article routes, hierarchical navigation, breadcrumbs, and a **3-column docs layout** (nav · article · sticky on-page TOC rail) that is fully responsive and collapses gracefully on tablet/mobile.
* **Editor**: Block-based editor for Paragraphs, Headings (H2/H3), Lists (with auto-nesting styles), Info/Warning callouts, Images, Tables, Videos, Cards, and internal Editor Notes. Rich-text toolbar with fonts/sizes/colors, **text alignment** (left/center/right), and a **link dialog** (create or edit existing links with display text + new-tab target; `rel="noopener noreferrer"` enforced).
* **Media & Images**: A unified **Media picker** inserts images/files from the asset library, uploads new files, or embeds YouTube/Vimeo/direct videos. Images have inline **align + resize controls** (reveal on click) and an **alt-text editor** (write a description, mark decorative, optionally save to the asset).
* **Asset System**: Stable public routes (`/kb/{kbSlug}/files/{assetSlug}`), version history, and usage tracking.
* **Importing**: Robust DOCX staged import with style/image extraction and review.
* **UX/A11y**: WSU-branded professional UI, accessible color system, focus management, header sign-in identity + **Sign out**, an **accessible PDF export** (browser print-to-tagged-PDF over semantic HTML), modal dialogs with focus trap/Escape/focus-return rendered via portals, and a **publishing gate** that highlights the offending fields/images when a publish is blocked.
* **Publish workflow**: Publish/Save-changes **saves the current form first** (no stale validation), an **unsaved-changes** indicator, and a confirm before status actions that would ignore in-progress edits.
* **Editor Fixes**: Resolved font/size controls, cursor jumping, toolbar state highlighting, and toolbar wrapping.

### Built — Verified against live Neon
The following landed in the latest build phases. Logic, type checks, and the in-memory
test suite (86 tests) pass, and the Neon-only paths (edit locks, atomic reorder, FTS,
editor scoping) are now **verified against a live Postgres database** by the
`DATABASE_URL`-gated suite (`npm run test:db`) — see *KI-1 (Resolved)*.
* **Auth & Security**: `users` and `kb_user_assignments` tables, HMAC-signed session cookies, and role-based access. **Owners/Admins are KB-wide; Editors are scoped to their assigned KBs, and that scope is enforced on both mutations and list-view visibility** (`requireKbAccess` on every editor-reachable mutation, including the resolve-by-id import-commit and redirect routes; admin list views and the asset-list endpoint filtered via `accessibleKbIds`/`filterKbsForSession`; users list owner-only — KI-3 resolved). User management (`/admin/users`, owner-only, with a **search + chips** per-editor KB-assignment picker) and KB management (`/admin/kbs`) screens are present.
* **Per-KB theming ("Manage Styles")**: Owner-only screen (`/admin/kbs/[kbId]/styles`) to set colors (body text + separate H1/H2/H3 + accent/surface/etc.), body/heading fonts, a responsive type scale, and the editor's font/size/color palette, with a live preview, WCAG contrast checks, and JSON import/export. Validated tokens (hex/rem/font-keys) are injected as scoped CSS variables — no CSS-injection risk. Theme persistence requires a database; injection works with the default theme without one.
* **Summary display toggle**: pages can keep a summary (used for search/meta) but optionally hide it as a lead paragraph on the public page (`page.showSummary`).
* **Video Support**: First-class `video` asset type and editor block; YouTube/Vimeo URL → `embedId`/`provider` parsing; sandboxed, lazy-loaded, `referrerPolicy`-hardened iframes; round-trip serialization.
* **Card Sections**: Recursive `card` block with create/reorder and background styling (Paper / Wash / Crimson). Card titles render as semantic `<strong>` (not headings) to keep the document outline clean. Parser enforces `MAX_NESTING_DEPTH = 3`.
* **Edit Locks**: DB-backed locks with atomic acquisition (`tryAcquirePageLock`), `TIMESTAMPTZ`-owned expiry, a 60s client heartbeat / 2-minute TTL, and **write-path enforcement** — saves and reorders run in a single transaction that rolls back on a lock conflict (no partial/clobbered writes).
* **Search (Postgres FTS)**: `tsvector` + GIN indices, `websearch_to_tsquery` with `:*` prefix/type-ahead, page-over-asset rank bias, a recursive staff-visibility prune so public search cannot leak staff-only pages, and a de-noised block-text extractor that indexes paragraph/heading/list/table/caption text (not raw JSON).
* **Navigation**: TOC depth control (H2 vs H2+H3), recursive into Cards; editor toolbar wrapping.
* **Maintenance**: `assertNever` exhaustiveness guards across the type union, renderer, and both serializers.

### Partially Built
* **Multi-KB Support**: Data model, routes, a KB management screen (`/admin/kbs`), and per-KB theming exist; templates/advanced settings are still thin.
* **Asset Library**: Table view plus a media picker and per-image alt/description editing exist; advanced file management and direct-to-blob large uploads are pending.
* **TOC polish**: Right-rail TOC is in place; scroll-spy active-section highlighting is a future enhancement.

---

## Known Issues & Verification Gaps

### KI-1 — Neon/Postgres live-DB verification (Resolved)
The edit-lock enforcement and Postgres FTS features execute **only** when `DATABASE_URL`
is set. These paths have now been **verified against a live Neon database** by an automated,
`DATABASE_URL`-gated integration suite (`src/lib/ki1.db.test.ts`, run with `npm run test:db`).
The suite self-skips when no database is configured, so the default `npm test` is unaffected.

> **Atomicity regression found and fixed during verification.** While writing the suite we
> found that `updatePages` had been refactored into a **non-transactional sequential loop**
> (the original CTE/transaction machinery was dead code), so a multi-row move/reorder could
> **half-apply** on a lock conflict — breaking the "atomic rollback" guarantee. `updatePages`
> now writes the whole batch in a single `sql.transaction([...])`, with a data-modifying CTE
> whose `CASE … THEN 1 / 0` guard raises `22012` to roll back the batch when any row is locked.

The three previously-unproven assumptions are now confirmed by the passing suite:
1. ✅ A data-modifying CTE rolls back when its trailing `CASE … ELSE 1 / 0` guard raises.
2. ✅ `sql.transaction([...])` issues `ROLLBACK` on any in-transaction error, making multi-row move/reorder batches all-or-nothing.
3. ✅ `NeonDbError.code` surfaces the Postgres SQLSTATE `22012` that the conflict handler keys on.

**Verified scenarios (all passing against live Neon):**
* **Lock conflict / no-clobber:** a save by user B against a page locked by user A throws *"this page is locked by another user or your lock has expired"* and the row is unchanged.
* **Atomic reorder rollback:** a multi-row batch where one page is locked fails with **no** other rows mutated (proves rollback, not partial write).
* **Lock expiry:** once a lock passes its TTL, another user can acquire it.
* **FTS safety/quality:** punctuation-heavy queries (`C++`, `AT&T`, `i-20`, `20% off`) return results, never a 500; a term that appears only in a list item is found; a published page under a `staff` ancestor never appears in public (non-staff) search results.
* **Editor scoping:** an editor's `canAccessKb` is true only for assigned KBs; owners/admins are KB-wide.

**Remaining (CI):** wire `npm run test:db` into CI against a dedicated Neon test branch so these
checks run automatically on every change (today they are run on demand).

### KI-3 — Editor KB-scoping (Resolved)
Editor scoping is **enforced on mutations** (page create/edit/status/reorder/lock; asset
upload/replace/activate/status/description; DOCX import stage + commit; redirect
create/update/delete) via `requireKbAccess`. Owners/Admins are KB-wide. All previously-noted
gaps are now closed:
1. ✅ **Admin list-view visibility is filtered.** The `/admin/pages` and `/admin/assets`
   screens run their KB list through `filterKbsForSession`, and `GET /api/admin/assets` calls
   `requireKbAccess` (an explicit `kbId` is now required), so editors can no longer browse or
   enumerate content in KBs they aren't assigned to. The `/admin/kbs` list endpoint already
   403s non-owners/admins. Separately, `GET /api/admin/users` is now **owner-only** (it
   previously returned the full staff directory to any signed-in session). Scoping helpers
   (`accessibleKbIds`, `filterKbsForSession`) live in `src/lib/auth.ts`.
2. ✅ **The two resolve-by-id routes are guarded.**
   `POST /api/admin/import/staged/[stagedImportId]/commit` resolves the staged import's target
   KB (via `getStagedImportDetail`) and `DELETE`/`PATCH /api/admin/redirects/[redirectId]`
   resolve the redirect's KB (via the new `getRedirectById` helper in `kb-store.ts`); each
   calls `requireKbAccess` before acting and returns 404 when the record doesn't exist.
3. **Editor self-service of users/KBs is correctly blocked** (owner-only routes). There is
   still no per-KB "manager/admin" tier — KB-wide Admin is all-or-nothing. Add a scoped admin
   tier only if needed (not required for pilot).

Enforcement was verified to not block Owners; the per-Editor 403/filtering path depends on the
same live-DB verification as KI-1 (assignments live in `kb_user_assignments`).

> **Fixed (assignment regression):** Assigning an editor to a KB previously failed with
> `null value in column "email"` because `updateUser` issued a full-row UPDATE while the PATCH
> route sent only changed fields. `updateUser` now does a partial update (`COALESCE` per column),
> so role/assignment edits no longer null out the rest of the user row.

### KI-2 — Recommended follow-ups (All resolved)
* ✅ **Video asset model (Medium) — Resolved.** Managed videos now have dedicated `kb_assets`
  columns — `video_provider`, `video_external_id`, `video_url` (migration `012`, backfilled in
  app code for legacy rows) — instead of overloading the version `body`/synthetic mime. The
  stable file route (`/kb/{slug}/files/{assetSlug}`) now **307-redirects** a video to its
  canonical https URL (`videoDeliveryUrl` in `src/lib/video.ts`) rather than streaming the URL
  as text. Verified by unit tests (`video.test.ts`) and a live-DB round-trip (`ki1.db.test.ts`).
* ✅ **Alt text vs. asset description (Low) — Resolved.** Added a dedicated `kb_assets.alt_text`
  column (migration `013`); "save alt to asset" now writes `altText` via `updateAssetAltText`,
  so it no longer overloads the human-facing `description`. Verified live (`ki1.db.test.ts`).
* ✅ **Over-deep nesting (Low) — Resolved.** Card content beyond `MAX_NESTING_DEPTH = 3` is now
  **flattened up** into the parent level instead of being silently dropped on save
  (`documentHtmlToBlocks` in `src/lib/page-document.ts`). Verified by `page-document.test.ts`.
* ✅ **Status/publish toggle (Low) — Resolved.** `updatePageStatus` now updates **only** the
  `status`/`updated_display_date` columns (`updatePageStatusColumn`) instead of rewriting the
  whole row, so a publish/unpublish can't clobber a concurrent editor's content — which is why it
  safely needs no edit lock. Verified live (`ki1.db.test.ts`).
* ✅ **FTS visibility subquery scaling (Low) — Resolved.** Added index
  `idx_kb_pages_staff_prune ON kb_pages(kb_id, visibility, path)` (migration `013`) to support the
  staff-prune correlated subquery as KBs grow.

---

## 3. Scope & Key Features

### Content Navigation & TOC
* **Global Navigation**: Sidebar page tree for deep hierarchy.
* **Page TOC**: Automatically generated from page headings (recurses into Cards).
    * ✅ Depth control (H2 only, or H2+H3) to keep TOCs clean on long pages.
    * ✅ Rendered in a **sticky right rail** on wide screens (3-column docs layout), inline on tablet/mobile.
* **Breadcrumbs**: Clear path back to KB home.

### Managed Assets (Images, Docs, Video)
* **Stable Links**: Asset URLs point to the *active* version, allowing file updates without link breakage.
* ✅ **Video Support**: Link/embed videos as managed assets (YouTube/Vimeo/direct), with title and embed parsing.
* ✅ **Media picker**: One entry point to insert library images/files, upload new files, or embed video.
* ✅ **Alt text**: Per-image alt-text editor with a "decorative" option; optional save back to the asset; the publish gate highlights images missing alt.

### Admin Editor Enhancements
* ✅ **Toolbar Wrapping**: The editor toolbar wraps gracefully in narrow views.
* ✅ **Card Sections**: Create, reorder, and style (Paper/Wash/Crimson) visual cards; recursive content.
* ✅ **Text & image alignment**: Flush-left / center / flush-right for text and images.
* ✅ **Links**: Dialog to create or edit existing links (display text, URL, open-in-new-tab).
* ✅ **Editor Notes**: Internal notes visible only while editing — never published and excluded from public search.
* ✅ **Multi-User Workflow**: Edit locks to prevent concurrent overwrites.

### KB Management
* **KB Admin**: UI to create new KBs, set slugs, and assign templates.
* **Access Control**: Owner/Admin/Editor roles based on Graduate School scholarship/smartsheet-viewer patterns.

---

## 4. Technical Architecture

### Tech Stack
* **Front End**: Next.js (App Router), React 19.
* **Styling**: Vanilla CSS with professional variables (WSU brand).
* **Database**: Neon Postgres (relational metadata, content, audit logs).
* **Storage**: Vercel Blob (images, documents, temporary imports).

### Security
* **Authentication**: Password-based login with hashed credentials in Postgres.
* **Sessions**: HMAC-signed HTTP-only cookies with sliding expiration.
* **CSRF**: Same-origin enforcement (Origin/Referer) + SameSite: Lax cookies.
* **Rate Limiting**: Applied to login and public search.

---

## 5. Build Plan

### Phase 1: Authentication & User Management — ✅ Implemented (pending live-DB verification)
* ✅ Implement `users` and `kb_user_assignments` tables.
* ✅ Admin UI for managing users and roles (`/admin/users`).
* ✅ Port authentication logic from `wsu-gradschool-smartsheet-viewer`; header identity + Sign out.

### Phase 2: KB Management UI — ✅ Implemented (basic)
* ✅ KB management screen (`/admin/kbs`) to create/edit knowledge bases.
* ⬜ Templates and advanced per-KB settings remain thin.

### Phase 3: Editor Content Evolution — ✅ Implemented
* ✅ **Video Assets**: Video support in the asset library and a "Video Block" in the editor (with YouTube/Vimeo embed parsing), backed by dedicated `video_provider`/`video_external_id`/`video_url` columns (KI-2 resolved).
* ✅ **Card Sections**: Block model refactored to support "Card" containers with reorderable children and style attributes.
* ✅ **Media picker, link dialog, text/image alignment, alt-text editing, and internal editor notes.**
* ✅ **Toolbar Polish**: Toolbar wraps correctly; button hover contrast fixed.

### Phase 4: Navigation Depth & Layout — ✅ Implemented
* ✅ `TableOfContents` and editor metadata support configurable depth (H2 vs H2+H3), recursing into Cards.
* ✅ Responsive 3-column docs layout with a sticky right-rail TOC.

### Phase 5: Production Hardening — ✅ Implemented (one external step: add the CI DB secret)
* ~~Resolve **KI-1**~~ — ✅ done. Live-DB verification of edit locks, atomic reorder, FTS, and
  editor scoping is implemented as the gated suite `npm run test:db` and passes against Neon.
  An atomicity regression found during this work was fixed. A GitHub Actions workflow
  (`.github/workflows/ci.yml`) runs type-check + unit tests on every push/PR and runs the
  live-DB suite when a `DATABASE_URL` repo secret (a Neon **test** branch) is configured.
  **Remaining:** add that secret in GitHub repo settings.
* ~~Close **KI-3**~~ — ✅ done (list-view filtering, owner-only users list, and the two resolve-by-id routes are all guarded).
* ~~Address **KI-2** follow-ups~~ — ✅ all done (video asset model, alt-text column, card-nesting flatten, status-only update, FTS prune index).
* Optional polish: TOC scroll-spy, deeper KB templates/settings.

---

## 6. Acceptance Criteria

1.  **Professionalism**: UI matches WSU brand and feels high-end/stable.
2.  **Accessibility**: WCAG 2.2 AA compliant. No "click here" links or missing alt text.
3.  **Durability**: Asset replacement never breaks a public link. *(✅ Managed videos now also keep a stable public URL — the file route redirects to the canonical video link; see KI-2.)*
4.  **Security**: Only authorized editors can modify assigned KBs, and public search never surfaces staff-only pages. *(✅ Met: editor-scope enforcement on mutations, admin **list-view** filtering, the per-editor `canAccessKb` path, and the staff-visibility FTS prune are all implemented and **verified against live Neon** — see KI-1.)*
5.  **Simplicity**: The system is easier to use and navigate than Confluence.

> **Production-readiness gate:** Criterion 4's live-DB checks (lock-conflict, atomic-rollback,
> FTS-safety, editor scoping) now **pass against a real Neon instance** via `npm run test:db`
> (KI-1 resolved), so criterion 4 is met. Criterion 3 now holds for managed videos too (KI-2 video model resolved).

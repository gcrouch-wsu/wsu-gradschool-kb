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
technical features, and the multi-user/security build phase are implemented. Remaining
work is administrative depth (management UIs) and the production verification noted below.

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

### Built — Pending Live-DB Verification
The following landed in the latest build phase. Logic, type checks, and the in-memory
test suite (81 tests) pass, but the Neon-only paths have **not** been exercised against a
live Postgres instance (see *Known Issues & Verification Gaps*).
* **Auth & Security**: `users` and `kb_user_assignments` tables, HMAC-signed session cookies, and role-based access (Owner/Admin/Editor) with KB-scoping. Admin UI for managing users (`/admin/users`) and KBs (`/admin/kbs`) is present.
* **Video Support**: First-class `video` asset type and editor block; YouTube/Vimeo URL → `embedId`/`provider` parsing; sandboxed, lazy-loaded, `referrerPolicy`-hardened iframes; round-trip serialization.
* **Card Sections**: Recursive `card` block with create/reorder and background styling (Paper / Wash / Crimson). Card titles render as semantic `<strong>` (not headings) to keep the document outline clean. Parser enforces `MAX_NESTING_DEPTH = 3`.
* **Edit Locks**: DB-backed locks with atomic acquisition (`tryAcquirePageLock`), `TIMESTAMPTZ`-owned expiry, a 60s client heartbeat / 2-minute TTL, and **write-path enforcement** — saves and reorders run in a single transaction that rolls back on a lock conflict (no partial/clobbered writes).
* **Search (Postgres FTS)**: `tsvector` + GIN indices, `websearch_to_tsquery` with `:*` prefix/type-ahead, page-over-asset rank bias, a recursive staff-visibility prune so public search cannot leak staff-only pages, and a de-noised block-text extractor that indexes paragraph/heading/list/table/caption text (not raw JSON).
* **Navigation**: TOC depth control (H2 vs H2+H3), recursive into Cards; editor toolbar wrapping.
* **Maintenance**: `assertNever` exhaustiveness guards across the type union, renderer, and both serializers.

### Partially Built
* **Multi-KB Support**: Data model, routes, and a KB management screen (`/admin/kbs`) exist; templates/advanced settings are still thin.
* **Asset Library**: Table view plus a media picker and per-image alt/description editing exist; advanced file management and direct-to-blob large uploads are pending.
* **User Management UI**: Auth backend, roles, and a `/admin/users` screen exist; finer KB-role assignment flows can be deepened.
* **TOC polish**: Right-rail TOC is in place; scroll-spy active-section highlighting is a future enhancement.

---

## Known Issues & Verification Gaps

### KI-1 — Neon/Postgres paths not verified against a live database (High)
The edit-lock enforcement and Postgres FTS features execute **only** when `DATABASE_URL`
is set. The development environment has no configured Neon URL and no local Postgres, so
these paths are proven only by type checks, compiled-query inspection (parameterization
confirmed, no injection), and the documented behavior of the `@neondatabase/serverless`
driver — **not** by live execution.

Specific assumptions still unproven end-to-end:
1. A data-modifying CTE rolls back when its trailing `CASE … ELSE 1 / 0` guard raises (relied on for atomic lock conflict).
2. `sql.transaction([...])` issues `ROLLBACK` on any in-transaction error, making multi-row move/reorder batches all-or-nothing.
3. `NeonDbError.code` surfaces the Postgres SQLSTATE `22012` that the conflict handler keys on.

These are standard Postgres / driver semantics and were validated as far as is possible
without a database, but they must be confirmed before this is considered production-ready.

**Recommended verification (do before production):**
* Provision a throwaway Neon branch, set `DATABASE_URL`, and run the migrations.
* **Lock conflict / no-clobber:** Open a page in session A (acquires the lock). From session B, `PATCH` the same page → expect a 4xx with *"this page is locked by another user or your lock has expired"*, and confirm the row is unchanged.
* **Atomic reorder rollback:** With a child page locked by A, have B reorder that subtree → the whole batch must fail with **no** sibling/descendant rows mutated (proves rollback, not partial write).
* **Lock expiry:** Let A's lock pass its 2-minute TTL without a heartbeat; B should then acquire and save successfully.
* **FTS safety/quality:** Search punctuation-heavy queries (`C++`, `AT&T`, `i-20`, `20% off`) → results, never a 500. Confirm a term that appears only in a list item or table cell is found. Confirm a published page under a `staff` ancestor never appears in public (non-staff) search results.
* Add these as an automated integration suite gated on `DATABASE_URL` (skipped when unset) so CI covers them against a Neon test branch.

### KI-2 — Recommended follow-ups (Medium / Low)
* **Video asset model (Medium)**: Video links are stored in the asset `body`/version model designed for binary blobs (`fileSizeBytes: 0`, synthetic mime). The "replace file without breaking link" guarantee doesn't map to external URLs, and the stable file route would stream the URL as text. Give managed video dedicated columns (`provider`, `external_id`) instead of overloading `AssetVersion.body`.
* **Alt text vs. asset description (Low)**: The "save alt to asset" option writes the image's alt into the asset `description` (no schema change). If alt and the human-facing description need to diverge, add a dedicated `alt_text` column rather than overloading `description`. Alt is otherwise stored per-image on the block, which is correct.
* **Over-deep nesting is dropped, not flattened (Low)**: Card content beyond `MAX_NESTING_DEPTH = 3` is discarded on save rather than flattened. Prefer flattening or an explicit "nesting too deep" message over silent data loss.
* **Status/publish toggle bypasses locks (Low)**: `updatePageStatus` intentionally does not enforce the edit lock (a status flip changes no content or path). Revisit if publish-time races become a concern.
* **FTS visibility subquery scaling (Low)**: The correlated `NOT EXISTS` staff-prune is fine at pilot scale; add an index on `kb_pages(kb_id, visibility, path)` if KBs grow large.

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
* ✅ **Video Assets**: Video support in the asset library and a "Video Block" in the editor (with YouTube/Vimeo embed parsing). *See KI-2 re: the asset storage model.*
* ✅ **Card Sections**: Block model refactored to support "Card" containers with reorderable children and style attributes.
* ✅ **Media picker, link dialog, text/image alignment, alt-text editing, and internal editor notes.**
* ✅ **Toolbar Polish**: Toolbar wraps correctly; button hover contrast fixed.

### Phase 4: Navigation Depth & Layout — ✅ Implemented
* ✅ `TableOfContents` and editor metadata support configurable depth (H2 vs H2+H3), recursing into Cards.
* ✅ Responsive 3-column docs layout with a sticky right-rail TOC.

### Phase 5: Production Hardening — ⬜ Next
* Resolve **KI-1** (live-DB verification of edit locks + FTS) and stand up the gated integration suite.
* Address **KI-2** follow-ups (video asset model, nesting-overflow handling).
* Optional polish: TOC scroll-spy, deeper KB templates/settings.

---

## 6. Acceptance Criteria

1.  **Professionalism**: UI matches WSU brand and feels high-end/stable.
2.  **Accessibility**: WCAG 2.2 AA compliant. No "click here" links or missing alt text.
3.  **Durability**: Asset replacement never breaks a public link. *(Caveat: does not yet hold for video links — see KI-2.)*
4.  **Security**: Only authorized editors can modify assigned KBs, and public search never surfaces staff-only pages. *(Enforcement and the staff-visibility prune are implemented but require the KI-1 live-DB verification before this criterion can be marked met.)*
5.  **Simplicity**: The system is easier to use and navigate than Confluence.

> **Production-readiness gate:** Criteria 3 and 4 depend on the verification described in
> *Known Issues & Verification Gaps (KI-1)*. They are considered **met only after** the
> live-DB lock-conflict, atomic-rollback, and FTS-safety checks pass against a real Neon
> instance.

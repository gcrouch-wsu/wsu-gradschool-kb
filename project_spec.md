# Project Spec: Public Multi-KB Platform with Managed Assets

## 1. Project Overview

This project will create a public knowledge base platform to replace or supplement public Confluence-based Graduate School knowledge base content.

The application will provide clean, accessible public knowledge bases and a focused administrative interface for managing pages, images, documents, imports, redirects, and review workflows. The project is intentionally limited in scope. It is not intended to become a full enterprise CMS, intranet, ticketing system, Jira-integrated support platform, or unrestricted website builder.

The primary goals are:

1. Provide clearer, more polished, and more accessible public KB front ends.
2. Support multiple public knowledge bases from one application.
3. Manage images and documents as first-class assets instead of unmanaged page attachments or external Teams/SharePoint links.
4. Allow staff to replace an asset without breaking public links.
5. Show where each asset is used before replacement, archiving, or metadata changes.
6. Improve accessibility, search, navigation, and content governance.
7. Reduce reliance on Confluence for public-facing knowledge base content.

The core value is not recreating Confluence. The core value is a maintainable public KB system with reliable asset lifecycle management and accessibility built into the editing workflow.

## 2. Intended Users

### Public Users

Public users may include:

* Graduate program coordinators
* Graduate program directors
* Faculty
* Staff
* Prospective or current graduate students
* External partners
* Other WSU users seeking Graduate School procedures or guidance

Public users do not need to log in.

### Administrative Users

Administrative users are approved staff who maintain KB content and assets.

Administrative users should be able to:

* Create and manage knowledge bases, depending on role
* Create and edit KB pages
* Upload and manage documents
* Upload and manage images
* Replace assets without breaking public links
* Review where assets are used
* Archive outdated assets
* Publish, unpublish, archive, and restore pages
* Import content from DOCX and Markdown
* Review and fix imported content before publishing
* Maintain accessible content

## Implementation Status (current repository)

This spec describes the full target system. The current repository is a deployable early MVP slice, not the complete target platform. The sections below separate what is already implemented from what remains so the original project goals are not lost.

### Built in the current early MVP slice

* Next.js 16 / React 19 / TypeScript / App Router application scaffold.
* Vercel-ready project configuration with `npm run build`.
* Public top-level KB list at `/`.
* Public KB home page at `/kb/[kbSlug]`.
* Public article route at `/kb/[kbSlug]/[...pagePath]`.
* Nested page paths and hierarchical page tree rendering.
* Breadcrumbs, table of contents, related pages, and related files.
* Structured block rendering for paragraphs, headings, lists, alert boxes, managed/imported images, and asset links.
* Structured table rendering with captions and header row/header column support.
* Image block rendering honors editor-controlled width.
* Staff-aware visibility model: public pages are visible to everyone; staff-only and draft pages are visible to authenticated admin users.
* Public KB-scoped search at `/kb/[kbSlug]/search` with simple relevance ranking (exact-title > title prefix > title substring > summary > body, plus asset title/description/slug), case-insensitive.
* Public search rate limiting by client key, returning a friendly notice when exceeded (in-memory, per-instance for the MVP).
* Admin sign-in page at `/admin/sign-in`.
* `POST /api/admin/session` for sign in and `POST /api/admin/logout` for sign out.
* Admin dashboard at `/admin` requiring an authenticated session.
* Admin page management screen at `/admin/pages`.
* Admin page editor at `/admin/pages/[pageId]`.
* Imported and seeded pages can be reopened for editing.
* Admins can edit page title, slug, summary, visibility, parent/nesting location, and imported block content.
* Admins can add and edit paragraph, heading, list, alert, image, and table blocks.
* Admins can edit content in WYSIWYG-style block surfaces for paragraphs, headings, lists, alerts, and table cells.
* Text editing surfaces include formatting toolbars for bold, italic, underline, strikethrough, superscript, subscript, links, unlink, and clear formatting.
* Admins can upload images from the page editor into managed image asset records.
* Admins can resize managed image and fallback image URL blocks with constrained width controls.
* Admins can edit table captions, row/column content, header row setting, and header column setting.
* Admins can save an existing page as draft.
* Admins can publish an existing page.
* Moving a page cascades path updates to descendant pages so the page tree remains connected.
* Admin page tree manager supports manual ordering, drag/drop nesting, row-level edit actions, and direct draft publish actions.
* HMAC-signed, HTTP-only admin session cookie with an 8-hour absolute lifetime plus a 60-minute idle timeout (cookie max-age slid forward on each authenticated navigation), `SameSite=Lax`, and `Secure` in production.
* Production auth environment validation for `KB_ADMIN_EMAIL`, `KB_ADMIN_PASSWORD`, and `KB_ADMIN_SESSION_SECRET`.
* Same-origin (Origin/Referer) CSRF enforcement on all state-changing admin routes.
* Login rate limiting keyed by client and account, returning HTTP 429 with `Retry-After` (in-memory, per-instance for the MVP).
* Reserved-slug validation enforced on page create/update, blocking slugs that would collide with application routes; errors surface in the admin UI.
* Accessibility and required-metadata publish gate: publishing is blocked on missing summary/owner/contact/last-reviewed metadata, skipped heading levels, vague link text, empty link destinations, images without alt text, header-less tables, and references to non-active assets. Failures are listed in the page editor and page-tree manager.
* Admin page-editor fields for governance metadata (owner/office, contact email, last reviewed date) so pages can satisfy the publish gate.
* Neon Postgres integration when `DATABASE_URL` is set.
* Development fallback to the seed dataset when `DATABASE_URL` is unset.
* Minimal auto-created database tables for KBs, pages, and assets.
* Automatic seed insertion into an empty Neon database.
* Admin DOCX import screen at `/admin/import`.
* Single-file `.docx` parse API with a 10 MB current route-level limit.
* DOCX import rejects macro-enabled Office formats (`.docm`/`.dotm`) and empty files; imported hyperlinks are restricted to safe schemes (`http`, `https`, `mailto`) by the sanitizer.
* DOCX conversion for headings, paragraphs, lists, tables, supported inline formatting, and supported embedded web images.
* Import preview with block counts, outline, messages, and image thumbnails.
* Import commit flow that lets the admin choose KB, parent path, title, slug, summary, and visibility.
* Imported content is saved as a draft page.
* Optional Vercel Blob upload for supported imported images when `BLOB_READ_WRITE_TOKEN` is configured.
* Imported DOCX images are promoted into managed active image asset records when the imported draft is committed.
* Stable public asset route at `/kb/[kbSlug]/files/[assetSlug]`.
* Stream-first asset delivery for current seed/database asset bodies with `ETag`, `304`, `Cache-Control`, `Content-Type`, `Content-Disposition`, and `X-Content-Type-Options: nosniff`. URL-backed asset bodies are fetched only from the trusted object-storage host (SSRF guard).
* Asset bodies are loaded only by the file-delivery route; list, render, and search queries select asset metadata without the (potentially large) body column.
* Secure response headers through `next.config.ts` and nonce-based Content Security Policy middleware.
* Allowlist-based, DOM-parsed rich-text sanitizer for admin-authored and imported inline formatting (drops all attributes except validated anchor `href`).
* Skip-to-content link, semantic landmarks, visible focus styles, and responsive WSU-themed public styling with a site header, footer, and empty states.

### Partially built

* Multi-KB support: the store and routes support multiple KB records, but there is no KB creation/settings UI yet.
* Persistent storage: Neon is supported for the minimal current tables, but the full schema, migrations, and production invariants are not implemented.
* Asset management: stable asset routes, asset records, page-editor image upload, and imported-image asset promotion exist, but there is no file manager UX, direct-to-blob asset upload, metadata workflow, usage tracking, version table, replacement flow, archive flow, or shared asset workflow.
* DOCX import: single-file parse/preview/commit exists and creates managed image assets for supported embedded media, but it is not a persistent staged-import workflow.
* Security: signed admin cookies with idle timeout, production env validation, same-origin (Origin/Referer) CSRF enforcement, login and public-search rate limiting, CSP, and baseline headers exist; anti-CSRF tokens, a shared/distributed rate-limit store, session-secret rotation handling, managed users, and KB-scoped RBAC are not built.
* Search: KB-scoped search with simple relevance ranking (title/summary/body and asset metadata) exists, but Postgres FTS, alias materialization, and analytics are not built.
* Block model: the renderer and basic editor support a small block subset, but the full editor-facing block JSON schema is not implemented.
* Page editing: metadata (including governance fields: owner, contact, last reviewed date), nesting, manual ordering, draft save, publish with an accessibility/metadata gate, WYSIWYG-style block editing with formatting toolbars, table blocks, managed image insertion, and image resizing are built; final editor polish, page versions, locks, redirects, and audit logging remain unbuilt.

### Not yet built, but still in scope

* User table, KB User Assignment table, owner/admin/editor management, and KB-scoped permission checks.
* Anti-CSRF tokens (same-origin Origin/Referer checks are already enforced), a shared/distributed rate-limit store, and session-secret rotation handling.
* KB management UI and template selection through the admin UI.
* Final WYSIWYG/manual page editor polish beyond the current pragmatic block editor.
* Managed image replacement, stored dimensions, and accessibility metadata beyond current page-editor upload/import promotion.
* Richer KB page section controls for grouping pages under meaningful public navigation headers.
* Draft/published body separation.
* Autosave, manual save, optimistic concurrency tokens, and edit locks.
* Page versions and restore-into-draft.
* Publishing approval workflow: the accessibility and required-metadata gate is built, but version snapshots, edit locks, and audit events on publish are not.
* Page unpublish, archive, and restore controls.
* Asset library/file manager UX.
* Direct-to-blob upload flow for normal assets and large imports.
* Server-side MIME validation, scanner integration if available, and abandoned-blob cleanup.
* Asset versions, replacement workflow, archive workflow, metadata workflow, and restore workflow.
* Per-version image metadata, dimensions, alt text confirmation, captions, decorative flags, and page-level overrides.
* Asset usage tracking, including block-level usage.
* Shared/global assets and cross-KB impact warnings.
* Manual aliases and auto-generated aliases.
* Manual redirects, auto-redirects on slug/parent moves, redirect runtime handling, and redirect CSV staging.
* Persistent staged imports, staged media review, import locks, and staged import deletion.
* Markdown paste/import.
* DOCX hardening beyond current basic file checks.
* Accessible table import/rendering and DOCX table handling.
* Audit log.
* Admin review dashboard widgets for drafts, needs-review, unused assets, broken references, active locks, and import status.
* KB export bundle with structured content, metadata, redirects, aliases, and assets.
* Cache tags and synchronous purge on publish, replace, archive, and search-affecting updates.
* Backup retention settings and documented restore drill.

### Current implementation limitations to keep visible

* The admin model is a single bootstrap account, not managed users.
* The current database schema is intentionally minimal and should be replaced by migrations before production use.
* Imported draft pages are canonical draft pages immediately after commit; there is no saved staging table yet.
* Publishing runs an accessibility and required-metadata gate, but still changes a page from draft to published without an approval check, version snapshot, lock, or audit event.
* Page movement updates descendant paths but does not yet create redirects from prior URLs.
* Imported images are promoted into managed image assets on draft commit, but there is no persistent staged-media review before commit.
* The current DOCX upload path goes through a route handler and is limited to 10 MB; the target system still requires direct-to-blob for larger imports.
* Seed/database document asset bodies are text-backed placeholders; real versioned Blob-backed document assets are not built. Managed image assets can currently store Blob URLs or data-backed bodies.
* Search is useful for the pilot shell but does not implement the target ranking, aliases, or Postgres FTS.
* Page tree ordering is now manually controllable, but redirects, audit logging, impact review, and section-template rules are not yet applied to tree changes.
* Staff-only pages are an admin-preview convenience in the current build. The target public model still treats public users as unauthenticated and should not expose private KB content.

Subsequent sections continue to describe the target state. This status section is the source of truth for what is currently implemented in the repository.

## 3. Scope

### In Scope

The application will include:

* Multi-KB support
* Top-level public KB list
* Public KB home pages
* Public page tree or section-based navigation per KB
* Public search scoped to the current KB
* Individual KB article pages
* Managed asset library for documents and images
* Stable public asset URLs
* Asset replacement with version history
* Asset usage tracking across pages and KBs
* KB-scoped assets by default
* Explicitly shared/global assets when needed
* Basic admin area
* Owner, admin, and editor roles
* KB-level user assignments
* Draft, published, and archived states for KBs and pages
* Draft, active, and archived states for assets, with separate version history
* Import staging for single-file DOCX, Markdown, and redirect CSV imports
* Accessibility-focused page templates and components
* Responsive design for desktop and mobile
* Required metadata for pages and assets
* Related pages and related files
* Basic redirect handling from older URLs
* Audit logging for major admin actions
* Page version restore workflow
* Edit locks for pages, assets, and staged imports

### Out of Scope

The application will not include:

* WSU SSO in the MVP
* Jira integration
* Confluence synchronization after migration
* Internal ticketing
* User comments
* Discussion threads
* Complex approval workflows
* Personalized dashboards
* Role-specific public content
* Private KB content
* Enterprise document management
* Full WordPress-style theming
* Automatic legal or policy validation
* Legacy `.doc` import without prior conversion to `.docx`
* LaTeX import in the MVP
* Batch DOCX import in the MVP
* Global public search in the MVP
* Asset-version restore UI in the MVP
* Automated background link-check analytics in the MVP

## 4. Recommended Technology Stack

### Front End and Application Framework

* Next.js
* React
* TypeScript
* App Router
* Controlled rich-text/block editor
* Structured block JSON as the canonical page content format

### Hosting

* Vercel or an equivalent Node/Next.js-capable hosting platform

### Database

Use PostgreSQL for relational metadata, content, versions, permissions, redirects, imports, audit logs, and search indexes.

Recommended option:

* Neon Postgres or another managed PostgreSQL provider

The database stores metadata and structured page content. Large binary files are stored in object storage, not in the database.

### File Storage

Use Vercel Blob or equivalent object storage for images, documents, and temporary import files.

Files should not be exposed only through raw storage URLs. The application should create stable public routes that point to the current active asset version.

Example:

```text
/kb/graduate-school/files/graduate-program-handbook-template
```

This route should continue to work even when the underlying document is replaced.

Uploads larger than normal serverless request-body limits must use a direct-to-object-storage upload flow. The application should issue a short-lived upload token or signed upload target, then validate the uploaded object server-side before it can become active.

### Authentication

WSU SSO is not part of the MVP because it is not currently easy to implement.

Use the same admin management pattern as the existing Graduate School Smartsheet Viewer:

* Bootstrap owner account from environment variables
* Owner-managed admin accounts
* Managed users stored in Postgres in production
* Local JSON storage only as a development fallback
* Signed HTTP-only admin session cookies
* Middleware protection for `/admin` and `/api/admin/*`
* Role checks in server-side page and API handlers

Public KB pages and public active assets do not require authentication.

The app should fail to start in production if durable Postgres-backed admin/config storage is unavailable. Local JSON fallback is for development only.

Session/security requirements:

* Admin cookies are HTTP-only, secure in production, and SameSite=Lax or stricter.
* Admin sessions should have a fixed lifetime and an idle timeout. Recommended defaults are 8 hours fixed lifetime and 60 minutes idle timeout.
* State-changing admin routes require CSRF protection, such as a same-site cookie plus custom header or another explicit anti-CSRF token strategy.
* Admin login is rate-limited by username and client key.
* Public search is rate-limited to reduce abuse.
* Failed login attempts are recorded for rate-limiting, but configuration/outage failures should not lock users out.
* MFA is deferred until SSO or a managed authentication provider is adopted.
* Bootstrap owner credential rotation and session-secret rotation should invalidate existing sessions.

## 5. Core Design Principles

The application should separate:

1. Public page display
2. Structured page content
3. Asset storage
4. Asset metadata
5. Stable public asset routing
6. Asset usage tracking
7. Import staging
8. Publishing and accessibility validation

The most important asset-management principle is:

> Staff should be able to replace a document or image once, and every KB page linking to that asset should automatically continue to point to the current active version.

The most important accessibility principle is:

> Content should not be publishable when required accessibility metadata or structural checks are missing.

The most important migration principle is:

> Imported content should be staged and reviewed before it becomes canonical KB content.

## 6. Roles and Permissions

### Roles

Recommended roles:

```text
owner
admin
editor
```

### Owner

The owner owns the entire application and all KBs.

Owners can:

* Create KBs
* Select developer/config-managed KB templates
* Assign KB admins
* Manage all users and roles
* Access all KBs
* Access all audit logs
* Manage system-level settings
* Force-release stale locks
* Manage shared/global assets

### Admin

Admins are assigned to specific KBs.

Admins can, within assigned KBs:

* Manage KB settings allowed by the selected template
* Assign editors to that KB
* Create, edit, publish, unpublish, archive, and restore pages
* Upload, edit, activate, replace, archive, and restore assets
* Manage imports
* Manage redirects
* View audit logs for assigned KBs
* Force-release stale locks within assigned KBs

Admins cannot manage app-wide owner settings unless they are also owners.

### Editor

Editors are assigned to specific KBs.

Editors can, within assigned KBs:

* Create and edit pages
* Publish pages directly
* Upload and edit assets
* Activate assets when required metadata is complete
* Create and activate redirects
* Manage staged imports
* View usage information for assets available to that KB
* Release their own active locks

Editors cannot manage users, app-wide settings, unpublish/archive pages, replace/archive active assets, or force-release another user's lock.

### Capability Matrix

| Capability | Owner | KB Admin | KB Editor |
| --- | --- | --- | --- |
| Create KB | Yes | No | No |
| Select KB template | Yes | No | No |
| Assign KB admins | Yes | No | No |
| Assign KB editors | Yes | Assigned KBs | No |
| Manage app settings | Yes | No | No |
| Manage KB settings allowed by template | All KBs | Assigned KBs | No |
| Create/edit draft pages | All KBs | Assigned KBs | Assigned KBs |
| Override public updated date | All KBs | Assigned KBs | Assigned KBs |
| Publish pages | All KBs | Assigned KBs | Assigned KBs |
| Unpublish/archive pages | All KBs | Assigned KBs | No |
| Restore page version to draft | All KBs | Assigned KBs | Assigned KBs |
| Manage aliases | All KBs | Assigned KBs | Assigned KBs |
| Upload draft assets | All KBs | Assigned KBs | Assigned KBs |
| Edit asset metadata | All KBs | Assigned KBs | Assigned KBs |
| Activate draft assets | All KBs | Assigned KBs | Assigned KBs |
| Replace active assets | All KBs | Assigned KBs | No |
| Archive active assets | All KBs | Assigned KBs | No |
| Hard-delete unused draft assets | All KBs | Assigned KBs | No |
| Duplicate asset into a KB | All KBs | Assigned KBs | Assigned KBs |
| Manage shared assets | Yes | Only if assigned to all affected KBs | No |
| Create/activate redirects | All KBs | Assigned KBs | Assigned KBs |
| Manage staged imports | All KBs | Assigned KBs | Assigned KBs |
| View audit logs | All KBs | Assigned KBs | No |
| Release own lock | Yes | Yes | Yes |
| Force-release another user's lock | Yes | Assigned KBs | No |

When a capability affects multiple KBs, the user must have sufficient permission for every affected KB unless the user is an owner.

## 7. Knowledge Bases

The app is multi-KB from the start.

Each KB should include:

```text
id
title
slug
description
status
template_key
created_at
updated_at
published_at
archived_at
```

`template_key` is immutable after KB creation in the MVP. Template migration tooling, if needed later, must validate existing pages against the new template before switching.

Recommended KB statuses:

```text
draft
published
archived
```

Only published KBs are visible publicly.

Top-level public behavior:

* `/` or another top-level route lists published public KBs.
* Each KB has its own public URL.
* External websites can link directly to a specific KB.

Example routes:

```text
/kb/graduate-school
/kb/graduate-school/admissions
/kb/graduate-school/admissions/managing-admission-in-mywsu
/kb/graduate-school/files/graduate-program-handbook-template
/kb/graduate-school/search
```

Archiving a KB hides the KB and its pages from public access, while preserving everything for admin recovery. Asset statuses should not be automatically changed when a KB is archived because assets may be shared with other KBs.

If an archived KB hosts shared assets currently referenced by published pages in other KBs, the system must block the archive until those shared assets are reassigned to another home KB or removed from outside published usage. The MVP should list each affected shared asset and every outside published usage before the archive can continue.

### Slug and Route Rules

Slug rules must be defined before routing is implemented.

Recommended rules:

* KB slugs are globally unique.
* Page slugs are unique among siblings within the same KB.
* Asset slugs are unique within their home KB.
* Redirect `old_url` values are unique among active redirects within the same KB.
* Page URLs are derived from the ancestor path, not from a separate section model.
* The system should use pages for both section landing pages and article pages. There is no separate section entity in the MVP.

Reserved slugs must be blocked at every page path level where they would collide with application routes:

```text
files
search
tags
archive
admin
api
new
edit
preview
```

KB slugs should also reject top-level reserved values such as `admin`, `api`, `search`, `new`, `edit`, and any current or planned top-level application route.

Changing a published page slug or moving a published page to a different parent changes its public URL and must automatically create a redirect from the prior URL to the new canonical URL.

### Page Tree and Section Control

The admin interface must let editors and admins control how pages are grouped and ordered in the public KB navigation.

Requirements:

* Pages can be grouped under meaningful section headers or section landing pages.
* The MVP continues to use pages as section landing pages rather than adding a separate section entity unless pilot content proves a separate model is needed.
* Editors can move pages by selecting a parent in a form and, in the richer admin UI, by drag/drop in the page tree.
* Drag/drop must support both vertical reordering among siblings and nesting under a different parent.
* Every page should have a `sort_order` within its sibling group so public navigation is not forced to sort alphabetically.
* Moving a published page or changing sibling order should be intentional and should show an impact summary before save.
* Moving a published page to a different parent must follow the redirect rules for changed URLs.
* Drag/drop must be keyboard accessible or provide an equivalent accessible move/reorder control.

## 8. Templates and Components

KB templates are developer/config-managed at first. This protects accessibility and prevents uncontrolled layouts.

Templates define:

* Allowed page structures
* Allowed components
* Required metadata
* Navigation defaults
* Accessibility checks
* Lock timeout bounds
* Search behavior defaults
* Asset rules

Owners can select a template when creating a KB. Owners/admins can configure content and assignments, but cannot weaken template accessibility constraints through the UI.

Every KB should have a universal baseline component set:

* Text
* Headings
* Lists
* Links
* Accessible tables
* Images
* File links
* Alert boxes
* Contact boxes
* Related files
* Related pages

Templates may enable additional approved components as they are developed.

Editors cannot add arbitrary HTML or unapproved layout patterns.

## 9. Content Model

Canonical page content should be stored as structured rich-text/block JSON in the database.

Reasons:

* Supports WYSIWYG editing
* Makes accessibility validation easier
* Enables reliable asset usage tracking
* Prevents arbitrary inaccessible HTML
* Supports import from DOCX and Markdown
* Supports future export to DOCX, PDF, or Markdown
* Allows controlled components

Markdown and DOCX are import formats, not the source of truth.

### Expected Block Types

The exact JSON shape may follow the selected editor library, but the application needs a stable semantic block contract.

Every block should include:

```text
block_id
type
attrs
children/content
```

Minimum MVP block types:

```text
paragraph
heading
bulleted_list
numbered_list
link
image_block
file_link_block
table
alert_box
contact_box
related_pages_block
related_files_block
```

Required semantics:

* `heading` includes a heading level.
* `link` includes label text, validation status, and either a managed target reference or an external URL.
* `image_block` includes `asset_id` and optional page-level alt text, caption, and decorative overrides.
* `image_block` includes editor-controlled display sizing, recommended as constrained width or size preset rather than arbitrary pixel stretching.
* `file_link_block` includes `asset_id` and optional override label.
* `table` includes header row/column metadata sufficient for accessible rendering.
* `table` supports adding/removing rows and columns, header rows/columns, captions where useful, and plain text or approved inline content inside cells.
* `alert_box` includes an approved variant.
* `related_pages_block` and `related_files_block` reference managed records, not raw URLs.
* Blocks that reference assets must have stable `block_id` values so usage rows can point to their location.

Template configuration determines which block types are available in a KB.

Internal links to KB pages or managed assets must reference the target by record ID, not by URL string:

```text
target_kind
target_id
```

Recommended internal link target kinds:

```text
page
asset
```

The public URL is resolved at render time from the current canonical target. External links store the raw URL. The publish gate treats an internal link whose target is missing, draft, archived, or outside the allowed KB context as broken. Page-version snapshots may record the rendered URL for historical context, but live links resolve by target ID.

Recommended link validation statuses:

```text
ok
broken
internal_missing
external_unverified
```

## 10. Data Model

### Page

Each KB page should include:

```text
id
kb_id
title
slug
parent_page_id
sort_order
summary
published_body_blocks
draft_body_blocks
status
owner_label
contact_email
last_reviewed_date
next_review_date
updated_display_date
current_published_version_id
draft_revision_token
created_at
updated_at
published_at
archived_at
locked_by_user_id
locked_at
lock_expires_at
```

Recommended page statuses:

```text
draft
published
archived
```

Required before publication:

* title
* slug
* summary
* owner
* contact email or office
* last reviewed date
* valid heading structure
* no unresolved broken/internal links
* all referenced assets active
* effective alt text or decorative flag for every meaningful image

Owner/contact/review metadata is required for governance but does not need to be shown publicly. Public pages should show an "Updated on" date.

`published_body_blocks` are the blocks rendered on the public page. `draft_body_blocks` are the blocks currently being edited. Immediately after publish, `draft_body_blocks` should match `published_body_blocks` until the next draft save. Autosave and manual save must never mutate the public page until an intentional publish action succeeds.

`draft_revision_token` is used for optimistic concurrency. Draft saves, autosaves, and publishes must reject stale writes if the token no longer matches the current draft state.

The server returns a new `draft_revision_token` after every successful draft save, autosave, publish, or restore. Clients must include the latest token on every save. On mismatch, the server rejects the write and returns the current token/state so the client can prompt the user before retrying.

`owner_label` should be a stable office/person label rather than a required foreign key to a user account, because content ownership can outlive staff account changes. Validate it as a non-empty office/person label. `contact_email` should be a valid email address where used.

`updated_display_date` is the public "Updated on" date. It may differ from `updated_at` because metadata-only admin edits should not always change the public freshness signal. Publishing should default it to the publish date, while allowing an authorized editor/admin to set it intentionally when appropriate.

Any user who can edit the page may intentionally override `updated_display_date`. Overrides should create an audit-log entry.

Publishing creates a `PageVersion` and updates `current_published_version_id` atomically in the same transaction.

### Page Version

Formal page versions should be created on publish and other meaningful lifecycle changes.

```text
id
page_id
version_number
title
slug
summary
published_body_blocks
metadata_snapshot
created_by
created_at
reason
```

Working draft saves and autosaves should update the current draft without creating a formal version for every save.

Restoring a page version should create a draft first. Republish must be intentional.

A restored draft inherits the historical version's content but not its URL. By default, `slug` and `parent_page_id` remain the page's current live values rather than the snapshotted historical values. Editors can change them before publish if intended, and those changes then follow the normal slug/parent auto-redirect rules. This prevents a restore from silently relocating a page.

If the restored page references draft, archived, or unavailable assets, publishing is blocked until those references are fixed or the assets are made active.

Pages should not be hard-deleted in normal operation. Published pages should be archived, not permanently deleted. If hard delete is ever added for draft-only pages, it must create an audit entry and clean up orphaned redirects, relationships, and staged references.

`published_at` records the timestamp of the most recent successful publish and is not cleared on unpublish or archive. The page's current public state is determined by `status`, never by inspecting `published_at`. `current_published_version_id` is cleared on unpublish and archive so renderers and integrity checks have a single yes/no signal for public availability.

On unpublish, retain `published_body_blocks` for recovery/admin preview and hide the page publicly. On archive, retain page content and version history, hide the page publicly, and preserve audit history. Public renderers must check `status`, not the presence of `published_body_blocks`, before serving a page.

### User

Users represent admin users who can sign in to the application.

```text
id
email
display_name
password_hash
status
is_owner
last_login_at
created_at
updated_at
```

Recommended user statuses:

```text
active
disabled
```

Owner is an app-wide boolean on the user record, not a KB assignment row. Owner-managed password reset, disable, and removal flows should follow the existing Graduate School Smartsheet Viewer pattern. Bootstrap owner credential recovery is performed by rotating environment variables and redeploying/restarting the app.

On application start, if no user row has `is_owner = true`, the app creates a bootstrap owner from environment-provided owner credentials. If those environment credentials change while the bootstrap owner row already exists, the existing row's credentials should be updated and all sessions for that user invalidated.

### KB User Assignment

KB user assignments grant KB-scoped admin/editor access.

```text
id
kb_id
user_id
role
created_at
created_by
```

Recommended assignment roles:

```text
admin
editor
```

Owners do not need KB assignment rows because they have app-wide access.

A user has at most one KB user assignment per KB. Promoting an editor to admin updates the existing row in place rather than creating a second assignment.

### Asset

Assets represent stable public items. Actual uploaded files may change over time.

```text
id
home_kb_id
scope
title
slug
description
asset_type
mime_type
status
file_size_bytes
owner_label
last_reviewed_date
validation_status
created_at
updated_at
activated_at
archived_at
locked_by_user_id
locked_at
lock_expires_at
```

Recommended asset scopes:

```text
kb
shared
```

Recommended asset statuses:

```text
draft
active
archived
```

Old file versions are not publicly accessible. They are retained for admin rollback/audit only.

KB-scoped assets are the default. Shared assets are explicitly marked and may be reused across KBs.

The source of truth for the current file is the single active asset version. The implementation must enforce that each active asset has exactly one active current version. If convenience fields such as `current_blob_url` or `current_filename` are later denormalized onto the asset record, they must be derived from the active version and updated in the same transaction.

Recommended asset validation statuses:

```text
pending
scanning
clean
failed
quarantined
```

Asset activation requires `validation_status = clean`. If no institutional scanner is configured, MIME/type validation may set the status to `clean`; do not activate assets with `pending`, `failed`, or `quarantined` validation.

Recommended asset types:

```text
document
image
```

Default asset version retention should keep at least the most recent versions and a reasonable time window, such as the last 10 versions or 24 months, whichever retains more. Owners should be able to adjust retention later if storage cost or records policy requires it.

### Asset Version

Each time an asset is replaced, create a new version record.

```text
id
asset_id
version_number
blob_url
original_filename
mime_type
file_size_bytes
width
height
uploaded_by
uploaded_at
notes
status
```

Recommended asset version statuses:

```text
draft
active
replaced
archived
```

Restoring an old asset version should create a draft replacement version. Activation must be intentional and must use the same impact review rules as normal replacement.

For MVP, display asset version history but defer the restore-old-asset-version UI unless needed during pilot migration.

Asset version invariants:

* An active asset must have exactly one active/current asset version.
* A draft asset may have zero or more draft versions until activation.
* An asset should not have more than one draft replacement version open for activation at the same time.
* Replaced versions are retained for admin rollback/audit only and are not publicly accessible.
* Image versions should store intrinsic width and height when available so public rendering can avoid layout shift.
* When a new version becomes active, the previously active version transitions to `replaced` in the same transaction.
* Current version is derived from `status = active`; do not store a separate `is_current` column in MVP.

### Image Metadata

Images require accessibility metadata.

```text
asset_id
asset_version_id
default_alt_text
default_caption
default_decorative
```

Image metadata is version-aware. If an image is marked decorative, alt text may be empty. If it is not decorative, default alt text is required before activation.

On image replacement, the user must explicitly confirm or update default alt text before activating the new version. If the prior default alt text is reused, the UI should make that an intentional choice, not a silent carry-forward.

The `(asset_id, asset_version_id)` pair is unique. Editing default alt text, caption, or decorative status for the current active image version updates that row in place. Image metadata rows for non-current versions are read-only. When a draft replacement version is created, its image metadata row may be initialized from the prior version's values, but those values must be explicitly confirmed before activation.

Page image blocks may override alt text, caption, or decorative status for context-specific use. Publishing checks the effective image metadata for each image block.

When editing an asset default alt text, show:

* total usage count
* usages using default alt text
* usages with page-level overrides
* warning that overrides will keep their custom alt text

### Page Asset Relationship

Pages should link to assets through asset records, not raw object-storage URLs.

```text
id
page_id
asset_id
block_id
relationship_type
display_order
context_metadata
```

Relationship types may include:

```text
inline_image
inline_link
related_document
related_image
download
template
```

The asset library must show usage before risky actions:

* KB
* page title
* page status
* usage type
* whether image usage uses default alt text or override
* whether replacement or archiving affects multiple KBs
* block or location context where available

Page asset relationship rows should be regenerated deterministically from `draft_body_blocks` on save and from `published_body_blocks` on publish. The block JSON should include stable block IDs so usage reports can point to where an asset is used on a page.

Live page-to-asset relationships reference `asset_id` only. Rendering always resolves the current active asset version. Historical page versions may snapshot the asset version that was active at publish time inside `metadata_snapshot` or a separate version-snapshot table, but live page relationships must not pin to `asset_version_id`.

For block-based usage tracking, enforce one live relationship per `(page_id, block_id)` when the block references a single asset.

### Tags

Tags are deferred for MVP unless needed by the pilot. If enabled later, model them explicitly with `tags`, `page_tags`, and `asset_tags` tables rather than embedding ad hoc strings in block content.

### Staged Import

Staged imports are first-class KB-scoped records.

```text
id
kb_id
source_type
original_filename
temporary_blob_url
status
created_by
created_at
updated_at
locked_by_user_id
locked_at
lock_expires_at
error_summary
```

Recommended staged import statuses:

```text
uploaded
parsed
needs_review
failed
committed
```

Staged imports are hard-deleted after successful commit or manual deletion, with an audit-log entry retained. Do not retain a long-lived `deleted` staged import row in MVP.

Recommended staged import source types:

```text
docx
markdown
redirect_csv
```

Staged import media should include:

```text
id
staged_import_id
temporary_blob_url
detected_mime_type
original_filename
proposed_title
proposed_slug
width
height
review_status
metadata_draft
created_asset_id
```

Recommended staged import media review statuses:

```text
pending
approved
rejected
```

Staged import records and media are deleted after successful commit or manual deletion.

### Alias

Aliases improve search for renamed or legacy content without creating duplicate public results.

```text
id
kb_id
target_type
target_id
alias_text
source
created_at
created_by
```

Recommended alias sources:

```text
manual
slug_change
title_change
redirect_import
confluence_import
```

Recommended alias target types:

```text
page
asset
```

Auto-generation rules:

* Slug changes create an alias for the old slug unless an equivalent alias already exists.
* Title changes may create an alias for the old title when the old title was public-facing.
* Redirect imports may create aliases when a useful old title or slug can be derived.
* Aliases are de-duplicated case-insensitively within the same target.

### Audit Log

Audit logs are append-only records.

```text
id
kb_id
actor_user_id
action_type
target_type
target_id
before_metadata
after_metadata
reason
created_at
```

Rules:

* Audit records should not be updated or deleted through the application UI.
* Owner can export all audit logs.
* KB admins can export audit logs for assigned KBs.
* Retention should be defined before launch; default recommendation is retain MVP audit logs indefinitely unless institutional policy requires a shorter period.
* Audit logs may contain names, emails, and content metadata, so exports should be treated as administrative data.

## 11. Asset Lifecycle

### Activation Requirements

Active document assets require:

* title
* slug
* owner
* last reviewed date
* description
* file type
* file size
* current active version

Active image assets require:

* title
* slug
* owner
* last reviewed date
* default alt text or decorative flag
* current active version

### Public Display

Public file links/cards should display useful metadata automatically:

* title
* description when shown as a card/list item
* file type
* file size
* updated date when useful

Captions for images are page/context-controlled. An asset may have a default caption, but page editors choose whether to show it, override it, or show no caption.

### Replacement

Asset replacement should work as follows:

1. Admin or owner opens an existing active asset record.
2. User selects "Replace file."
3. Application shows asset usage and impact review.
4. User uploads the new file.
5. Application creates a draft asset version.
6. User reviews metadata and impact.
7. User activates the draft version.
8. Application marks the new version current.
9. Stable public asset route remains unchanged.
10. All pages using the asset now point to the current active version.

If an asset is shared across multiple KBs, replacement requires a multi-KB impact warning. Replacement should be allowed only for an owner or for an admin with sufficient access to all affected KBs.

Editors can view asset usage and metadata but cannot replace active assets in the MVP. If needed later, editors may get a "request replacement" workflow.

### Archiving

Published/active assets should generally not be permanently deleted.

Preferred behavior:

* Allow archiving.
* Show usage impact before archiving.
* If archived asset is used on a public page, hide that public link/image and notify the editor/admin.
* Prevent silent broken public links.
* Allow permanent deletion only for unused draft assets and temporary staging files.

If an archived asset is restored without changing the file, clear `archived_at` and return the asset to active status after validation/metadata checks pass. A new asset version is not required for a simple unarchive.

For MVP, notification can be handled through the admin dashboard's broken/missing asset reference widget rather than email. Inline image blocks pointing at archived assets should render an accessible placeholder such as "Image unavailable" with no broken `<img>`. File link blocks pointing at archived assets should render as plain text or be hidden according to template rules, with an admin-visible warning.

## 12. Import Workflow

### Supported MVP Import Types

The MVP should support:

* Manual/WYSIWYG editing
* Markdown paste/import
* DOCX import
* Redirect CSV import

Legacy `.doc` files should be converted to `.docx` before import.

LaTeX import is out of scope for MVP unless a real content set requires it.

### DOCX Import

DOCX import must use staging.

MVP import behavior:

* User starts import inside a selected KB.
* User uploads one DOCX file.
* Application creates one staged import for that DOCX.
* Staged imports are visible to editors assigned to that KB, admins assigned to that KB, and owners.
* Staged imports remain until completed or manually deleted.
* Deleting a staged import deletes its temporary extracted files/images.

Batch DOCX import can be added after the single-file review workflow is reliable.

DOCX import should extract:

* title candidates
* heading structure
* body text
* lists
* tables where feasible
* links
* embedded images
* image dimensions where useful

Imported embedded images should become staged import media that can be committed into managed assets, not anonymous blobs inside page content.

During import review, the editor/admin should review:

* page title
* page slug
* summary
* owner/contact
* page parent/location
* extracted body content
* extracted images
* proposed asset titles
* proposed asset slugs
* alt text or decorative status
* captions when useful
* skipped heading levels
* vague links
* tables without headers
* stale or broken links
* internal Confluence/local file paths

The review process should allow an imported low-resolution image to serve as a placement anchor. The editor/admin can later replace the image asset with a better version without rebuilding the page.

Committing a staged import creates:

* a draft page
* draft or active assets as explicitly approved
* page-to-asset relationships

Import commit does not publish the page. Publishing is separate and intentional.

After successful commit, delete the temporary original DOCX and temporary extracted staging files. The canonical record is the KB page plus managed assets.

### Markdown Import

Markdown import should also normalize into structured blocks.

Markdown import should flag:

* raw HTML
* skipped heading levels
* vague links
* broken/internal links
* unsupported components

### Redirect CSV Import

Redirect CSV import should support at minimum:

```text
old_url
new_url
status
notes
```

Redirect CSV import should use staging.

Rules:

* Validate that `new_url` points to an existing page, asset, or valid external URL before activation.
* Invalid rows import into staging for correction or deletion.
* Editors, admins, and owners can view and fix redirect staging for assigned KBs.
* Editors can activate redirects within assigned KBs.
* Duplicate active redirects for the same `old_url` in the same KB are blocked.

## 13. Public Routes

Recommended public routes:

```text
/
/kb/[kbSlug]
/kb/[kbSlug]/search
/kb/[kbSlug]/files/[assetSlug]
/kb/[kbSlug]/[...pagePath]
```

Optional routes:

```text
/kb/[kbSlug]/archive
/search
```

Tag routes are deferred unless tags are explicitly enabled for the pilot.

### File Route Behavior

The route:

```text
/kb/[kbSlug]/files/[assetSlug]
```

should resolve the requested asset by KB and slug, locate the current active version, log useful analytics where appropriate, and stream the current active file through the application route.

Streaming-first preserves the stable URL guarantee end-to-end. The underlying object-storage URL should not be exposed to public clients.

Recommended response behavior:

* `Cache-Control: public, max-age=60, stale-while-revalidate=300`
* `ETag` derived from the active asset version ID
* correct `Content-Type`
* correct `Content-Disposition` for inline versus download behavior
* route/cache invalidation on asset replacement or archive

After an asset replacement or archive, the system must issue the cache-tag purge synchronously and verify the platform accepted the purge before returning success to the admin. A longer stale-while-revalidate window may be enabled later after purge reliability and traffic patterns are measured.

Stable URLs are immediate from the CDN's perspective after a verified purge, but individual user browsers may continue to serve a previously fetched version for up to `max-age + stale-while-revalidate`, about 6 minutes with the recommended defaults. Replacements intended to correct dangerous content should be paired with an out-of-band notice rather than relying on instant browser cache turnover.

The public asset URL should remain stable even if the underlying file changes.

Streaming assets through serverless/application routes has cost and timeout implications for very large or high-traffic files. The MVP should use stream-first delivery to preserve stable URLs and cache control. After traffic data exists, the app may add short-lived signed CDN/object-storage URLs for very large or high-volume assets while preserving the stable KB route as the entry point.

### Shared Asset URL Behavior

Shared assets have one canonical public URL under their home KB:

```text
/kb/[homeKbSlug]/files/[assetSlug]
```

Pages in consuming KBs reference the shared asset by ID and render links to the canonical home-KB URL. The system should not mint separate public URLs for the same shared asset under every consuming KB. This keeps redirects, analytics, caching, and usage reporting predictable.

## 14. Public KB Features

### Top-Level KB List

The top-level public page should list published KBs only.

Draft and archived KBs are hidden from public users.

### KB Home Page

Each KB home page should include:

* KB title
* Short description
* Search box scoped to the KB
* Major categories or sections
* Recently updated pages, optional
* Common documents or templates, optional
* Contact/help link, optional

### Page Layout

Each KB page should include:

* Page title
* Summary
* Breadcrumbs
* Section navigation
* Main content
* Related pages
* Related files
* Updated on date
* Optional print button
* Optional report-an-issue link

Owner/contact/review metadata can remain admin-only unless a KB template chooses to display it.

### Navigation

The application should support a simple hierarchy:

```text
Category
  Page
    Child Page
```

Two or three levels should be enough for most KB content.

### Search

Public search should be scoped to the current KB in the MVP.

Global public search across all published KBs is deferred until after the pilot unless a clear launch need appears.

Recommended MVP search engine:

* PostgreSQL full-text search plus `pg_trgm` for basic fuzzy matching.
* Index only published pages and active assets.
* Rebuild/update index records on publish, unpublish, archive, asset activation, asset archive, alias changes, and redirect-to-alias changes.
* Use a simple ranking model at first: exact title, title, alias, summary, body, asset metadata.
* Materialize aliases into each page/asset search vector at index time so alias ranking does not require runtime joins.

If search quality becomes a major requirement later, evaluate Meilisearch, Typesense, or Algolia as a dedicated search service.

Search should include:

* Page titles
* Page summaries
* Page body content
* Tags
* Aliases
* Asset titles
* Asset descriptions
* Asset filenames

MVP search results should prioritize:

1. Exact current title matches
2. Page title matches
3. Alias matches
4. Tag matches, if tags are enabled
5. Summary matches
6. Body content matches
7. Asset matches

Redirect records should not appear as normal public search results. Redirects are request-routing plumbing, not content. Admin search should be able to search redirects for maintenance.

### Aliases

Pages and assets should support aliases.

Aliases may include:

* old titles
* old slugs
* common abbreviations
* legacy Confluence names
* imported redirect labels when available

Aliases are included in search ranking but do not display as separate public results. Results point to the current canonical page or asset.

Aliases should be both automatically generated and manually editable.

Redirects and aliases have different jobs:

* Redirects route old URLs to current URLs.
* Aliases help search find current content by old or alternate names.

When a published page or active asset URL changes, the system should create both a redirect and an alias where useful. Redirect import may also create aliases when a reliable old title or slug can be derived.

## 15. Admin Features

### Admin Dashboard

The admin dashboard should show information scoped to the current user:

* Assigned KBs
* Draft pages
* Recently updated pages
* Pages needing review
* Recently uploaded assets
* Assets not used on any page
* Broken or missing asset references
* Staged imports needing review
* Staged redirects needing review
* Archived content
* Active locks

### Page Management

Admins and editors should be able to:

* Create a page
* Edit a page
* Save manually
* Autosave
* Preview a page
* Publish a page
* Restore a prior page version into draft
* Assign a parent page
* Set sort order
* Add summary
* Add owner/contact
* Add last reviewed date
* Add related pages
* Add related files
* Manage aliases
* Reorder pages by drag/drop in the page tree
* Change page nesting by drag/drop in the page tree
* Use accessible non-drag controls for the same reorder/move operations
* Create and manage section landing pages or section headers according to the KB template

Admins and owners should also be able to:

* Unpublish a page
* Archive a page

### Content Editor

The editor should be controlled and accessible.

Recommended approach:

* WYSIWYG/block editor
* Structured output
* Preview pane
* Limited approved components
* No arbitrary HTML by default
* Strong accessible table editing, including header rows/columns and captions
* Managed image insertion with resize controls based on safe size presets or constrained width
* Keyboard-accessible page tree controls for reorder and nesting

The editor should support both autosave and manual save. Publishing is separate from saving.

### File Manager / Asset Library

Admins and editors should be able to:

* Upload a new asset
* Edit asset title
* Edit asset description
* Edit asset slug
* View asset version history
* See which pages and KBs use an asset
* See whether image usages use default alt text or overrides
* Add default alt text for images
* Add default captions for images
* Mark decorative images
* Manage page-specific image overrides from the page editor
* Duplicate assets into a KB when an independent copy is needed

Admins and owners should also be able to:

* Replace the current active asset version
* Archive an active asset

Asset-version restore UI is deferred beyond MVP.

MVP usage filters should include:

* KB
* page status
* usage type
* default alt text versus override

Advanced bulk operations may be added later.

## 16. Locks and Collaboration

Pages, assets, and staged imports should use a check-out lock.

Rules:

* Opening an item for editing checks it out to that user.
* Other users can view read-only state and see who holds the lock.
* Locks can be released manually.
* Locks expire after inactivity.
* Autosave and active editing refresh the lock.
* Admins/owners can force-release stale locks.
* Lock timeout is global in the MVP.
* Autosave interval is global.

Locking must be backed by optimistic concurrency, not only UI state.

Rules:

* Saves include the latest draft revision token.
* Saves are rejected if the lock is lost, expired, or held by another user.
* Saves are rejected if the revision token is stale.
* Force-release requires a reason and creates an audit entry.
* Force-release UI should show the current lock holder and last autosave timestamp.
* A browser that loses the lock must stop autosaving and show a recovery/read-only state.

## 17. Accessibility Requirements

Accessibility should be built into the system rather than handled only through staff training.

Recommended standard:

* WCAG 2.2 AA, unless WSU requires a different final standard

The application should support:

* Semantic HTML
* One H1 per page
* Proper heading hierarchy
* Keyboard-accessible navigation
* Skip-to-content link
* Visible focus states
* Sufficient color contrast
* Accessible forms
* Accessible tables
* Descriptive link text
* Required alt text for meaningful images
* Decorative image support
* Captions where useful
* Responsive design
* No content conveyed by color alone

The editor should block publication when:

* A page has skipped heading levels
* A link uses vague text such as "click here"
* A meaningful image lacks effective alt text
* A table lacks headers
* A page lacks a summary
* A page lacks required owner/contact metadata
* A page lacks a last reviewed date
* A page references draft or archived assets
* A page contains unresolved broken/internal links
* A link uses an unsupported URL scheme

Because editors can publish directly and complex approval workflows are out of scope, the publishing gate is the primary quality and accessibility control. These checks should be treated as MVP blockers, not optional enhancements.

Vague link text should be configurable by template. The default blocked/warned list should include:

```text
click here
here
more
read more
link
this
```

In the MVP, this configuration is developer/config-managed as part of the KB template, not editable by KB editors through the UI.

The safe URL scheme allowlist should apply to both imported links and links entered manually in the editor. Default allowed schemes are `http`, `https`, and `mailto`.

PDF accessibility should be surfaced during document activation. At minimum, the system should warn when a PDF is activated without an accessibility note or detectable structure/tagging. This warning does not need to block MVP activation, but it should appear in asset metadata and review dashboards.

## 18. Content Governance

Each page should have:

* Owner
* Contact email or office
* Last reviewed date
* Optional next review date
* Status

Each asset should have:

* Owner
* Description for documents
* Alt text or decorative flag for images
* Last reviewed date
* Status
* Usage list

Recommended review logic:

* Pages older than 12 months should appear in "Needs Review."
* Assets older than 12 months should appear in "Needs Review."
* Archived pages should not appear in normal search unless archive search is enabled for admins.
* Archived assets should not be linked from published pages.
* Public pages should show "Updated on."

Review dates should be stored as date-only values using the application's institutional timezone, defaulting to America/Los_Angeles for WSU unless configured otherwise.

## 19. Redirects

Redirects are first-class admin-managed records.

Redirects should be:

* Auto-created when a published page slug changes.
* Auto-created when a published page parent/path changes.
* Auto-created when an active asset slug changes.
* Manually creatable/editable.
* Importable from CSV.
* Scoped to a KB where appropriate.
* Validated before activation.

Redirect fields:

```text
id
kb_id
old_url
new_url
status
notes
created_at
updated_at
created_by
```

Recommended redirect statuses:

```text
staged
active
disabled
invalid
```

### Redirect Runtime Behavior

Active redirects should respond with `301` by default. Manual redirects may later support configurable status codes if needed.

Disabled and invalid redirects are not served. They should behave as absent and allow the request to fall through to normal route handling or `404`.

When a published page's parent or slug change causes URL changes for descendants, the system must auto-create redirects for every descendant whose public URL changed. Chains created by sequential moves should be collapsed so all redirects point at the final canonical URL.

The system should reject circular redirects and prevent redirect chains within the same KB. On auto-creation, existing redirects that point to the moved page should be retargeted to the final canonical URL where appropriate.

## 20. Security and Access

Public pages and active public assets are visible without login.

Admin pages require login.

Admin access should be limited to approved staff.

Upload controls:

* Limit allowed file types
* Limit file size
* Sanitize filenames
* Store original filename separately from public slug
* Prevent executable file uploads
* Detect MIME type rather than trusting extension alone
* Validate direct-to-storage uploads after upload and delete invalid blobs
* Scan files if an institutional scanning option is available
* Require metadata before activation
* Reject macro-enabled Office formats such as `.docm`
* Reject unsupported schemes in imported links

Allowed MVP file types:

```text
pdf
docx
xlsx
pptx
png
jpg
jpeg
webp
txt
csv
```

Recommended MVP limits:

* Images: up to 10 MB
* Documents and import DOCX files: up to 50 MB

Executable files should not be allowed.

### Upload Flow

The MVP should use direct-to-blob uploads for assets and DOCX imports so file size limits are not constrained by serverless request-body limits.

Recommended flow:

1. Admin/editor requests an upload target.
2. Server verifies user permission and intended KB/asset context.
3. Server issues a short-lived upload token or signed upload target.
4. Browser uploads directly to object storage.
5. Server validates the stored object before it can be activated or parsed.
6. Server deletes invalid or abandoned upload blobs.
7. Asset activation remains blocked until validation and required metadata are complete.

Validation should include MIME sniffing, extension allowlist, file-size checks, and, where feasible, virus/malware scanning.

Issued upload tokens should expire quickly, with a recommended lifetime of 15 minutes. A scheduled cleanup job should delete abandoned object-storage blobs whose corresponding asset/staged-import record was never created or never advanced past pending validation within a defined TTL, recommended 24 hours. Cleanup actions should be recorded in the audit log.

Blobs whose validation produced `failed` or `quarantined` status may be retained out-of-band for security review for a defined window, recommended 30 days. They must never be reachable through public asset routes.

### Response Headers

Public and admin responses should set secure response headers.

Recommended baseline:

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

The Content Security Policy should restrict scripts and styles to first-party sources and explicitly approved CDNs/services. Streamed asset responses should set `X-Content-Type-Options: nosniff` and a `Content-Disposition` matching inline/download intent.

### DOCX Import Hardening

DOCX parsing must be treated as untrusted input.

Requirements:

* Disable XXE and external entity resolution in all XML parsing.
* Enforce maximum compressed and uncompressed size limits.
* Enforce maximum zip entry counts.
* Sanitize all embedded media filenames and reject path traversal.
* Allow only safe hyperlink schemes: `http`, `https`, and `mailto`.
* Reject or flag `javascript:`, `file:`, `data:`, and other unsupported schemes.
* Reject macro-enabled Office formats.
* Guard image processing against decompression bombs.
* Treat local Confluence paths and local filesystem links as import errors requiring review.

The same broken-link, skipped-heading, vague-link, table-header, and image-alt checks should apply to imported DOCX content before commit or publish.

## 21. Performance Requirements

The public KB should be fast.

Recommended targets:

* Public pages load quickly on desktop and mobile.
* Static rendering or cached server rendering should be used where appropriate.
* Search should return results quickly.
* Images should be optimized.
* Large files should be served from object storage.
* Public pages should be cacheable.
* Admin and import operations can be dynamic.

### Cache Invalidation

Caching must not break the stable URL promise.

Recommended cache tags:

```text
kb:[kb_id]
page:[page_id]
asset:[asset_id]
asset-version:[asset_version_id]
search:[kb_id]
```

Recommended invalidation triggers:

* Publishing a page invalidates that page, its KB navigation, and KB search.
* Unpublishing or archiving a page invalidates that page, its KB navigation, and KB search.
* Moving a page or changing its slug invalidates the old route, new route, redirects, navigation, and search.
* Activating a new asset version invalidates the asset route and pages that render that asset.
* Archiving an asset invalidates the asset route, pages that render it, and search.
* Alias changes invalidate search for the affected KB.

Public draft or archived KBs/pages should return `404` rather than leaking that unpublished content exists. Disabled or archived asset routes should also return `404` unless a redirect applies.

## 22. Analytics and Reporting

Basic analytics may include:

* Most viewed pages
* Most downloaded assets
* Search terms
* Searches with no results
* Broken links
* Pages needing review
* Assets needing review
* Unused assets

Analytics should respect institutional privacy expectations.

Search analytics should avoid storing unnecessary personal data. Search terms should be scrubbed or minimized before storage where practical, because users may paste names, email addresses, IDs, or other sensitive information into search boxes.

For MVP, broken-link reporting should come from publishing-time validation and admin-visible validation results. A scheduled background link checker can be added later if needed.

## 23. Backup and Export

The launch baseline should include:

* Managed PostgreSQL point-in-time recovery or provider-equivalent backups.
* Object-storage retention/versioning where available.
* A KB export bundle that includes structured page content, metadata, redirects, aliases, and referenced assets.
* Weekly verified export bundles retained for a defined period, recommended at least 8 weeks for MVP.
* A documented restore drill before launch.

## 24. Audit Logging

The system should keep an audit log for major admin actions.

Audit logs should record:

* actor
* timestamp
* action type
* affected object
* KB
* before/after metadata where practical
* notes or reason where available

Recommended audit target types:

```text
kb
page
page_version
asset
asset_version
staged_import
redirect
alias
user
kb_assignment
lock
```

Recommended canonical audit action types:

```text
kb.create
kb.update
kb.publish
kb.archive
page.create
page.save_draft
page.publish
page.unpublish
page.archive
page.restore
asset.upload
asset.activate
asset.replace
asset.archive
asset.restore
staged_import.create
staged_import.commit
staged_import.delete
redirect.create
redirect.activate
redirect.disable
alias.create
alias.update
alias.delete
lock.force_release
user.create
user.update
user.disable
kb_assignment.create
kb_assignment.update
kb_assignment.delete
```

MVP audit events should include:

* KB created/updated/published/archived
* user assigned/removed from KB
* page created/updated/published/unpublished/archived/restored
* asset uploaded/activated/replaced/archived/restored
* staged import created/deleted/committed
* redirect created/activated/updated/deleted
* role/admin-user changes
* permission changes
* force lock release

Audit visibility:

* owners can see all logs
* admins can see logs for assigned KBs
* editors do not need audit-log access in MVP

## 25. Migration from Confluence

Migration should be phased.

### Phase 1: Inventory

Create an inventory of current KB pages and attachments.

Inventory fields:

```text
current_title
current_url
parent_page
content_owner
last_updated
attachments
recommended_new_slug
migration_status
```

### Phase 2: Pilot Content

Migrate a small group of high-value pages first.

Recommended pilot pages:

* Graduate Program Handbooks
* Graduate Program Bylaw Guidance
* Managing Admission in myWSU
* WebAdMIT Management
* Maintaining Degree Requirements in myWSU
* Maintaining Program Fact Sheets

### Phase 3: DOCX Import and Manual Cleanup

Confluence content should not be blindly migrated and published.

Export pages as DOCX where feasible, import them into staging, then review:

* Heading structure
* Broken links
* Local Confluence paths
* Outdated files
* Imported images
* Missing alt text
* Accessibility
* Duplicate content
* Public-facing clarity
* Correct owner and review date

### Phase 4: Redirects

Where feasible, create redirects from old Confluence page URLs to new KB pages.

Maintain a redirect mapping table or CSV:

```text
old_url
new_url
status
notes
```

Import redirects into staging and validate before activation.

## 26. Testing Requirements

### Functional Testing

Test:

* Public KB list
* Public KB home page
* Public page rendering
* Navigation
* KB-scoped search
* Admin login
* Role and KB assignment permissions
* Page creation/editing/publishing
* Page archiving/restoring
* Asset upload
* Direct-to-blob upload validation
* Asset activation
* Asset replacement
* Stable asset URLs
* Asset archiving
* Asset usage tracking
* Shared asset impact review
* Related files
* Related pages
* DOCX import staging
* Markdown import
* Redirect CSV staging
* Redirect activation
* Edit locks
* Audit logs

### Accessibility Testing

Test:

* Keyboard navigation
* Screen reader structure
* Heading order
* Link text
* Image alt text
* Decorative image handling
* Table headers
* Color contrast
* Focus visibility
* Mobile layout
* Publishing blocks for accessibility failures

### Content Testing

Test:

* Migrated pages render correctly
* Attachments become managed assets
* Internal links work or are flagged
* Archived pages are hidden
* Draft pages are not public
* Draft assets cannot be referenced by published pages
* Search prioritizes important pages correctly
* Aliases find canonical content

## 27. Development Phases

### Phase 0: Foundation - _Partially built_

Built:

* Next.js app shell
* Bootstrap-owner admin auth via environment variables (no managed-user table yet)
* Production requirement for admin auth environment variables
* Secure baseline headers and nonce-based CSP middleware
* Same-origin (Origin/Referer) CSRF enforcement on admin mutations
* Login rate limiting; sliding idle session timeout on the admin cookie
* Reserved-slug validation on page create/update
* Optional Neon Postgres connection through `DATABASE_URL`
* Minimal KB/page/asset tables auto-created at runtime for the current prototype
* Seed data fallback for local development

Not yet built:

* Full PostgreSQL schema and migration tool
* User and KB user assignment tables; managed-user accounts
* Anti-CSRF tokens (same-origin checks are enforced); shared/distributed rate-limit store
* Session-secret rotation handling
* Owner/admin/editor role enforcement; KB assignments
* Developer/config-managed KB templates
* KB management UI and template selection
* Audit log plumbing

### Phase 1: Public Read Path with Fixtures - _Mostly built_

Built:

* Top-level public KB list
* Public KB home page
* Public article rendering from seeded structured blocks
* Page routing with nested page paths
* Hierarchical page tree navigation
* Breadcrumbs
* Table of contents for heading-rich pages
* Related pages and related files
* Staff-aware preview of draft and staff-only pages for authenticated admin users
* Public KB-scoped search with simple relevance ranking and public-search rate limiting (Postgres FTS deferred until persistence matures)
* Accessible public chrome (skip link, semantic landmarks, focus styles, mobile layout)

Remaining:

* Postgres FTS-backed search with advanced ranking
* Alias-aware search
* Public archived/draft route test coverage
* Final production public styling/accessibility pass

This validates routing, rendering, and accessibility structure before editing exists.

### Phase 2: Asset Core - _Partially built_

Built:

* Minimal asset records in seed data and the current database schema
* Stable stream-first asset route
* ETag and `304` handling on asset responses
* Cache headers on asset responses
* Related file rendering from managed asset records
* Managed image asset creation from the page editor
* Managed image asset creation for supported DOCX images during import commit
* Data-backed local image asset delivery and Blob/HTTP-backed streamed image delivery

Not yet built:

* File manager / asset library UX
* Direct-to-blob upload for normal asset creation
* Server-side upload validation
* Required asset metadata workflow
* Active/draft/archive states
* Asset replacement
* Asset version history display
* Asset usage tracking
* Per-version image alt text and dimensions
* Impact review before risky actions
* Cache invalidation on asset activation/replacement/archive
* Full Blob-backed version records for documents/images instead of the current single-body asset placeholder

Shared assets may be deferred until Phase 5 if needed to keep the first pilot smaller.

Phase 2 should include a seeded fixture page that embeds an asset so replacement and cache invalidation can be tested end to end before the editor exists.

### Phase 3: Editor and Draft/Published Separation - _Partially built_

Built:

* Admin page list
* Admin page editor for existing pages
* Edit page title, slug, summary, visibility, parent/nesting location, and supported imported block content
* WYSIWYG-style editing surfaces for paragraphs, headings, lists, alerts, and table cells
* Rich text toolbars for supported inline formatting in fact sheets and other KB pages
* Add and edit table blocks with captions, header row, and header column controls
* Add managed image blocks by uploading images from the page editor
* Add and resize managed image and fallback image URL blocks
* Save existing pages as drafts
* Move pages under a different parent with descendant path cascade
* Reorder and re-nest pages through the admin page tree manager
* Direct publish action for draft pages from the page tree
* Staff/admin preview of draft pages

Not yet built:

* Final editor library selection
* Documented block schema
* Full controlled WYSIWYG/block editor polish beyond the current pragmatic block editor
* Managed image selection and replacement from the file manager
* Richer page section controls driven by KB templates
* Separate draft and published page bodies
* Autosave and manual save
* Optimistic concurrency tokens
* Per-block asset reference tracking
* Editor-surfaced validation warnings for accessibility and required metadata

### Phase 4: Publishing, Versions, Locks, Redirects, and Aliases - _Partially built_

Built:

* Basic direct publish action from the admin page editor and page-tree manager
* Publishing accessibility and required-metadata gate (blocks publish and lists issues)

Not yet built:

* Page version snapshots on publish
* Page restore into draft
* Edit locks with autosave refresh
* Audit-logged force lock release
* Manual redirects
* Auto-redirect on published slug changes
* Auto-redirect on published parent/path changes
* Auto-aliases from slug/title changes where useful
* Manual aliases
* Redirect validation and activation

### Phase 5: Shared Assets and Export - _Not yet built_

Add:

* Shared asset scope
* Cross-KB impact warnings
* Cross-KB permission checks
* KB export as structured content plus assets

### Phase 6: Import Tools - _Partially built_

Built:

* Single DOCX import screen for authenticated admins
* DOCX parsing for headings, paragraphs, lists, tables, supported inline formatting, and supported web images
* Preview/review UI before commit
* Editor/admin choice of KB, parent path, page title, slug, summary, and visibility before commit
* Commit imported content as a draft page
* Optional Vercel Blob upload for supported imported images
* Managed image asset creation for supported imported DOCX images during commit
* DOCX table import into editable table blocks

Not yet built:

* Persistent staged import records
* Staged media review
* Managed asset creation for imported non-image files
* Full DOCX security hardening
* Direct-to-blob import upload for files larger than current route-handler limits
* Markdown import
* Redirect CSV import into staging

### Phase 7: Review Tools and Better Search - _Not yet built_

Add:

* Admin content review dashboard
* Pages needing review
* Assets needing review
* Unused assets
* Broken-reference detection at publish
* Body-text search/ranking improvements

### Phase 8: Pilot Migration — _Not yet started_

Migrate selected Confluence content.

Begin with high-value pages, clean them manually, and publish after review.

### Phase 9: Launch — _Not yet started_

Before launch:

* Confirm accessibility
* Confirm redirects
* Confirm asset links
* Confirm mobile layout
* Confirm admin users and KB assignments
* Confirm backup/export strategy
* Confirm ownership and review responsibilities

## 28. Minimum Viable Product

The current repository now includes a basic page-management MVP slice, but the full MVP has not been reached because the asset manager, staged-import records, user roles, and audit/version workflows are still missing. The MVP should include the items listed below. Each item is marked with current build status in the repository.

Built:

* Top-level public KB list
* Public KB home pages
* Public article pages
* Nested page routing
* Hierarchical page tree
* Breadcrumbs and table of contents
* Public KB-scoped search (relevance-ranked; rate-limited; FTS deferred)
* Admin login using bootstrap-owner credentials
* Admin dashboard
* Admin page list
* Basic WYSIWYG-style admin page editor with rich text formatting toolbars
* Move/nest pages under parent pages
* Reorder pages within sibling groups
* Drag/drop page nesting through the admin page tree manager
* Editable table blocks with caption/header controls
* Managed image upload/insertion from the page editor
* Managed image and fallback image URL block resize controls
* Save existing pages as drafts
* Publish existing pages
* Stable public asset URLs
* Stream-first public asset delivery
* Related files on pages
* Related pages on pages
* Staff-only/draft preview for authenticated admin users
* Minimal Neon Postgres persistence for KB/page/asset seed and imported draft pages
* Single DOCX import parse/preview/commit flow
* Imported DOCX pages saved as drafts
* Optional Blob upload for supported embedded DOCX images
* Supported embedded DOCX images promoted into managed image assets on draft commit
* Last reviewed date (on seeded data)
* Public "Updated on" date
* Baseline CSP and security response headers
* Same-origin (Origin/Referer) CSRF enforcement on admin mutations
* Login rate limiting and sliding idle session timeout
* Reserved-slug validation on page create/update
* Governance metadata editing (owner, contact email, last reviewed date) in the page editor
* Accessibility and required-metadata publish gate
* DOCX macro-format rejection and safe-scheme hyperlink sanitization
* SSRF-guarded asset streaming; asset bodies excluded from list/render queries

Partially built:

* Multi-KB support exists in data/routes, but no KB management UI exists.
* Existing-custom-admin-model auth exists for one bootstrap admin, but not user management or role assignments.
* File/image manager is represented by asset records, routes, page-editor image upload, and imported-image promotion; the manager UX is not built.
* DOCX import exists and creates managed image assets, but it is not persistent import staging and does not include staged media review.
* Persistence exists for minimal tables, but not the full schema or migrations.
* Page editor exists with WYSIWYG-style block editing, but it is not the final polished editor/library implementation.
* Publishing exists with the accessibility and required-metadata gate, but without page version snapshot, redirects, lock, or audit entry.

Not yet built:

* Existing-custom-admin-model user table; admin/editor user management
* Anti-CSRF tokens (same-origin checks are enforced); shared/distributed rate-limit store
* Owner/admin/editor roles
* KB assignment permissions
* Draft/published page content separation
* Optimistic concurrency for saves and publishes
* Full manual/WYSIWYG editing polish with approved accessible components
* Managed-image selection/reuse from the asset library
* Richer section controls for KB page navigation
* Markdown paste/import
* Persistent single DOCX import staging
* Staged media review
* Managed-asset creation for imported non-image files
* Direct-to-blob upload flow
* Asset replacement with version history
* Asset usage tracking
* Required alt text for meaningful images
* Per-version image alt text confirmation on replacement
* Required descriptions for active document assets
* Page version restore into draft
* Redirect management and redirect CSV staging
* Edit locks
* Audit logs
* KB export as structured content plus assets

The MVP does not need:

* WSU SSO
* Complex workflow
* Jira integration
* Comments
* User personalization
* Advanced analytics
* Full Confluence import automation
* LaTeX import
* Public access to old asset versions
* Batch DOCX import
* Global public search
* Asset-version restore UI
* Automated background broken-link analytics
* Configurable per-KB lock timeouts

## 29. Acceptance Criteria

The project is successful when:

1. Public users can find KB pages more easily than in Confluence.
2. Multiple public KBs can coexist with clear URLs.
3. Staff can upload and replace files/images without breaking public links.
4. Staff can see where an asset is used before changing it.
5. Shared assets warn about cross-KB impact before replacement or archiving.
6. Each public page has a clear title, summary, owner, and last reviewed date in admin metadata.
7. Public pages show an "Updated on" date.
8. Images require effective alt text unless marked decorative.
9. Active document assets require descriptions.
10. Published pages are accessible by default.
11. Draft and archived KBs/pages are not publicly visible.
12. Old asset versions are retained for admin recovery but not public access.
13. Search returns useful page and asset results.
14. Aliases help users find renamed content without exposing duplicate results.
15. DOCX imports are staged and reviewed before becoming draft pages.
16. Redirects can be staged, validated, and activated.
17. The app works well on desktop and mobile.
18. The first pilot content set can be maintained without editing code.
19. The system is simple enough that it does not become another large platform to manage.

## 30. Remaining Open Decisions

The following decisions should be confirmed before the production-complete build. The current repository assumes Next.js on Vercel, optional Neon Postgres, and optional Vercel Blob, but those assumptions should still be confirmed before launch.

1. Final hosting provider: Vercel or another Node/Next.js platform.
2. Final object storage provider: Vercel Blob or equivalent.
3. Final PostgreSQL provider: Neon, Supabase Postgres, or another managed provider.
4. Final rich-text/block editor library.
5. Final structured block JSON schema.
6. Final search implementation, with Postgres FTS recommended for MVP.
7. Exact WSU visual identity requirements.
8. Exact accessibility review standard if different from WCAG 2.2 AA.
9. Exact file size limits after testing real migration files.
10. Initial KB templates and allowed components.
11. Backup retention settings and restore-drill owner.
12. Who owns ongoing review responsibility for each pilot KB.

## 31. Recommended Next Build Priorities

Continue with a focused pilot, not a full migration.

Already present in the current foundation:

* App shell
* Bootstrap admin auth
* One Graduate School KB
* Public KB shell
* Stream-first stable asset routes
* Basic search
* Single DOCX import preview and commit to draft

Recommended next build:

* Full schema migrations
* User and KB assignment tables
* Owner/admin/editor roles
* One developer/config-managed template
* Final editor library decision for whether to keep the pragmatic block editor or migrate to a richer WYSIWYG engine
* Block schema hardening for managed image assets, internal links, and future migrations
* KB section/page navigation rules in the developer-managed template
* Five to ten migrated pilot pages
* File/image manager
* Direct-to-blob upload
* Stable asset replacement
* Asset usage tracking
* Persistent DOCX import staging
* Admin editor with draft/published separation
* KB export bundle

Recommended pilot pages:

* Graduate Program Handbooks
* Graduate Program Bylaw Guidance
* Managing Admission in myWSU
* WebAdMIT Management
* Maintaining Degree Requirements in myWSU
* Maintaining Program Fact Sheets

This will test the core value of the application before investing in a larger migration.

## 32. Summary

This project should remain intentionally focused.

The main value is not replacing every Confluence feature. The value is creating better public KBs with cleaner navigation, better accessibility, reusable managed assets, reliable file replacement, and safer migration workflows.

The most important feature is stable asset management:

> A public document or image should have one durable KB link, and staff should be able to replace the underlying file without breaking that link anywhere in the site.

If that works well, the project will solve the main pain points that Confluence, Teams links, and ad hoc page attachments do not handle cleanly for this use case.

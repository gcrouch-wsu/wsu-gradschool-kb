# WSU Graduate School Knowledge Base

Deployable Next.js (16 / React 19 / App Router) platform for accessible, multi-KB knowledge bases
with a focused admin editor. The built baseline supports public KBs; the current product scope now
requires first-class private KBs with owner-provisioned viewer access as the next implementation
phase. See `project_spec.md` for the full spec and current implementation status.

## Highlights

- **Public KB**: home/article routes, hierarchical sidebar nav, configurable KB landing pages, and
  a responsive **3-column docs layout** (nav · article · sticky on-page TOC rail) with
  depth-controlled TOC.
- **Rich editor**: paragraphs, headings, lists with continued numbering controls, reader-visible
  **info boxes**, procedure sections, tables, cards, images, videos, and internal **editor notes**
  anchored to selected text or a cursor position; text/image **alignment**; a **link dialog**
  (create/edit links, new-tab target); a **media picker**; per-image **alt text** and optional
  visible captions kept as separate fields.
- **Managed assets**: stable public URLs, version history with replace/activate, usage tracking,
  archive-first permanent delete, and reference-blocking safeguards.
- **Multi-user**: password auth with HMAC-signed cookies, Owner/Admin/Editor roles, KB scoping,
  header identity + **Sign out**, a global Owner/Admin **Audit log**, and DB-backed **edit locks**
  to prevent concurrent overwrites.
- **Search**: Postgres full-text search (tsvector + GIN) with prefix/type-ahead and staff-page
  visibility pruning.
- **Governance & A11y**: a live publishing-readiness panel plus a publishing gate that blocks
  inaccessible/incomplete pages, inline highlights for missing alt text and vague links,
  WCAG-minded UI, automated public-page axe smoke tests in CI, and **print-to-PDF export** over
  semantic HTML.
- **Importing**: DOCX staged import with style/image extraction and review.
- **Site customization**: owner-level Site Settings for the home page (hero, rich content blocks,
  KB-list section), a site **logo** (upload + width/placement), header/footer links, **brand text**
  with font/size/color/weight, header/hero alignment, content width, and a **global default theme**
  (colors/fonts/type scale) that KBs inherit. Blank fields render blank-safe (no empty chrome).

## Current Status

As of 2026-07-10, the public-KB release baseline is complete and `main` passes GitHub CI, including
the live-DB test step when `DATABASE_URL` is configured. Completed release work includes the public
multi-KB reader, admin/editor workflow, managed assets, imports, search, audit/governance surfaces,
revision history with restore, print-to-PDF export, owner site settings/branding, and the Chromium
editor regression suite.

Remaining production-readiness work:

- Implement private KBs: KB-level public/private visibility, owner-provisioned `viewer` users,
  read gating for every public route, and visibility-aware search/assets.
- Complete and document manual Chrome + Firefox + mobile-width editor passes.
- Complete a manual WCAG 2.1 AA audit of public pages and admin/editor workflows before making any
  WCAG/ADA compliance claim.
- Keep extending the editor Playwright suite whenever a new browser-only editor bug is found.

Future enhancements are tracked in `project_backlog.md`: a maintained rich-text editor framework
migration, SSO after WSU ITS engagement, public reading polish, proposed-edits workflow, public API,
KB templates/advanced settings, large-file asset handling, and richer operational monitoring.

Test suite: the Vitest unit suite (`npm test`), `npm run test:a11y` (public-page axe smoke
tests), and `npm run test:editor` (authenticated Chromium editor regressions). Type-check:
`npm run check`.

**Live-database tests:** `npm run test:db` runs the KI-1 and page-revision integration suites
(`src/lib/ki1.db.test.ts`, `src/lib/page-revisions.db.test.ts`) against a real Neon database —
edit-lock conflicts, atomic multi-row reorder rollback, lock expiry, full-text search safety/recall,
the staff-visibility prune, editor KB scoping, managed-video behavior, atomic revision writes,
restore, baseline backfill, and revision-retention cleanup. It reads `DATABASE_URL` from `.env.local`;
the same tests self-skip during the normal `npm test` run when no database is configured. Tests create
data under unique ids/slugs and clean up after themselves.

**CI:** `.github/workflows/ci.yml` runs type-check, lint, unit tests, production build, public-page
axe smoke tests, and authenticated Chromium editor regressions on every push/PR. It also runs
`npm run test:db` automatically **when a `DATABASE_URL` repository secret is set** — point that secret
at a dedicated Neon **test** branch (GitHub repo → Settings → Secrets and variables → Actions).
Without the secret, the live-DB step is skipped and CI still passes.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Admin Login

Set these environment variables locally or in Vercel:

```text
KB_ADMIN_EMAIL=
KB_ADMIN_PASSWORD=
KB_ADMIN_SESSION_SECRET=
```

The app also accepts `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, and
`BOOTSTRAP_OWNER_SESSION_SECRET` as aliases. Blank values are treated as unset.

If unset, development falls back to:

```text
admin@example.edu / ChangeMe123!
```

Do not use the fallback credentials in production.

If `vercel env pull` creates blank admin values in `.env.local`, set them locally before starting
the dev server. For example:

```text
KB_ADMIN_EMAIL=gcrouch@wsu.edu
KB_ADMIN_PASSWORD=your-local-admin-password
KB_ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
```

## Deployment

The project is a standard Next.js app and can be deployed to Vercel after pushing to GitHub.

```bash
npm run build
```

## Content Storage

KB content (knowledge bases, pages, assets) is read through `src/lib/kb-store.ts`, which uses one of two backends:

- **Neon Postgres** when `DATABASE_URL` is set. The schema is created with `CREATE TABLE IF NOT EXISTS` and seeded from `src/lib/demo-data.ts` automatically on first run.
- **In-memory seed dataset** when `DATABASE_URL` is unset — fine for local development, but not durable.

To use Neon, create a database and set `DATABASE_URL` locally and in Vercel:

```text
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

Schema changes are applied automatically on first request via versioned migrations in `src/lib/migrations/` (tracked in `_schema_migrations`). These include asset versions, redirects, staged imports, users / KB assignments, KB homepage page selection, TOC settings, edit-lock columns, and full-text search (`tsvector` columns, GIN indices, and a block-text extractor).

## Managed assets

Signed-in admins can manage files at `/admin/assets`:

- Upload PDF/Word/text documents (stored in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set).
- Replace a file by uploading a **draft version**, review **where the asset is used**, then **activate** so the public URL (`/kb/{kbSlug}/files/{assetSlug}`) serves the new file without changing the slug.
- Archive before permanent deletion. Only Owners/Admins can delete, and deletion is blocked while
  a page references the asset.
- When a **published** page is moved or renamed, an automatic redirect is recorded from the old path to the new one.

## Importing from Word (.docx)

Admins can import Confluence-exported `.docx` files at `/admin/import`. The document is converted to KB content (headings, paragraphs, lists, tables, and supported web images), previewed for review in the browser, and saved as a **draft** page nested under the location you choose.

Embedded images are promoted into managed image assets when the draft is created. If **Vercel Blob** is configured, the image bytes are stored there; otherwise supported images are retained as data-backed managed assets for local development. Non-web image formats (EMF/WMF) are not yet supported.

## Managing Pages

Signed-in admins manage pages at `/admin/pages`: reopen drafts, edit metadata and content,
move a page under a different parent, choose a KB homepage page, and publish. The page-tree editor
supports drag reorder, re-nesting, inline edit, setting/clearing the KB homepage, and publishing
drafts directly from the tree.

The document editor is a WYSIWYG surface with a wrapping toolbar:

- **Blocks**: paragraphs, H2/H3 headings, ordered/unordered lists (with Tab/Shift+Tab nesting and
  contextual "Starts at" control), reader-visible info boxes, **Procedure sections** (top-level
  structural sections that default to H2 and can be H3), editable tables, section dividers, cards
  (visual emphasis blocks), videos, and **editor notes** (internal only — never published, excluded
  from search).
- **Rich text**: fonts, sizes, colors, bold/italic/underline/strike/sub/sup, and **alignment**
  (left/center/right) for text and images.
- **Links**: the **Link** button (or clicking an existing link) opens a dialog to set the display
  text, URL, and *open in new tab* (which adds `rel="noopener noreferrer"`).
- **Review**: the **Editor note** button comments on selected text or pins a comment at the cursor
  between words/punctuation. Notes are editor-only and removed from public pages/search.
- **Page display**: page settings can show/hide the summary lead paragraph and the public **PDF
  export** button. Existing and new pages default to showing the export button.
- **Media**: the **Media** button opens a picker to insert images/files from the asset library,
  upload a new image or document, or embed a YouTube/Vimeo/direct video. Library images prefill
  alt text from the asset default when one exists.
- **Images**: click an image to reveal inline controls for **alignment**, **resize**, and **Alt**
  (write a description, mark it decorative, or save the description back to the asset). Captions
  are optional, visible, and stored separately from alt text.

**Publishing**: the editor shows a live publishing-readiness panel for common accessibility and
governance blockers. A publish then runs the server gate; if it's blocked, the editor highlights
the specific fields (summary, responsible office, contact email), vague links, and any images
missing alt text. *Save & publish* /
*Save changes* save the current form first (so unsaved edits are validated), an **Unsaved
changes** indicator is shown, and concurrent edits are guarded by DB-backed edit locks.

Supported DOCX inline formatting is preserved on import and can be edited in the page editor.

## Knowledge base landing pages

Each knowledge base can optionally mark one page as its homepage from `/admin/pages`. When set,
`/kb/{kbSlug}` renders that page's content as the KB landing page while the left page tree still
shows every visible page in the KB. The homepage item in the tree links back to `/kb/{kbSlug}` so
there is one canonical URL for the landing content. If no homepage is selected, or if the selected
page is not public/published for a public visitor, the KB falls back to the generated section list.

## Roles & access

Three roles: **Owner**, **Admin**, **Editor**. Owners/Admins can access all KBs; Editors are
scoped to their assigned KBs (`kb_user_assignments`). Sessions are HMAC-signed, HTTP-only cookies;
sign out from the header.

Owners/Admins can permanently delete archived, unreferenced pages and assets. Editors can archive
pages but cannot permanently delete. Page delete is blocked while child pages or related-page
references exist.

The global **Audit log** (`/admin/audit`) is visible to Owners/Admins and records lightweight
metadata plus small JSON details for page and asset creation, updates, publish/archive/delete, and
version actions. It does not store before/after snapshots.

**User management** (`/admin/users`, owner-only) and **KB management** (`/admin/kbs`, owner-only)
are gated both in the UI and at the API. When creating or editing an editor, assign knowledge bases
with a **search + chips** picker (type to filter, click/Enter to add, ✕ or Backspace to remove) that
scales to many KBs.

**Editor scoping is enforced on both mutations and visibility:**

- *Mutations* (page/asset/import/redirect changes) are guarded by `requireKbAccess` — editors can
  only modify their assigned KBs.
- *List views* — the `/admin/pages` and `/admin/assets` screens, and the `GET /api/admin/assets`
  endpoint, are filtered to the editor's assigned KBs so they can't browse or enumerate others'
  content. The `GET /api/admin/users` directory is owner-only.

Scoping helpers live in `src/lib/auth.ts` (`canAccessKb`, `accessibleKbIds`, `filterKbsForSession`).
Because assignments live in Neon (`kb_user_assignments`), the per-editor behavior only takes effect
when `DATABASE_URL` is set.

## Reading experience

Public articles use a responsive 3-column layout (KB page tree · article · sticky "On this page"
rail) that collapses on tablet/mobile. The page tree provides hierarchy and cross-page navigation;
the right rail covers headings within the current page, so public article breadcrumbs are intentionally
omitted. Tables scroll horizontally on narrow screens. Article and KB-homepage pages can show a
default-on **PDF export** button, which uses the browser's print-to-PDF over semantic,
print-styled HTML. (This relies on the browser's print engine; it is not a server-side tagged/PDF-UA
generator — see `project_spec.md` FB-14.)
 

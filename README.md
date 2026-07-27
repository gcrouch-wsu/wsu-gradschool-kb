# WSU Graduate School Knowledge Base

Deployable Next.js (16 / React 19 / App Router) platform for accessible public and private
multi-KB knowledge bases with a focused admin editor. See `project_spec.md` for the full spec and
current implementation status.

## Highlights

- **Public/private KBs**: home/article routes, hierarchical sidebar nav, configurable KB landing
  pages, KB-level public/private visibility, owner-provisioned Viewer access, and
  a responsive **3-column docs layout** (nav · article · sticky on-page TOC rail) with
  depth-controlled TOC.
- **Rich editor**: paragraphs, headings, lists with continued numbering controls, reader-visible
  **info boxes**, procedure sections, tables, cards, images, videos, **live excerpts from other
  pages** (an "Included from" callout that always shows the source's current section, gated by the
  reader's access, with a custom attribution label and new-tab option, styleable like the info
  box), **P&P sourced content** (a section imported from the Policies & Procedures site as a
  snapshot inside a "Source:" callout, with check-for-changes and refresh controls), and internal
  **editor notes** anchored to selected text or a cursor position; text/image **alignment**; a **link dialog**
  (create/edit links, new-tab target); a **media picker**; per-image **alt text** and optional
  visible captions kept as separate fields.
- **Managed assets**: stable public URLs, version history with replace/activate, tags/keywords,
  usage tracking with used/unused library views, private/staff-aware delivery, archive-first
  permanent delete, and reference-blocking safeguards.
- **Multi-user**: password auth with HMAC-signed cookies, Owner/Admin/Manager/Editor/Viewer roles, KB
  scoping, header identity + **Sign out**, a global Owner/Admin **Audit log**, and DB-backed
  **edit locks** to prevent concurrent overwrites.
- **Search**: global and per-KB Postgres full-text search (tsvector + GIN) with prefix/type-ahead,
  grouped global results, page/asset tags, zero-result gap logging, private/staff-page visibility pruning, and an
  owner-configurable **search widget** — per KB (sidebar box scoped to that KB or all KBs, with a
  custom label) and optionally on the site home page above the KB list. The widget offers **live
  in-place suggestions** (accessible combobox, visibility-scoped public `GET /api/search`, rate
  limited, no-JS fallback to the results pages); reader-facing results include document assets
  only.
- **Governance & A11y**: a live publishing-readiness panel plus a publishing gate that blocks
  inaccessible/incomplete pages, inline highlights for missing alt text and vague links,
  WCAG-minded UI, automated public-page axe smoke tests in CI, owner/admin/KB-manager publish approval,
  proposed-edits review, reader feedback, revision compare/restore, trash, a **content health**
  dashboard, and **print-to-PDF export** over semantic HTML.
- **AI draft summaries** (optional): write a page summary manually, or **Draft with AI** once the
  page has a title and enough body content (Vercel AI Gateway env vars; draft never auto-saves).
- **Operations**: weekly review-date digest cron, owner-only bulk KB ZIP export, privacy-light
  usage analytics, structured JSON error logs, and deploy/rollback runbook documentation.
- **Importing**: DOCX staged import with style/image extraction and review.
- **Site customization**: owner-level Site Settings for the home page (hero, rich content blocks,
  KB-list section), a site **logo** (upload + width/placement), header/footer links, **brand text**
  with font/size/color/weight, header/hero alignment, content width, and a **global default theme**
  (colors/fonts/type scale) that KBs inherit. Blank fields render blank-safe (no empty chrome).

## Current Status

As of 2026-07-26, the public/private KB platform is on `main` and in active use for Grad School
content work. See `project_spec.md` §9 for the shipped surface list (reader, editor, assets, search,
governance, AI draft summaries, admin/ops) and §10 for known limitations.

**Future only** (`project_spec.md` §11 / §12):

1. **WSU SSO** (FB-30) — gated on WSU ITS engagement (Entra ID / Azure AD OIDC or SAML)
2. **Confluence import/export bridge** (FB-37) — concept only; not scoped

Lexical editor Phases 1–4 + FB-26 are built for flow, card, procedure, and table-cell surfaces.

All authentication stays local and owner-provisioned until SSO lands.

**Before a production-compliance / a11y claim:**

- Complete the **Manual release gate** in `docs/release-gate.md` (and `project_spec.md` §12 FB-25):
  Chrome + Firefox + mobile-width editor passes and a WCAG 2.1 AA sample audit. For cross-browser
  Playwright: `EDITOR_CROSS_BROWSER=1` after installing Firefox.
- Follow §13 **Release sign-off** (deploy/cron/post-deploy + IA/search/redirects checklist).

The deploy/rollback runbook is `project_spec.md` §13.

**AI draft summaries** (optional Gateway): in the page editor under Summary, write manually or use
**Draft with AI** once the page has a title and enough body content:

```text
AI_PROVIDER_ENDPOINT=https://ai-gateway.vercel.sh/v1/chat/completions
AI_API_KEY=
AI_MODEL=inclusionai/ling-3.0-flash-free
```

Without these, the API returns a clear “not configured” error. Drafts never auto-save — review and
Save as usual. Customize prompts under **Admin → Settings → AI Prompt** (summary + page review;
blank uses built-in defaults). Each knowledge base can override both prompts when editing the KB.
Cleaned AI summary drafts are capped at 2,500 characters; typed summaries have no hard max. **Review
with AI** in the page editor returns accept/dismiss suggestions for style, readability, grammar, and
alt text.

Test suite: the Vitest unit suite (`npm test`), `npm run test:a11y` (public-page and private-viewer
axe smoke tests), and `npm run test:editor` (authenticated Chromium editor regressions; optionally
Firefox + mobile-width with `EDITOR_CROSS_BROWSER=1`). Type-check: `npm run check`.

**Live-database tests:** `npm run test:db` runs the KI-1, page-revision, review-digest, KB-export,
page-view, and private-KB access-matrix integration suites against a real Neon database —
edit-lock conflicts, atomic multi-row reorder rollback, lock expiry, full-text search safety/recall,
the private/staff-visibility prune, editor/viewer KB scoping, managed-video behavior, atomic revision writes,
restore, baseline backfill, revision-retention cleanup, review-date due-page queries, KB export
manifest behavior, page-view upsert/retention folding, and private KB read/search/asset semantics.
It reads `DATABASE_URL` from `.env.local`;
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

Scheduled cron routes require `CRON_SECRET` in production. Review digest email delivery is optional:
set `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_TOKEN`, and `EMAIL_FROM` to send through an HTTP email
provider. When the provider URL is unset, the digest cron logs structured JSON and returns a skipped
delivery result instead of failing.

## Content Storage

KB content (knowledge bases, pages, assets) is read through `src/lib/kb-store.ts`, which uses one of two backends:

- **Neon Postgres** when `DATABASE_URL` is set. The schema is created with `CREATE TABLE IF NOT EXISTS` and seeded from `src/lib/demo-data.ts` automatically on first run.
- **In-memory seed dataset** when `DATABASE_URL` is unset — fine for local development, but not durable.

To use Neon, create a database and set `DATABASE_URL` locally and in Vercel:

```text
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

Schema changes are applied automatically on first request via versioned migrations in
`src/lib/migrations/` (tracked in `_schema_migrations`). **Current head:
`043_page_server_drafts_per_author`** (per-user server drafts). Recent migrations also cover
curated next-step copy (`042`), platform features including webhooks/server drafts/search synonyms
(`041`), asset tags/keywords and tag-aware asset search vectors (`040`), page tags/keywords
(`039`), site + per-KB AI summary and page-review prompts (`038`), site AI summary prompt (`037`),
asset usages (`036`), reader feedback (`035`), scheduled publish (`034`), per-KB summary
requirement (`033`), page-tree group/link nodes (`032`), search widget (`031`), sourced-block FTS
(`030`), and KB visibility (`029`). No manual Neon console migration is required. See
`src/lib/migrations/index.ts` for the full sequence (assets, redirects, imports, users/assignments,
homepage, TOC, edit locks, FTS, revisions, page views, etc.).

## Managed assets

Signed-in admins can manage files at `/admin/assets`:

- Upload PDF/Word/text documents (stored in Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set;
  large documents can use direct-to-Blob upload when configured).
- Tag assets at upload or from the detail page; the library searches titles, slugs, descriptions,
  tags, and referencing page names, with type and used/unused filters.
- Replace a file by uploading a **draft version**, review **where the asset is used** (persisted
  usage index), then **activate** so the public URL (`/kb/{kbSlug}/files/{assetSlug}`) serves the
  new file without changing the slug. Public article images can request width variants via `?w=` /
  `srcset`.
- Archive before permanent deletion. Only Owners/Admins can delete, and deletion is blocked while
  a page references the asset.
- When a **published** page is moved or renamed, an automatic redirect is recorded from the old path to the new one.

Owners can export a full KB ZIP from `/admin/kbs`. The export contains `kb.json`, standalone semantic
HTML files for every page, and active asset-version bytes under `assets/`. The ZIP is streamed and
asset bytes load one entry at a time, so large media-heavy KBs do not buffer in function memory.

## Importing from Word (.docx)

Admins can import Confluence-exported `.docx` files at `/admin/import`. The document is converted to KB content (headings, paragraphs, lists, tables, and supported web images), previewed for review in the browser, and saved as a **draft** page nested under the location you choose.

Embedded images are promoted into managed image assets when the draft is created. If **Vercel Blob** is configured, the image bytes are stored there; otherwise supported images are retained as data-backed managed assets for local development. Non-web image formats (EMF/WMF) are not yet supported.

## KB page style pipeline (agent-assisted)

The `style/` folder is a workflow for polishing KB page HTML with an AI agent (Claude Code, Codex,
Gemini CLI, etc.) **before** pasting it into the visual editor: drop a page into `style/draft/`,
run the prompt in `style/README.md`, and collect the reviewed-and-edited result from
`style/edited/`. The rules live in `style/style.md`, whose guardrails mirror the app's publish
gate. This is content tooling, not part of the deployed app.

## Managing Pages

Signed-in admins manage pages at `/admin/pages`: choose a knowledge base from the view selector,
then reopen drafts, edit metadata and content, move a page under a different parent, choose a KB
homepage page, submit for review, and publish if their role allows it. The page-tree editor supports
drag reorder, re-nesting, inline edit, setting/clearing the KB homepage, and owner/admin/KB-manager publish
approval from the tree. **Copy / move to
another KB** is available from the page editor overflow menu and each tree row menu: copies land as
drafts in the destination KB; moves keep status, take child pages along, clear a source homepage
assignment if needed, and leave absolute `/kb/...` redirects from the old public URLs when the page
was published.

Besides regular pages, the tree supports two non-page node kinds: **group headings**
(non-clickable organizational labels pages nest under; their URLs render the not-found page) and
**links** (tree items opening an `https://` URL or internal `/` path, with an optional new-tab
setting). Groups and links are excluded from search results, the excerpt-source picker, KB
homepage assignment, and KB-export page files. They're created via the Type selector on the New
Page form and edited through a dedicated settings form (no block editor).

The document editor is a WYSIWYG surface with a wrapping toolbar:

- **Blocks**: paragraphs, H2/H3 headings, ordered/unordered lists (with Tab/Shift+Tab nesting and
  contextual "Starts at" control), reader-visible info boxes, **Procedure sections** (top-level
  structural sections that default to H2 and can be H3), editable tables, section dividers, cards
  (visual emphasis blocks), videos, **Excerpts** (live includes of another page's section, chosen
  with a KB → page → section picker), **P&P source** blocks (sections imported from the Policies &
  Procedures site with provenance and refresh controls), and **editor notes** (internal only —
  never published, excluded from search).
- **Rich text**: fonts, sizes, colors, bold/italic/underline/strike/sub/sup, and **alignment**
  (left/center/right) for text and images.
- **Links**: the **Link** button (or clicking an existing link) opens a dialog to set the display
  text, URL, and *open in new tab* (which adds `rel="noopener noreferrer"`).
- **Review**: the **Editor note** button comments on selected text or pins a comment at the cursor
  between words/punctuation. Notes are editor-only and removed from public pages/search.
- **Page display**: page settings can show/hide the summary lead paragraph and the public **PDF
  export** button. Existing and new pages default to showing the export button. Summary can be
  written manually or drafted with AI when the page body is complete enough (optional Gateway env).
- **Media**: the **Media** button opens a searchable picker to insert images/files from the asset
  library, upload a new image or document, or embed a YouTube/Vimeo/direct video. Images insert at
  the saved editor cursor/location; document assets link selected text when there is a text
  selection, otherwise they insert as file-link blocks. Library images prefill alt text from the
  asset default when one exists.
- **Images**: click an image to reveal inline controls for **alignment**, **resize**, and **Alt**
  (write a description, mark it decorative, or save the description back to the asset). Captions
  are optional, visible, and stored separately from alt text.

**Publishing**: the editor shows a live publishing-readiness panel for common accessibility and
governance blockers. A publish then runs the server gate; if it's blocked, the editor highlights
the specific fields (summary, responsible office, contact email), vague links, and any images
missing alt text. *Save & publish* /
*Save changes* save the current form first (so unsaved edits are validated), an **Unsaved
changes** indicator is shown, and concurrent edits are guarded by DB-backed edit locks. Editors can
save drafts and submit pages for review. Owners/Admins and assigned KB Managers can publish,
approve proposed pages, or schedule a publish; restoring a published revision remains
Owner/Admin-only.

Supported DOCX inline formatting is preserved on import and can be edited in the page editor.

## Knowledge base landing pages

Each knowledge base can optionally mark one page as its homepage from `/admin/pages`. When set,
`/kb/{kbSlug}` renders that page's content as the KB landing page while the left page tree still
shows every visible page in the KB. The homepage item in the tree links back to `/kb/{kbSlug}` so
there is one canonical URL for the landing content. If no homepage is selected, or if the selected
page is not public/published for a public visitor, the KB falls back to the generated section list.

## Roles & access

Five roles: **Owner**, **Admin**, **Manager**, **Editor**, and **Viewer**. Owners/Admins can access all KBs;
Managers can manage and publish assigned KBs; Editors can manage assigned KBs and read all public KBs plus assigned private KBs; Viewers can read
all public KBs plus assigned private KBs and cannot access admin surfaces or mutation APIs. Sessions
are HMAC-signed, HTTP-only cookies; sign out from the header.

Owners/Admins can permanently delete archived, unreferenced pages and assets. Editors can archive
pages but cannot permanently delete. Page delete is blocked while child pages or related-page
references exist.

The global **Audit log** (`/admin/audit`) is visible to Owners/Admins and records lightweight
metadata plus small JSON details for page and asset creation, updates, publish/archive/delete, and
version actions. It does not store before/after snapshots.

The **Usage** page (`/admin/usage`) shows privacy-light aggregate page-view counts for published
public article and KB-homepage renders, plus AI metering for **Draft with AI** / **Review with AI**
(calls and prompt/completion/total tokens by feature and model). Page views store only page id, KB
id, day, and count; AI rows store day, feature, model, KB id, and token totals — no prompts, cookies,
IP addresses, or user agents. Bot and crawler traffic can be counted for page views. Counts are
skipped in in-memory mode.

The **Content health** page (`/admin/health`) consolidates maintenance queues for overdue review
dates, missing tags, missing governance metadata, proposed pages, and logged zero-result searches.
Editors see only their assigned KBs; Owners/Admins see all KBs.

**User management** (`/admin/users`, owner-only) and **KB management** (`/admin/kbs`, owner-only)
are gated both in the UI and at the API. Owners can mark KBs public/private and create or edit
Editors/Viewers with a **search + chips** KB assignment picker (type to filter, click/Enter to add,
✕ or Backspace to remove) that scales to many KBs.

**Manager/Editor/Viewer scoping is enforced on mutations and public/private reads:**

- *Mutations* (page/asset/import/redirect changes) are guarded by `requireKbAccess` — editors can
  only modify their assigned KBs, and Viewers are rejected before mutations run.
- *List views* — `/admin/pages` and `/admin/assets` are scoped per knowledge base (view selector)
  and filtered to the manager/editor's assigned KBs so they can't browse or enumerate others' content. The
  `GET /api/admin/assets` endpoint is likewise filtered. The `GET /api/admin/users` directory is
  owner-only.
- *Public reads* — the home KB list, KB landing/article routes, per-KB search, global search, page
  trees, and file routes use the read-access helper. Unauthorized private content returns 404;
  authorized private assets use `Cache-Control: private, no-store`.

Scoping helpers live in `src/lib/auth.ts` (`canAccessKb`, `accessibleKbIds`,
`filterKbsForSession`, `getKbReadAccess`, `filterKbsForReadAccess`). Because assignments live in
Neon (`kb_user_assignments`), per-user assignment behavior is durable only when `DATABASE_URL` is
set; in-memory mode uses seed data for local parity checks.

## Reading experience

Public articles use a responsive 3-column layout (KB page tree · article · sticky "On this page"
rail) that collapses on tablet/mobile. The page tree provides hierarchy and cross-page navigation;
the right rail covers headings within the current page, so public article breadcrumbs are intentionally
omitted. Tables scroll horizontally on narrow screens. Article and KB-homepage pages can show a
default-on **PDF export** button, which uses the browser's print-to-PDF over semantic,
print-styled HTML. (This relies on the browser's print engine; it is not a server-side tagged/PDF-UA
generator — see `project_spec.md` §10).
 

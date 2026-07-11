# Project Backlog

This file preserves the tagged future-build backlog moved from project_spec.md §12. Keep all [AI-AGENT-TASK] tags and history verbatim; update status tags in place and never delete completed items.

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

- **Grep entrypoint:** `grep -n "AI-AGENT-TASK" project_backlog.md` lists every candidate task.
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
- **Global FTS delivered (2026-07-10):** `/search` now searches all KBs readable under the current
  public/staff model, reuses the per-KB FTS ranking and rate limit, logs zero-result searches, groups
  results by KB, and has public axe smoke coverage plus a live-DB guard that unpublished KBs do not
  leak into anonymous global search. Phase 1 will extend this to KB-level private visibility/viewers.
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

`[AI-AGENT-TASK] id:FB-27  priority:high  area:authz-visibility  effort:L  status:open`

- **Finding:** The product goal now requires both public and private KBs. The current implementation is
  built around public KB routes plus page-level public/staff visibility; it does not yet provide a
  KB-level `public`/`private` visibility column, a read-only `viewer` role, or a single visibility
  helper that gates every public route, search path, page tree, redirect, and asset response.
- **Suggested approach:** Add `knowledge_bases.visibility` (`public` default for existing rows), add a
  local-password `viewer` role to the existing user model, reuse `kb_user_assignments` for viewer/editor
  private-KB read access, and introduce one read-access helper beside the existing admin-scope helpers.
  Owners/Admins can read all KBs; Editors and Viewers can read all public KBs plus assigned private KBs.
  Viewers must be redirected away from `/admin`, rejected by every mutation API, and must never see
  draft pages or staff-only pages. Asset delivery and search must use the same visibility semantics;
  authorized asset responses must use `Cache-Control: private, no-store`.
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
  `logError`, `.env.example`, `docs/OPERATIONS.md`, and Vercel environment configuration.
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

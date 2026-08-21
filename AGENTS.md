# Agent guide — wsu-gradschool-kb

Start here. This page orients you in about five minutes and then points at the one document
that covers your task. Do not read `project_spec.md` end to end — it is a 1,300-line reference,
not an onboarding doc.

## Route yourself by task

| Task | Read first |
|------|------------|
| **App development** — Next.js code, editor, publish gate, DB, tests | This page, then the relevant `project_spec.md` sections (map below) |
| **KB page content work** — reviewing or editing KB page HTML | `style/style.md` (authoritative), then `automated_review.md` |
| **Editing live pages in the production admin** | `automated_review.md` — what the last pass changed, how to spot broken links, session gotchas |
| **Running, testing, deploying** | `README.md` |

---

## What this is

A **Next.js 16 / React 19 / TypeScript** (App Router) knowledge-base platform for WSU's Graduate
School, replacing Confluence. It serves several public and private KBs from one deployment, with a
custom block editor, managed assets, Postgres full-text search, and a publish-time accessibility
gate. `project_spec.md` §1–2 has the goal and scope in full.

**It runs with no database.** Without `DATABASE_URL` the app uses an in-memory seed dataset
(`src/lib/demo-data.ts`) — fine for UI work and what both Playwright suites use. Locks, FTS, users,
per-KB assignments, theming persistence, audit log, and site settings only do something real
against Neon.

## Where things live

| Path | What |
|------|------|
| `src/app/kb/[kbSlug]/**` | Public reader routes (KB landing, articles, search, file delivery) |
| `src/app/admin/**` | Admin UI (pages, assets, KBs, users, settings, review, health) |
| `src/app/api/admin/**` | All mutations. Every route needs `requireAdminMutation` + a KB-scope guard |
| `src/components/` | ~59 components. The editor is `PageDocumentEditor.tsx` + `LexicalFlowSurface.tsx` |
| `src/lib/` | ~90 modules: `kb-store.ts` (data API), `db.ts` (SQL), `page-document.ts` (block ↔ HTML), `publish-gate.ts`, `kb-theme.ts`, `lexical/` |
| `src/lib/migrations/index.ts` | Versioned migrations; run automatically on first request |
| `src/proxy.ts` | App Router middleware — per-request CSP with a script nonce |
| `tests/editor/`, `tests/a11y/` | Playwright suites (own ports, hermetic, never reuse a server) |

## The four commands

```bash
npm run check        # tsc --noEmit
npm test             # Vitest unit suite (in-memory; live-DB tests self-skip)
npm run test:editor  # Playwright editor regressions — builds + starts a prod server on 3101
npm run test:a11y    # Playwright + axe on public routes — prod server on 3100
```

Run `check`, `test`, and — for any editor or public-render change — `test:editor` before
committing. CI runs all of them plus lint and a production build.

## Which `project_spec.md` section to read

| Changing… | Read |
|-----------|------|
| The editor (Lexical, toolbar, paste, selection) | §5 *Editor*, §8 *Editor — Lexical surfaces…* |
| Block types, sanitizing, HTML round-trip | §5 *Content model*, §8 *Editor — blocks, sanitizing…* |
| Draft backup / recovery banners | §8 *Editor — drafts, recovery, and work protection* |
| Publish rules or the readiness panel | §5 *Publish gate*, §8 *Publish gate and readiness parity* |
| The page tree, nesting, page moves | §5 *Page tree editing*, §8 *Page tree and hierarchy* |
| Per-KB theming or public CSS | §5 *Site settings*, §8 *Theming, CSS, and reading rhythm* |
| Data access, a new KB setting, a migration | §6, §8 *Data access, KB settings, and migrations* |
| An admin route, auth, CSP, outbound fetches | §3 *authorization matrix*, §8 *Security, CSP…* |
| AI summary/review features | §5, §8 *AI gateway* |
| Tests or CI | §7, §8 *Testing and CI* |

**§8 is required reading for the area you touch.** Every entry is a trap that already cost someone
a session, and the reasoning is part of the rule — the fix that looks obvious is usually the one
that was tried and reverted.

## Things that routinely waste time

- **`next-env.d.ts` flips** between `./.next/types/routes.d.ts` and `./.next/dev/types/routes.d.ts`
  depending on whether `next build` or `next dev` ran last. Next generates it and the file says not
  to edit it. Do not "fix" the diff or commit the flip on its own.
- **A local Playwright failure is not a regression** until you have confirmed the suite started its
  own hermetic server. The suites use ports 3100/3101 and never reuse one; a dev server on :3000
  points at real Neon and produces a wall of seed-data failures that read exactly like bugs.
- **Firefox cannot deliver a synthesized clipboard payload**, and Playwright's synthetic mouse
  cannot make a usable editor selection. Both are harness limits, not product bugs — check §8
  *Testing and CI* before chasing one.
- **Per-KB themes need a database.** Theme-driven behaviour cannot be exercised end-to-end in the
  hermetic suites; unit-test the normalisation and assert the CSS wiring instead.

---

## KB page style pipeline (`style/`)

A review-and-edit pipeline for Graduate School KB page HTML.
**Read `style/style.md` in full before touching anything under `style/`.** The contract:

- `style/draft/` — incoming pages, not yet reviewed. Read only; never modify a draft.
- `style/edited/` — save agent-edited output here, same filename as the draft.
- `style/reference/` — approved style exemplars. Never edit.
- Preserve existing `data-block-id` values on retained blocks; give new blocks new unique IDs.
- Produce the review report (Must fix / Should fix / Optional polish / Publish readiness) and a
  change log alongside the edited file.

`style/style.md` hand-mirrors the publish gate and the block contract — change one, change the
other, or the pipeline silently drifts. Human instructions and a starter prompt are in
`style/README.md`.

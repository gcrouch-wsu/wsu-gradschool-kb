# Agent guide — wsu-gradschool-kb

This repository contains two kinds of work. Route yourself by task:

| Task | Read first |
|------|------------|
| **App development** — Next.js code, editor, publish gate, DB, tests | `project_spec.md` — the full spec and AI handoff (goal, architecture, conventions & gotchas, feature status, future work) |
| **KB page content work** — reviewing or editing KB page HTML | `style/style.md` — the authoritative style guide and agent workflow, then `automated_review.md` |
| **Resuming an agent-driven review of live KB pages** | `automated_review.md` — what the last pass changed, what it left alone, and the editor/session gotchas |

## App development

The app is a Next.js 16 / React 19 knowledge-base platform. `project_spec.md` is the canonical
handoff document; **§8 Conventions & gotchas** is required reading before changing the areas it
covers. `README.md` covers running, testing, and deployment.

Two things that routinely waste time:

- **`next-env.d.ts` flips between `./.next/types/routes.d.ts` and `./.next/dev/types/routes.d.ts`**
  depending on whether `next build` or `next dev` ran last. Next generates it and the file says not
  to edit it. Do not "fix" the diff or commit the flip on its own — run a build before committing
  if you want the stable form.
- **Playwright suites use ports 3100 (a11y) and 3101 (editor) and never reuse a server.** A local
  failure is not a regression until you have confirmed the suite actually started its own hermetic
  server. See `project_spec.md` §8.

## KB page style pipeline (`style/`)

The `style/` folder is a review-and-edit pipeline for Graduate School KB page HTML.
**Read `style/style.md` in full before touching anything under `style/`.** Summary of the contract:

- `style/draft/` — incoming pages, not yet reviewed. Read only; never modify a draft.
- `style/edited/` — save agent-edited output here, same filename as the draft.
- `style/reference/` — approved style exemplars. Never edit.
- Preserve existing `data-block-id` values on retained blocks; give new blocks new unique IDs.
- Produce the review report (Must fix / Should fix / Optional polish / Publish readiness) and a
  change log along with the edited file.

Human-facing instructions and a copy-paste starter prompt are in `style/README.md`.

**Editing live pages in the production admin** (rather than the `style/` pipeline): read
`automated_review.md` first. It records the last agent-driven pass over the published KB —
what changed, what was deliberately left alone, how to detect broken links (not-found pages
return HTTP 200, so only the page title distinguishes them), and the editor and session
gotchas that otherwise cost an hour to rediscover.

# Agent guide — wsu-gradschool-kb

This repository contains two kinds of work. Route yourself by task:

| Task | Read first |
|------|------------|
| **App development** — Next.js code, editor, publish gate, DB, tests | `project_spec.md` — the full spec and AI handoff (goal, architecture, conventions & gotchas, feature status, future work) |
| **KB page content work** — reviewing or editing KB page HTML | `style/style.md` — the authoritative style guide and agent workflow |

## App development

The app is a Next.js 16 / React 19 knowledge-base platform. `project_spec.md` is the canonical
handoff document; **§8 Conventions & gotchas** is required reading before changing the areas it
covers. `README.md` covers running, testing, and deployment.

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

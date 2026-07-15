# KB page style pipeline

This folder polishes KB page HTML with an AI agent **before** the content is pasted into the
visual editor. The agent reviews a draft against `style.md` (word usage, readability, structure,
accessibility, and the editor's publish rules), applies the edits, and reports what changed.

Works with any coding agent — Claude Code, OpenAI Codex, Gemini CLI, etc.

## How to use it

1. **Drop your page HTML into `draft/`.** Keep the page title as the filename, with a lowercase
   `.html` extension (e.g. `draft/Maintaining Program Fact Sheets.html`).
2. **Start your agent and paste the prompt below**, replacing `PAGE` with your filename.
3. **Collect the result from `edited/`.** The agent leaves your draft untouched, so you can diff
   the two versions. It will also give you a review report and a change log, including any page
   metadata (summary, contact email, review date) you still need to fill in the editor.
4. **Paste the edited HTML into the visual editor** and complete the metadata.

## The prompt

> Read `style/style.md` in full, then review and edit the KB page draft at
> `style/draft/PAGE.html` following that guide's workflow. Give me the review
> report (Must fix / Should fix / Optional polish / Publish readiness), apply
> the edits, and save the result to `style/edited/PAGE.html` with a change
> log. Do not modify the draft or anything in `style/reference/`.

For a review without edits, add: "Review only — do not write any files."

## What the folders mean

| Folder | Contents |
|--------|----------|
| `draft/` | Incoming pages that have not passed a style review. Agents never modify these. |
| `edited/` | Agent output that passed the workflow, ready to paste into the editor. |
| `reference/` | Approved style exemplars agents model tone, structure, and markup on. Read-only. |

## Maintaining the pipeline

- `style.md` is the single source of truth for the rules. Its publish guardrails mirror the app's
  real publish gate (`src/lib/publish-gate.ts`) — if the gate or the editor block contract changes,
  update `style.md` to match.
- Promoting a published page to `reference/` is a human decision; the process is described at the
  bottom of `style.md`.

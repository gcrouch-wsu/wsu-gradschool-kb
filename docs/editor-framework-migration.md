# Editor framework migration plan (FB-09 / FB-29)

Status: **Phase 0 spike landed** (2026-07-26). Proceed to Phase 1.

## Phase 0 findings

- Stack: Lexical + `@lexical/react` / rich-text / list / link / html.
- Spike route: `/admin/lexical-spike` (`LexicalSpikeEditor`).
- Round-trip path: `ContentBlock[]` → `blocksToDocumentHtml` → Lexical `$generateNodesFromDOM`
  → `$generateHtmlFromNodes` → `documentHtmlToBlocks`. Unit coverage in
  `src/lib/lexical-spike.test.ts`.
- Decision: **proceed with Lexical** for Phase 1 (flow surface). Nested surfaces
  (table cells, Info boxes) stay on the current editors until Phase 2.
- Remaining Phase 0 manual checks before calling Phase 1 done: paste-from-Word and Tab
  list nesting on the spike route against fixtures in `tests/editor`.

## Goal

Replace the custom `contentEditable` flow surfaces with a maintained editor
framework **behind** the existing `ContentBlock[]` boundary so storage,
sanitizer, publish gate, DOCX/import, and public rendering stay stable.

## Non-negotiables

1. `src/lib/page-document.ts` remains the serialization boundary.
2. Existing `page-document.test.ts` round-trips must pass unchanged.
3. `tests/editor` Chromium suite must stay green; Firefox checklist in
   `docs/release-gate.md` must pass before calling the migration done.
4. Notes (`doc-note`), links, tables, Info boxes, excerpts, and sourced blocks
   keep current semantics (including editor-only note stripping on publish).

## Recommended stack

**Lexical** (preferred) or ProseMirror. Lexical has stronger React 19 / Next
integration and a clearer plugin model for our multi-surface toolbar
(document body vs table cell vs Info box).

## Phases

### Phase 0 — Spike (1–3 days)

- Mount Lexical in a throwaway route that round-trips a single paragraph +
  heading + list through `blocksToDocumentHtml` / `documentHtmlToBlocks`.
- Prove paste-from-Word and Tab list nesting against current fixtures.
- Decision gate: proceed or stop with written findings in this file.

### Phase 1 — Flow surface only

- Swap the main `.wysiwyg-surface` document body to Lexical.
- Keep table cells, cards, procedure sections, and Info boxes on the current
  editors initially.
- Keep HTML source mode as a serialize → textarea → parse path.

### Phase 2 — Nested surfaces

- Table-cell editor and Info-box / alert rich text.
- Toolbar context events (`DocumentToolbar` / `RichTextToolbar`) must keep
  surface-aware enable/disable behavior (FB-26).

### Phase 3 — Notes & polish

- Re-home note anchors onto Lexical mark nodes (rail already consumes DOM
  `.doc-note` markers — update selectors if the mark markup changes).
- Undo/redo, caret restore after format, link draft markers.

### Phase 4 — Delete dead code

- Remove unused `contentEditable` helpers once coverage is complete.
- Update §10 limitations: drop “custom contentEditable” maintenance tax claim.

## Acceptance (from FB-09 / FB-29)

1. `page-document.test.ts` unchanged and green.
2. `npm run test:editor` green on Chromium; Firefox + mobile checklist signed
   in `docs/release-gate.md`.
3. Manual caret matrix: multi-block select, paste-with-formatting, list
   Tab/Shift-Tab, note insert at boundary, undo after format, table-cell
   link/bold, source-mode round-trip.
4. Publish gate + sanitizer output identical for the same input fixtures.

## Out of scope for this migration

- SSO, Confluence, AI summaries.
- Changing the public `PageBlocks` renderer.
- Replacing the HTML source mode with a structural JSON editor.

# Editor framework migration plan (FB-09 / FB-29 / FB-26)

Status: **Phases 1–4 + FB-26 landed on development**. Chromium `test:editor`
green after toolbar/insert/image-alt fixes (2026-07-27). Main flow, cards,
procedure, and table-cell surfaces use Lexical. Spike route retained for manual
checks. Release-gate Firefox/mobile checklist still required before calling
editor close-out complete (FB-25).

## Phase 0 findings

- Stack: Lexical + `@lexical/react` / rich-text / list / link / html.
- Spike route: was `/admin/lexical-spike` (`LexicalSpikeEditor`). **Removed 2026-08-01** once the
  migration completed — it was a dev-only artifact still shipping as a production admin route.
  Recover it from git history if a future spike needs a starting point.
- Round-trip path: `ContentBlock[]` → `blocksToDocumentHtml` → Lexical `$generateNodesFromDOM`
  → `$generateHtmlFromNodes` → `documentHtmlToBlocks`. The unit coverage outlived the spike and
  now lives in `src/lib/page-document-roundtrip.test.ts`.
- Decision: **proceed with Lexical** for Phase 1 (flow surface). Nested surfaces
  (table cells, Info boxes) stay on the current editors until Phase 2.

## Phase 1–4 + FB-26 landing notes

- **Phase 1:** Main flow `.wysiwyg-surface` is `LexicalFlowSurface`. Toolbar commands
  route through `src/lib/lexical/commands.ts` when a Lexical editor is the bound
  surface (not merely registered). Images stay as `PreservedBlockNode` decorator
  HTML; alerts as `AlertNode` (`isShadowRoot`).
- **Phase 2:** Info-box body edits via flow `AlertNode` children; callout
  toolbar context uses DOM + Lexical `$findMatchingParent(AlertNode)`.
- **Phase 3:** `NoteNode` preserves `.doc-note` markers for the notes rail; HistoryPlugin
  provides undo/redo on Lexical surfaces.
- **Phase 4:** Card and procedure nested surfaces also use `LexicalFlowSurface`.
  HTML↔Visual remounts Lexical via `visualEpoch`. Legacy flow contentEditable mount
  path removed from `PageDocumentEditor`. Image alt/align/width DOM edits sync back
  into `PreservedBlockNode` via `syncPreservedBlockFromDom`.
- **FB-26:** Table cells use nested `LexicalTableCellSurface` (unique Lexical namespace
  per cell). Cell storage remains inline rich text via `sanitizeRichText` on export.
  Link insert on Lexical surfaces uses `TOGGLE_LINK_COMMAND` (no DOM draft marker).
  Covered by `tests/editor/table-cell.spec.ts`.

## Goal

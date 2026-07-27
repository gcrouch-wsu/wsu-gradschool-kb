# Release gate checklist (FB-25)

Copy of the production release gate from `project_spec.md` §12 FB-25.
Mark items as you complete them; do not claim ADA/WCAG certification until the
manual WCAG sample pass is done.

**Product/code status:** the automated suite below is what CI and local
`npm run check` / `lint` / `test` / `build` / `test:a11y` / `test:editor` /
`test:db` cover. Completing those commands is necessary but **not** sufficient
for FB-25 — the editor browser sample and WCAG sample still need a human
tester and a signed “Sign-off” section.

## Automated (must be green in CI)

- [ ] `npm run check`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:a11y`
- [ ] `npm run test:editor` (Chromium always in CI; for release candidates also run
      `EDITOR_CROSS_BROWSER=1 npx playwright install firefox && EDITOR_CROSS_BROWSER=1 npm run test:editor`
      after installing Firefox)
- [ ] `npm run test:db` against the Neon **test** branch when migrations/DB
      behavior change

## Editor — Chrome + Firefox (desktop) and ~375px width

- [ ] Create/edit paragraph, H2/H3, bold/link
- [ ] Bulleted + numbered lists; Tab / Shift+Tab nesting
- [ ] Info box with nested list; save → public render
- [ ] Table cell bold + link; public table headers
- [ ] Image insert + alt dialog; public `img[alt]`
- [ ] Paste from Word/Outlook (basic formatting survives)
- [ ] Excerpt + P&P sourced insert; draft preview matches intent
- [ ] Unsaved guard / Restore draft; History restore
- [ ] Publish blocked until readiness issues clear; publish succeeds when ready
- [ ] Editor notes: add highlight + pin notes; rail lists them; public HTML has no notes

## Public + admin WCAG 2.1 AA sample pass

- [ ] Keyboard-only: home, KB landing, article (tree + TOC), search combobox, sign-in, edit page
- [ ] Visible focus; skip link; landmarks/headings make sense
- [ ] Screen reader: public H2/H3 announced as heading text only (no “Copy link…” appended)
- [ ] Editor: when Publishing readiness lists blockers, Page settings & governance is open
- [ ] Homepage-assigned KB landing shows previous/next when the tree has 2+ pages
- [ ] Labels/names on controls; dialogs trap focus and restore it
- [ ] Contrast on body, links, badges, buttons (sample pages)
- [ ] Zoom to 200% / narrow viewport: no loss of content or function
- [ ] Tables expose header scope; images have alt; video embeds have titles
- [ ] Mobile: page tree, article, TOC stack without horizontal scroll traps

## Sign-off

- Date:
- Tester:
- Exceptions tracked:
- Accessibility claim wording for release notes:

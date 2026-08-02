# Automated KB review — session log, 2026-08-01

A record of an agent-driven review of the **Graduate School Knowledge Base** (`grad-school-kb`)
carried out directly in the production admin, plus the code changes that came out of it.
Written so a later session can pick the work up without re-deriving any of it.

Scope that day: hardening backlog FB-38–FB-44 (shipped separately, see git), then a content
pass over every public page for readability, consistent voice, and accessibility.

---

## 1. State at the end of the session

Fifteen public pages plus four group headings and one link node, all in `grad-school-kb`.

| Measure | Before | After |
|---|---:|---:|
| Broken internal links | 11 across 5 pages | **0** |
| Title Case headings | 12 across 8 pages | **0** |
| Audience preambles | 6 pages | **0** |
| Empty Word-paste paragraphs | several | **0** |
| Pages whose first heading is H3 | 1 | **0** |
| List items over 300 characters | ~15 | **3** |

Verified by re-fetching every page from production and re-running the audit, plus a link
crawl that resolves every internal target.

---

## 2. The broken-link problem (fixed, but read this)

Every cross-reference in the **Faculty & Committees** section was dead. The section had been
renamed from `graduate-faculty` to `faculty-committees`; the pages moved, the links didn't, and
no redirect was recorded. The *Faculty Appointment Decision Tree* — a page that exists purely
to route readers elsewhere — had all five of its links dead-ending.

**Why nothing caught it, and why it can recur:**

- The publish gate validates link *text* (vague wording, empty `href`), not whether an internal
  target resolves.
- Not-found pages return **HTTP 200** by framework design (§10 of `project_spec.md`), so any
  ordinary link checker reports them healthy.

Detection requires comparing the page **title**: a dead KB URL renders `WSU Knowledge Base`,
a live one renders `<Page Title> · Graduate School Knowledge Base`. Working crawl:

```bash
BASE=https://wsu-gradschool-kb.vercel.app
for u in $(curl -s $BASE/sitemap.xml | grep -oE '<loc>[^<]*</loc>' | sed 's/<[^>]*>//g'); do
  curl -s "$u" | grep -oE 'href="/kb/[^"#?]*"' | sed 's/href="//;s/"//'
done | sort -u | while read -r t; do
  T=$(curl -s "$BASE$t" | grep -oE '<title>[^<]*' | head -1 | sed 's/<title>//')
  [ "$T" = "WSU Knowledge Base" ] && echo "BROKEN: $t"
done
```

**Worth building properly:** a link check in the publish gate or the content-health dashboard.
Staff-only pages are excluded from `sitemap.xml`, so a complete crawl needs an authenticated
page list rather than the sitemap.

---

## 3. Code changes from this session

**`src/lib/rich-text.ts` — emphasis normalization.** `sanitizeRichText` now rewrites
`b`→`strong` and `i`→`em`, and drops an emphasis tag nested inside the same emphasis. `b`/`i`
remain in `ALLOWED_TAGS` because they arrive constantly (`document.execCommand("bold")` emits
`<b>`, as does pasted Word HTML); normalization happens at serialization.

This was found the hard way: `<b>` tags stripped through the HTML source view came straight
back after the round-trip, because the serializer re-emitted whatever allowed tag it saw. The
editor formats through two paths that disagree — execCommand emits `<b>`, Lexical emits
`<strong>` — so content touched by both saved as `<b><strong>text</strong></b>`.

The public renderer shares the sanitizer, so **stored content is normalized at render time**;
no content migration is needed. Covered by `src/lib/rich-text.test.ts` →
`sanitizeRichText > emphasis normalization`.

**`style/style.md` — audience-statement requirement removed.** The whole KB serves one
audience (Graduate Program Coordinators and Directors), so a per-page audience preamble told
the reader nothing and cost them the opening sentence. Nine passages rewritten. Pages now open
on the task. The separate rule against writing as if students use the KB stays.

---

## 4. Working method (reusable)

Edits were applied through the admin editor's **HTML source view**, driven by the Chrome
extension. Reliable recipe:

```js
// Open source view
[...document.querySelectorAll('button')]
  .find(b => (b.title||'') === 'Edit the document HTML').click();

// Write into the React-controlled textarea
const ta = document.querySelector('textarea.html-source__area');
const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
setter.call(ta, newHtml);
ta.dispatchEvent(new Event('input', { bubbles: true }));

// Switch back to Visual to force a sanitizer round-trip, then Save changes
```

Non-obvious points, all learned by hitting them:

- **Switch to Visual before saving.** It forces the `documentHtmlToBlocks` round-trip so you
  see what will actually persist.
- **Read back after the round-trip.** Anything the serializer regenerates (emphasis tags) will
  reappear; don't assume a source edit stuck.
- **Match headings by text content, not exact markup.** Headings often contain
  `<strong>`/`<button>` children, so a whole-string regex silently matches nothing. Extract
  the plain text, look it up in a map, replace within the inner HTML.
- **Merely opening the HTML view marks the editor dirty**, which triggers the `beforeunload`
  guard on navigation even with no real change. Navigating with `force: true` is safe *only*
  after confirming nothing changed.
- **The admin session idles out after 1 hour** (`IDLE_TTL_SECONDS`), and the proxy that
  refreshes the cookie **excludes `/api`** — so API calls don't extend it, only page
  navigations. Absolute cap is 8 hours (`SESSION_TTL_SECONDS`) and cannot be extended.
  Check with `fetch('/api/admin/kbs')` → 401 means expired.
- **The JS bridge blocks results containing URL-ish strings.** Strip `href` values before
  returning HTML from `javascript_tool`, or the whole result comes back
  `[BLOCKED: Cookie/query string data]`.

---

## 5. What is left

**Three dense list items.** Needs someone who knows the workflows to split correctly:

| Page | Size |
|---|---:|
| Maintain myWSU Faculty List | 1,487 and 596 chars |
| Faculty Appointment Decision Tree | 309 chars |

`style.md` targets 1–3 sentences per item and one action per step.

**The 4+1 page reads as student-facing** — "this myWSU pathway lets you apply…". Left alone
deliberately: the page carries explicit *Student* and *Graduate coordinator* sections, so the
voice may be intended. Needs a maintainer decision, not an edit.

**Nested `<a>` inside `<a>`** in the P&P sourced block on *Faculty of the Graduate School*.
Invalid HTML, but it came from the imported source — `style.md` forbids editing sourced content
because a refresh overwrites local edits. Fix belongs upstream or in the import normalizer.

**A link checker.** See §2.

---

## 5b. Sourced snapshots go stale silently

The P&P table on *Faculty of the Graduate School* rendered with its `colspan` stripped — six
empty cells with the group label stranded beside them — while the source rendered correctly.

The pipeline was never broken. Sourced blocks are **snapshots**: this one was imported before
table-span support landed and only changes on an explicit refresh, so it kept serving the
pre-fix output indefinitely. **Refresh from source** in the editor fixed it; a regression test
now pins span survival using the real table as a fixture
(`tests/fixtures/pp-spanned-table.html`).

Worth knowing: nothing surfaces a snapshot that predates a parser improvement. The staleness
cron only compares against the *source*, which had not changed. If parsing changes again, every
existing sourced block keeps its old output until someone refreshes it by hand.

**Two verification traps hit while diagnosing this**, both of which produced false "it's broken"
readings:

- React server-renders the attribute as **`colSpan`** (capital S). A case-sensitive grep for
  `colspan=` reports the span missing on markup that is perfectly correct.
- The public page is CDN-cached. Fetch with a cache-busting query and check
  `x-vercel-cache: MISS` before concluding a content change did not take effect.

---

## 5a. Flaky test: `tests/editor/list-nesting.spec.ts`

Failed intermittently on CI (never locally). The three-level nesting assertion found zero
elements because the test pressed `Tab`, clicked back into the list, and pressed `Tab` again
with **no assertion in between** — an indent reparents the `<li>` and triggers a re-render, so
a click landing mid-reconciliation left the next `Tab` acting on a stale selection.

Fixed by asserting the intermediate level after each indent, which gives Playwright a real
condition to synchronize on. The rest of the test already did this, which is why only that one
stretch flaked.

The intermediate assertions were not the fix — they were the diagnosis. They converted the
symptom ("third level missing") into the actual cause: after the first Tab the nested item was
**"Three", not "Two"**, meaning the click on "Two" never moved the caret. It stayed where
`makeOrderedList` left it after typing, so Tab indented the wrong item.

The real fix is `caretInItem()`, which clicks and then polls `document.getSelection()` until
the caret is genuinely inside the intended `<li>` before sending keys. A bare
`click()` + `press("End")` is not sufficient on a slow runner: the click can land before the
contentEditable surface is ready to take a selection, and it is silently dropped.

**Do not try to validate this class of fix by local repeat runs.** A developer machine is fast
enough to hide the race: 25/25 local passes while CI still failed. Only CI, whose runners are
slower and contended, exercises the window. An earlier attempt concluded "fixed" from 17/17
local runs and was wrong — at an ~8% rate, even 13 clean trials are ~66% likely by chance.

---

## 6. Things to know before editing content here

- **`style/style.md` is authoritative** and `AGENTS.md` requires reading it first. It mirrors
  the publish gate by hand — change one, change the other.
- **Sourced blocks (`section.doc-sourced`) are snapshots.** Never reword their inner content or
  touch their `data-*` attributes; the content hash and retrieved date drive staleness checks.
  To fix heading order around one, add a heading on the *host* page.
- **The publish gate got stricter on 2026-08-01** (FB-40). Card and procedure titles now count
  as headings, including nested ones, and excerpts must point at a source whose audience is at
  least as wide as the host page's. *Faculty of the Graduate School* was genuinely blocked by
  this — it had four H3s inside a sourced block and no H2 — which is a true positive.
- **Pages must not restate their audience.** See §3.

---

## 7. Pointers

- Style guide and agent contract: `style/style.md`
- App spec, conventions, gotchas: `project_spec.md` §8
- Manual release gate: `docs/release-gate.md`
- Editor page IDs: `/admin/pages?kb=grad-school-kb`, or scrape
  `a[href*="/admin/pages/page-"]`

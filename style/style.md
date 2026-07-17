# KB page style guide

This folder is a **review-and-edit pipeline** for KB page HTML. Drop a draft into `draft/`, have an agent review and edit it against this guide, and collect the improved page from `edited/`, ready to paste into the visual editor.

## Folder layout

| Folder | Contents | Agent may write? |
|--------|----------|------------------|
| `draft/` | Incoming HTML that has **not** passed a style review | No — never modify or overwrite a draft |
| `edited/` | Agent-edited HTML that has passed the workflow below, awaiting paste into the editor | Yes — save output here |
| `reference/` | Approved style exemplars | **Never** — read-only models |

Filenames keep the page title, with a lowercase `.html` extension (e.g. `draft/Maintaining Program Fact Sheets.html`).

**Reference page:** `reference/Maintaining Degree Requirements in myWSU.html` — a procedural how-to for graduate program coordinators and department staff. Use it as the tone, structure, and markup model unless a page type clearly differs (e.g. policy overview, FAQ-only).

---

## How agents should use this folder

1. Read this guide in full, then the reference page, then the draft HTML file.
2. Compare structure, prose, and markup to the reference page and to the guardrails below.
3. Produce a **review** with:
   - **Must fix** — blocks publish, breaks accessibility, or misleads readers.
   - **Should fix** — readability, consistency, or KB best practice.
   - **Optional** — polish (word choice, tighter bullets, clearer headings).
4. **Apply the edits** (unless the user asks for a review only): fix every Must fix and Should fix item, apply Optional items when they clearly help, and save the full edited page to `edited/[same filename]`. Follow the **Applying edits** contract below.
5. Preserve the editor contract (allowed tags, `data-block-id`, block types). Do not invent `script`, `style`, `iframe`, or arbitrary classes.
6. Prefer **minimal diffs** — fix what hurts comprehension or compliance; do not rewrite voice without cause.

---

## Applying edits (agent contract)

- **Never modify** files in `reference/` or the original file in `draft/`. Write the complete edited page to `edited/[same filename]`, so the draft and the edited version can be diffed side by side.
- **Minimal diffs.** Change only what a review item justifies. Do not rewrite voice, reorder sections, or re-ID blocks without cause.
- **Keep existing `data-block-id` values** on every block you retain, even when you edit its text. Stable IDs preserve anchor links and keep diffs reviewable.
- **New blocks** get a new unique ID in the form `block-[uuid]` (e.g. `block-3f2a9c1e-…`). Never reuse or duplicate an ID. On headings, set `id` equal to `data-block-id`.
- **Deleted blocks:** remove the whole element. Do not leave empty paragraphs or orphaned figures.
- **After editing,** re-run the readiness checklist against the edited file, then respond with the review plus a short change log (see **Agent review output format**).

---

## Audience and scope

Graduate School KB pages are written primarily for **staff who configure or administer systems** — program coordinators, department staff, Graduate School reviewers — not for students.

- **State the audience in the first paragraph** of every procedural page: who uses it and what they will accomplish.
- **Do not write as if students use the page.** Students interact with downstream workflows (e.g. future **Program of Study** submission) that staff configure elsewhere.
- When student impact matters, frame it for coordinators: *"These rules feed the Program of Study workflow students will use."*
- Troubleshooting and status sections should address **coordinator actions and expectations**, not student-visible behavior on this page.

---

## Page types and intent

| Type | Goal | Typical shape |
|------|------|----------------|
| **Procedural how-to** (reference) | Staff completes a task in a system | Start here → Critical rule (H2) → Before you begin → Choose path → Parts/steps → Submit → Examples → Need help? |
| **Policy / concept** | Reader understands a rule or decision | Short intro → H2 sections by topic → Related links |
| **Troubleshooting** | Reader fixes a problem | Symptom → Cause → Fix (numbered) → Escalation |

Match structure to intent. A how-to should not bury steps under long prose; a policy page should not read like a click-by-click manual.

---

## Document structure (from the reference page)

### Heading style

- **Sentence case** for all headings: capitalize the first word, proper nouns, and exact UI labels only. ✅ *Choose the right path* ❌ *Choosing The Right Path*.
- **Open with an H2.** The first block on the page is the *Start here* H2 — do not place an intro paragraph above it. That content belongs under *Start here*.
- Prefer direct, task-shaped headings over gerund titles: *Roles and permissions* or *Edit a Fact Sheet*, not *Understanding Roles and Permissions*.

### Opening

- **First H2** orients the reader. The reference uses *Start here: What you need to know*.
- **First paragraph names the audience** and clarifies who does *not* use the page (students).
- **Second paragraph** states scope: what the page covers and the main concepts (e.g. credit requirements + course sequences).
- Put **critical warnings** before detailed steps. Promote non-negotiable rules to their **own H2** when the rule is as important as the procedure itself (e.g. *Important: Use effective terms correctly*), not buried as an H3 under Start here.

### Major sections (H2)

Use H2 for top-level sections only. The reference pattern:

1. **Start here** — audience, scope, overview of main parts
2. **Important: [critical rule]** — standalone H2 when a mistake has serious consequences (optional but recommended for high-stakes rules)
3. **Before you begin** — navigation path, prerequisites, gather list
4. **Choose the right path** — decision table when workflows branch
5. **Part 1 / Part 2** — sequential work units with clear stop points
6. **Submit your work** — how to finish, withdrawal, and status meanings
7. **Program examples** — concrete illustrations (optional but valuable)
8. **Need help?** — common problems + contact

### Subsections (H3)

Use H3 under an H2 for steps, field definitions, examples, or FAQ clusters:

- `Part 1, Step 1: Find the Program Plan`
- `Part 2, Step 2: Add courses to the sequence`
- `Credit fields`
- `Submission status guide`
- `Common problems`

**Never place an H3 before the first H2** on the page (publish gate blocks this).

### Multi-part procedures

When a page has Part 1, Part 2, etc., **prefix step headings with the part number** to avoid confusion when readers jump mid-page:

- ✅ `Part 1, Step 1: …` / `Part 2, Step 3: …`
- ❌ `Step 1: …` repeated under each part without context

### Section flow rules

- **One main job per H2.** If a section does two unrelated jobs, split it.
- **Tell readers when to stop.** The reference says *Stop here if the program only needs basic credit requirements* — use similar off-ramps so readers do not wade through irrelevant steps.
- **Repeat navigation paths** when the reader may land mid-page (Before you begin + Part 1 both show the menu trail).
- **Do not duplicate procedures** in Need help? — point readers to the canonical section instead.

---

## Prose and English

### Voice

- **Second person** (*you*) for instructions; **imperative** verbs (*Click Save*, *Gather this information*).
- **Present tense** for UI and current policy.
- **Active voice** preferred: *Click Save* not *Save should be clicked*.
- **Plain words** over jargon; define acronyms on first use (e.g. satisfactory/fail (S/F), Program of Study).

### Sentence and paragraph length

- **One idea per paragraph.** Target 1–3 sentences; avoid 5+ sentence blocks.
- **One action per numbered step.** If a step says *Set X, enter Y, and click Z*, split into separate `<li>` items unless the three actions are truly atomic.
- **Front-load the point** in bullets: lead with the constraint or action, then the detail.
- **Split long gather-list items.** Prerequisites that mix format rules, tools, and warnings belong in separate bullets.

### Wording consistency

Align with the reference page:

| Prefer | Avoid |
|--------|--------|
| Program Plan | program plan / plan (inconsistent caps) |
| Program code **P1234** (no space) | P 1234, p1234 |
| Program plan code **P1234_1234** | P1234-1234, inconsistent separators |
| Campus prefix **E, G, P, S, T, V** | unexplained first letter |
| Effective Term | effective term row / catalog year (unless defined) |
| Graduate School | grad school / GS (in body text) |
| myWSU | MyWSU / PeopleSoft (unless explaining legacy name) |
| **Search** (button) | search / Search inconsistently |
| **Look Up** (two words, UI/OBIEE) | Lookup / Look up inconsistently |
| OBIEE Course ID Look Up | OBIEE Course ID Lookup |
| Save | save (when naming a button) |
| Submitted / Withdrawn / Approved / Returned / Activated | mixing old labels (Active, Under Review) without explanation |
| Communications and Outreach team | Outreach and Technology team, other team-name variants |
| Graduate School Service Desk | Graduate School Jira Help Desk, Jira Service Desk |

**UI labels** must match the product exactly, in **bold**: `**Update Complete, Submit to Grad School**`, `**Sub-Status**`, `**Search**`, `**+**`.

For systems this table does not cover (e.g. WordPress Fact Sheets, Slate), match the product's own UI labels exactly and keep body-text usage internally consistent (pick one form — *Fact Sheet* — and use it throughout, reserving the product spelling — **Factsheets** — for the bolded UI label). When a page introduces recurring terms, propose new rows for this table in your review.

**Navigation paths** use italic with `>` separators:

`<em>Main Menu &gt; WSU &gt; Advising &gt; Minimum Degree Requirements &gt; Degree Requirements</em>`

**External system paths** (OBIEE, etc.) follow the same pattern:

`<em>Dashboards &gt; WSU Graduate Professional Education &gt; Minimum Degree Requirements</em>`, then name the page: **OBIEE Course ID Look Up**.

### Grammar and mechanics

- Use **straight apostrophes** in new text (`don't`, not curly Word quotes).
- Use `&amp;` in HTML when needed; avoid bare `&` in text nodes.
- **Oxford comma** for series in instructional lists.
- **Numbers:** spell out one–nine in prose if not tied to UI; use digits for credits, steps, and field values.
- Avoid **ALL CAPS** for emphasis; use bold for warnings.
- Define **S/F** as satisfactory/fail on first mention.

### Readability checks (agent checklist)

- [ ] Does the first paragraph name the audience and clarify who does not use this page?
- [ ] Can a coordinator skim H2s and know the full journey?
- [ ] Are critical rules promoted to H2 or bold lead sentences, not buried in lists?
- [ ] Is every acronym or internal term defined or linked once?
- [ ] Are high-effort prerequisites flagged (**Important:** gather Course IDs before opening myWSU)?
- [ ] Are examples introduced with a sentence explaining what to look for?
- [ ] Does the status/workflow section match who acts at each step (coordinator, Graduate School, ITS)?
- [ ] Does *Need help?* avoid repeating full procedures already documented above?

---

## Lists

### When to use which

| List type | Use for |
|-----------|---------|
| **Numbered (`<ol>`)** | Sequences, steps that must happen in order |
| **Bulleted (`<ul>`)** | Unordered requirements, options, troubleshooting tips |
| **Nested list** | Sub-options under one numbered item (e.g. degree links under credit requirements) |

### List style (reference)

- **Gather / prerequisite lists** — bullets, parallel grammar; separate bullets for code formats, credit totals, and tool prep.
- **Procedure steps** — numbered; each item starts with a verb; UI buttons named in **bold**.
- **Troubleshooting** — problem as bold quoted line, then bullets for fixes; cross-reference earlier sections when the full procedure already exists.

### List guardrails

- **Click sequences must be numbered lists.** Do not write a procedure as alternating prose paragraphs and screenshots; convert it to an `<ol>` with each screenshot placed after the step it illustrates.
- Keep **parallel structure** (all items noun phrases or all verb-first).
- Do not split one numbered list across paragraphs (creates duplicate IDs and restarted numbering in the editor).
- **Indent** only when nesting is meaningful; do not indent the first item of a list.
- Prefer **3–7 items** per list; break long lists into subsections with H3.
- Use **Important:** as a bold prefix in a dedicated bullet — not inline color spans.

---

## Tables

Use `doc-table` with `data-header-row="true"` when comparing options or defining fields.

**Good patterns from the reference:**

- **Decision table:** *If your Program Plan only requires…* | *Complete…* (keep second column short)
- **Field glossary:** *Field* | *What to enter*
- **Status guide:** *Status* | *What it means* | *What you do*

### Submission status (myWSU degree requirements pattern)

When documenting coordinator submission workflows, reflect **who acts** at each stage:

| Status | Actor | Coordinator action |
|--------|-------|-------------------|
| Work in Progress - Department | Coordinator | Keep editing |
| Submitted | Coordinator | Wait; withdraw if mistake found |
| Withdrawn | Coordinator | Fix and resubmit |
| Approved | Graduate School | Wait for ITS |
| Returned | ITS | Fix and resubmit |
| Activated | ITS | No action — requirements are live |

Agents should flag pages that skip **Approved** vs **Activated** or conflate them.

### Table guardrails

- Every table needs a **header row** (publish gate).
- Header cells use `<th>`; data cells use `<td>`.
- Keep cell text short; move long explanations to a paragraph below the table.
- Do not use tables for layout or for a single column of prose (use a list).

---

## Links

### Link text

- **Describe the destination**, not the action:
  ✅ `Master's degree university requirements`
  ❌ `click here`, `here`, `read more`, `link`, bare URL as text
- For **email**, use `mailto:` with the address as link text or a clear label plus mailto.
- For **tickets/portals**, name the system: `Help with myWSU`, not `submit a ticket`.
- For **OBIEE**, use **OBIEE Course ID Look Up** (two words) and include the breadcrumb trail in surrounding prose.

### Link behavior

- External links: `target="_blank"` and `rel="noopener noreferrer"`.
- Internal KB links: `/kb/{slug}/...` paths, no `target="_blank"` unless opening a file download.
- Long URLs (OBIEE, Confluence): still use descriptive text; do not expose the full query string as visible text.
- Recommend bookmarking frequently used external lookups (OBIEE, Confluence) in gather lists.

---

## Images

Use `figure.doc-image` with:

- **`alt`** — describes what the reader needs from the screenshot (menu trail, screen name, key fields, what an example demonstrates).
  ✅ `Completed Chemistry Ph.D. plan showing credit totals, course sequences, and Course Requirements text box`
  ❌ `image1`, `screenshot`, `Example myWSU Completed Degree Requirement`
- **`data-asset-id`** or stable `/kb/.../files/...` `src` when known.
- Place images **immediately after** the step or navigation line they illustrate.

### Image guardrails

- Every non-decorative image needs **alt text** (publish gate).
- Do not rely on images alone for essential text — repeat menu paths and button names in prose.
- Do not identify fields only by screenshot annotation letters (*enter the score in box C*); name the field label in prose and let the image confirm it.
- **Screenshot-only examples** need an intro paragraph telling coordinators what to compare in the image.
- Caption is optional; alt carries the accessibility load.

---

## Emphasis and alerts

| Mechanism | When |
|-----------|------|
| `<strong>` | UI labels, field names, warnings, step outcomes, status names |
| `<em>` | Navigation paths, soft emphasis |
| Standalone bold paragraph | Critical *do not* rules |
| **Important:** prefix in a bullet | High-effort prep steps (e.g. gather Course IDs before opening myWSU) |
| Info box (`doc-alert`) | Page-level callout visible to readers (use sparingly) |

- Prefer `<strong>` over `<b>` for all new edits.
- Avoid inline `style="color: …"` or `font-size` on headings — theme controls heading size.
- When contrasting fast vs slow workflows, state both plainly (Course ID entry is fast; catalog search without IDs is slow and painful).

---

## HTML and editor contract

Content in this folder should round-trip through `documentHtmlToBlocks` / the visual editor.

### Allowed block patterns

- `<h2 class="anchor-heading" …>` and `<h3 class="anchor-heading" …>` with `data-block-id` and matching `id`
- `<p data-block-id="…">` for paragraphs
- `<ol>` / `<ul data-block-id="…">` with `<li>` children (nested lists inside `<li>` only)
- `<table class="doc-table" data-header-row="true" …>` with `<tbody>`, `<tr>`, `<th>`, `<td>`
- `<figure class="doc-image" …>` with `<img alt="…" src="…">`
- `<div class="doc-excerpt" data-block-id="…" data-source-page-id="…">` (optionally
  `data-source-heading-id="…"`, `data-label="…"`, `data-new-tab="true"`) — a live include of
  another KB page's section, resolved at render time. Top-level only; never place one inside a
  card or procedure section. Preserve these divs and their attributes exactly; do not add content
  inside them.
- `<section class="doc-sourced" data-block-id="…" data-source-url="…">` (optionally
  `data-source-anchor`, `data-label`, `data-new-tab`, `data-heading-text`, `data-retrieved-at`,
  `data-content-hash`) — a snapshot imported from an approved external source (the P&P site),
  rendered with a provenance callout. Top-level only. **Do not reword the inner content** — it
  mirrors the published source and a refresh overwrites local edits — and **never change the data
  attributes**: the content hash and retrieved date drive staleness checks.
- Inline: `<a>`, `<strong>`, `<em>`, `<br>` (sparingly)

### Do not use

- `<h1>` (page title lives in metadata, not body)
- `<h4>`–`<h6>` (map to H2/H3)
- `<div>` as primary content blocks (except `doc-section-break` if needed)
- Pasted Word/HTML: `span` with font-size on headings, `mso-*`, empty paragraphs, `&nbsp;` runs
- `script`, `style`, `iframe`, `onclick`, custom CSS classes
- `<b>` in new content (use `<strong>`)

### `data-block-id`

- Stable IDs aid anchors and diffs; do not duplicate the same ID on two blocks.
- Headings: `id` should match `data-block-id` for anchor links.

---

## Publish and readiness guardrails

These mirror the live editor **Publishing readiness** checklist and `validatePageForPublish`:

| Check | Requirement |
|-------|----------------|
| Heading order | H2 before any H3 |
| Images | Alt text or decorative flag |
| Tables | Header row or header column |
| Links | No vague text; no empty `href` |
| Assets | Images/files referenced must be active in the library |
| Excerpts | `doc-excerpt` blocks must reference an existing, published page and a section that still exists on it |
| Governance (page metadata, not in HTML) | Title, summary, responsible office, contact email, last reviewed date |

When reviewing HTML-only files, **note metadata gaps** the author must fill in the editor (summary, dates, etc.).

---

## Section templates (copy patterns)

### Start here (H2)

```html
<h2 class="anchor-heading" data-block-id="…" id="…">Start here: [topic in plain language]</h2>
<p>This page is for <strong>[audience role]</strong> who [main task]. [Downstream audience, e.g. students] do not use this page directly; [what this feeds].</p>
<p>[Scope: what the page covers in plain terms.]</p>
```

### Important rule (H2) — use when stakes are high

```html
<h2 class="anchor-heading" …>Important: [rule in plain language]</h2>
<p><strong>Do not [critical mistake].</strong></p>
<p>Instead, [correct action with UI labels in bold].</p>
```

### Before you begin (H2)

```html
<h2 class="anchor-heading" …>Before you begin</h2>
<p><strong>Navigation path:</strong> <em>Menu &gt; …</em></p>
<figure class="doc-image" …><img alt="Menu trail: …" src="…"></figure>
<p><strong>Gather this information before you open the page:</strong></p>
<ul>
  <li>Program codes (<strong>P1234</strong>) and plan codes (<strong>P1234_1234</strong>) …</li>
  <li><strong>Important:</strong> [prep that saves time, with tool breadcrumb and link]</li>
</ul>
```

### Choose the right path (H2)

Use a **decision table** when readers pick one of 2–3 workflows. Keep the *Complete…* column short.

### Part N: [name] (H2)

```html
<h2 class="anchor-heading" …>Part 1: [name]</h2>
<p><strong>Complete this first.</strong> One sentence on why.</p>
<h3 class="anchor-heading" …>Part 1, Step 1: [verb phrase]</h3>
<ol>…</ol>
<figure class="doc-image" …></figure>
<p><strong>Stop here if …</strong></p>
```

### Submit your work (H2)

```html
<h2 class="anchor-heading" …>Submit your work</h2>
<h3 class="anchor-heading" …>How to submit</h3>
<ol>
  <li>Review …</li>
  <li>Click <strong>Update Complete, Submit to Grad School</strong>. Status becomes <strong>Submitted</strong>.</li>
  <li>Graduate School reviews → <strong>Approved</strong>.</li>
  <li>ITS <strong>Activates</strong> or <strong>Returns</strong>.</li>
</ol>
<figure class="doc-image" …></figure>
<p><strong>If you find a mistake after submitting:</strong></p>
<ol>… withdraw → <strong>Withdrawn</strong> → fix → resubmit …</ol>
<h3 class="anchor-heading" …>Submission status guide</h3>
<table class="doc-table" …>…</table>
```

### Program examples (H2)

```html
<h3 class="anchor-heading" …>Example 1: [program name]</h3>
<p>This screenshot shows [what to compare: credit totals, sequences, text box].</p>
<figure class="doc-image" …><img alt="[specific description of what the example shows]" src="…"></figure>
```

For complex programs, keep the full detail to show what is possible. Add an intro sentence: *Your program may need fewer steps, but this illustrates…*

### Need help? (H2)

```html
<h2 class="anchor-heading" …>Need help?</h2>
<h3 class="anchor-heading" …>Common problems</h3>
<p><strong>"[Quoted symptom]"</strong></p>
<ul>…</ul>
<p><strong>"I need to make changes after submitting."</strong></p>
<ul><li>See <strong>[section name]</strong> above.</li></ul>
<p><strong>"My submission is Approved but requirements are not live yet."</strong></p>
<ul><li><strong>Approved</strong> means Graduate School signed off. Requirements go live only after ITS <strong>Activates</strong> them.</li></ul>
<h3 class="anchor-heading" …>Get support</h3>
<p>For questions… <a href="…">Help with myWSU</a> or <a href="mailto:…">email</a>.</p>
```

---

## Reference page notes (Maintaining Degree Requirements in myWSU)

**Patterns to emulate:**

- Audience stated in paragraph one; students referenced only via downstream Program of Study workflow
- Critical effective-term rule as its own H2 before procedural steps
- Program code formats (P1234, P1234_1234) and campus prefixes in gather list
- Course ID prep flagged as **Important** with OBIEE breadcrumb and fast-vs-slow contrast
- Decision table with short *Complete…* cells
- Part-prefixed step headings (Part 1, Step 1)
- Submission workflow with Submitted → Approved → Activated/Returned and actor roles
- Screenshot example with intro paragraph; full Mathematics example showing complex programs are supported
- Troubleshooting cross-references instead of duplicating withdraw/resubmit steps
- Approved vs Activated explained for coordinators

**Agents should still flag on other pages:**

- Missing audience statement
- Student-facing voice on staff-only pages
- Skipped or conflated submission statuses
- Lookup vs Look Up inconsistency
- Generic screenshot alt text
- Repeated procedures in Need help?

---

## Agent review output format

When reviewing a file `style/draft/Some Page.html`, respond with:

```markdown
## Summary
[One paragraph: audience, page type, overall quality]

## Must fix
- [Issue]: [Location hint] → [Suggested fix]

## Should fix
- …

## Optional polish
- …

## Publish readiness
- [ ] Heading order  [ ] Tables  [ ] Links  [ ] Images/alt  [ ] Editor-safe HTML
- [ ] Audience clear  [ ] Status/workflow accurate  [ ] No duplicate troubleshooting

## Suggested rewrites (if any)
[Only for high-impact paragraphs; provide replacement HTML snippets]
```

When you also applied edits, replace **Suggested rewrites** with a change log:

```markdown
## Changes applied
- [Review item] → [what changed, with a location hint]
- …

Saved to `style/edited/Some Page.html`. Metadata gaps to fill in the editor: [summary, dates, etc.]
```

---

## Adding new reference pages

Passing the style workflow puts a page in `edited/` — that alone does not make it an exemplar. Promotion to `reference/` is a **human decision**, made when a published page is good enough to serve as a model:

1. Export readable HTML via the editor source view (or `blocksToSourceHtml` output).
2. Save as `style/reference/[Page Title].html`.
3. Name it in this guide (update the **Reference page** line or add a second exemplar entry) and remove the stale copies from `draft/` and `edited/`.
4. If the page introduces a **new pattern** (e.g. multi-actor approval workflow, external system breadcrumb, WordPress terminology), add a short subsection under **Document structure**, **Wording consistency**, or **Section templates** here.

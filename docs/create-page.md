# Create a page and get it to production

This guide covers taking content from an **external link** or a **Word (.docx) upload** and shipping a published page in the live Graduate School Knowledge Base.

Production admin: https://wsu-gradschool-kb.vercel.app/admin  
Sign in with your provisioned account. Editors can create and edit drafts; **Owner, Admin, or Manager** can publish (Editors propose pages for review instead).

---

## What “done” means

A page is ready for production when all of the following are true:

1. It lives under the right **KB** and **parent** in the page tree (group heading or section).
2. Body content is structured for readers (clear headings, scannable steps, working links/images).
3. **Basic editorial editing** is finished — readability and flow, not a paste dump.
4. Required metadata and publish-gate checks pass (summary, contact, alt text, etc.).
5. Status is **Published** (or approved from Proposed), and a quick public URL check looks right.

Publishing is always a **separate step** from create/import. New pages start as **draft**.

---

## Before you start

| Decision | Why it matters |
|----------|----------------|
| Which knowledge base? | Public Grad School KB vs staff KB changes who can read the page. |
| Parent in the tree | Use an existing **group** (e.g. Admissions) or create one first. Draft parents hide nested pages from the public tree. |
| Page vs group vs link | **Page** = article body. **Group** = tree heading only. **Link** = tree item that opens another URL. |
| Source type | Link/web page → create page + bring content in. Word export → **Import from Word**. |

---

## Path A — Create from a link (web page)

Use this when the source is a live URL (for example a Grad School public page).

### 1. Create the shell page

1. Open **Pages** for the target KB → **Create Page**.
2. Choose **Page** (not group/link).
3. Set **title** (reader-facing H1) and optional **slug**.
4. Nest under the correct **parent** (e.g. Admissions).
5. Create → you land in the editor with a placeholder draft.

### 2. Bring the content in

Pick the approach that matches the source:

**A. Adapt into native KB blocks (most full pages)**  
Rewrite or paste into the visual editor using headings, paragraphs, lists, tables, procedure sections, and info boxes. This is the usual path for a complete public page that should feel like KB content.

**B. P&P sourced section (allowlisted Grad School P&P URLs)**  
In the editor, insert a **sourced** block, paste a section URL that includes a `#heading-anchor`, and import. Sourced content is a **snapshot** with source attribution; refresh later if the P&P section changes. Full pages without a usable section anchor are usually better as native blocks (A).

**C. Optional style pass before paste**  
For large or messy HTML, use the `style/` pipeline (`style/README.md`) to review/edit draft HTML, then paste the edited markup into the editor.

### 3. Bring images and files with the page

- Download screenshots/figures from the source (use full-size assets when available).
- Upload via the editor **media / image** tools (or **Assets**) into the same KB.
- Place each image next to the step or paragraph it illustrates.
- Set **meaningful alt text** for every informative image (required to publish).

Do not leave remote hotlinks to the old site as the only image source for production pages.

### 4. Edit for readability and flow (required)

Import or copy is not enough. Before publish, do a basic editorial pass:

- **Audience and purpose** — one clear job for the page; cut chrome, footers, and “More resources” noise from the source site.
- **Structure** — H2/H3 outline that matches how someone will scan; use **procedure sections** for how-to steps.
- **Flow** — step → supporting image → next step; short paragraphs; lists for sequences; tables for comparisons.
- **Wording** — plain language, consistent terms (myWSU, GradCAS, etc.), strong UI labels in **bold** where helpful.
- **Links** — prefer durable URLs; fix mailto and internal KB links; avoid vague “click here.”
- **Attribution** — if content came from another site, keep a short source line or use a sourced block where appropriate.

When in doubt, compare against an approved exemplar under `style/reference/` and the rules in `style/style.md`.

### 5. Fill metadata and readiness

In the editor sidebar / page settings:

- **Summary** (lead) — one or two sentences; optional **Draft with AI**, then edit.
- **Tags** — a few stable keywords (e.g. `admissions`, `4+1`).
- **Owner / contact / last reviewed** as required by the readiness panel.
- Resolve every item in the **publishing readiness** panel (missing alt, empty summary, vague links, etc.).

Save often while still in **Draft**.

### 6. Publish to production

1. Preview the draft URL if you have access, or use **Edit page** from a staff preview when available.
2. **Save & publish** (Owner/Admin/Manager) or **Propose** for review (Editor).
3. Confirm the public URL: `/kb/<kb-slug>/<parent-path>/<page-slug>`.
4. Spot-check: tree placement, images load, TOC (if enabled), tags, and that draft parents are not hiding the section.

---

## Path B — Create from a Word (.docx) upload

Use this for Confluence (or similar) Word exports.

### 1. Upload and stage

1. Open **Import from Word (.docx)** (`/admin/import`).
2. Choose the target KB and upload the `.docx`.
3. The file becomes a **staged import** — not a published page yet.

### 2. Review the staged import

Open the staged item and check:

- Title, slug, parent path, visibility
- Heading structure and lists/tables
- Extracted images (approve/fix as needed)
- Any parser warnings

Fix structure here when possible; remaining polish happens in the page editor after commit.

### 3. Commit to a draft page

Commit the staged import → creates a **draft** page in the chosen KB/parent. Publishing remains a separate step.

### 4. Edit for readability and flow (required)

Same bar as Path A, step 4. Word imports often need:

- Heading level cleanup
- Split walls of text into procedures, lists, and info boxes
- Image placement and alt text
- Removal of export artifacts (empty spans, odd breaks, leftover Confluence junk)

Optional: run HTML through the `style/` pipeline, then paste refined content back.

### 5. Metadata, readiness, publish

Same as Path A, steps 5–6.

---

## Quick checklist (both paths)

- [ ] Correct KB and parent (group published if the section should appear publicly)
- [ ] Title and slug make sense on the public URL
- [ ] Content adapted for KB readers (not a raw dump)
- [ ] Images uploaded to this KB with alt text
- [ ] Readability and flow pass completed
- [ ] Summary, tags, contact/review fields filled
- [ ] Publishing readiness panel clear
- [ ] Published (or proposed and approved)
- [ ] Public page and tree placement verified

---

## Related docs

| Doc | Use when |
|-----|----------|
| `style/style.md` + `style/README.md` | Deeper style, a11y, and publish-guardrail review before paste |
| `README.md` | Running the app, roles, AI summary env |
| `project_spec.md` | Architecture, publish gate, roles, sourced-content rules |
| `docs/release-gate.md` | Broader release / a11y sign-off (not required per single page) |

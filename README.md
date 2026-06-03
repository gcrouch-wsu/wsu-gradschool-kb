# WSU Graduate School Knowledge Base

Deployable Next.js foundation prototype for the public multi-KB platform described in `project_spec.md`.

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Admin Login

Set these environment variables locally or in Vercel:

```text
KB_ADMIN_EMAIL=
KB_ADMIN_PASSWORD=
KB_ADMIN_SESSION_SECRET=
```

The app also accepts `BOOTSTRAP_OWNER_EMAIL`, `BOOTSTRAP_OWNER_PASSWORD`, and
`BOOTSTRAP_OWNER_SESSION_SECRET` as aliases. Blank values are treated as unset.

If unset, development falls back to:

```text
admin@example.edu / ChangeMe123!
```

Do not use the fallback credentials in production.

If `vercel env pull` creates blank admin values in `.env.local`, set them locally before starting
the dev server. For example:

```text
KB_ADMIN_EMAIL=gcrouch@wsu.edu
KB_ADMIN_PASSWORD=your-local-admin-password
KB_ADMIN_SESSION_SECRET=replace-with-a-long-random-secret
```

## Deployment

The project is a standard Next.js app and can be deployed to Vercel after pushing to GitHub.

```bash
npm run build
```

## Content Storage

KB content (knowledge bases, pages, assets) is read through `src/lib/kb-store.ts`, which uses one of two backends:

- **Neon Postgres** when `DATABASE_URL` is set. The schema is created with `CREATE TABLE IF NOT EXISTS` and seeded from `src/lib/demo-data.ts` automatically on first run.
- **In-memory seed dataset** when `DATABASE_URL` is unset — fine for local development, but not durable.

To use Neon, create a database and set `DATABASE_URL` locally and in Vercel:

```text
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
```

## Importing from Word (.docx)

Admins can import Confluence-exported `.docx` files at `/admin/import`. The document is converted to KB content (headings, paragraphs, lists, tables, and supported web images), previewed for review in the browser, and saved as a **draft** page nested under the location you choose.

Embedded images are promoted into managed image assets when the draft is created. If **Vercel Blob** is configured, the image bytes are stored there; otherwise supported images are retained as data-backed managed assets for local development. Non-web image formats (EMF/WMF) are not yet supported.

## Managing Pages

Signed-in admins can manage pages at `/admin/pages`. The current editor supports reopening drafts, editing page metadata and content blocks in a WYSIWYG-style surface with formatting toolbars, moving a page under a different parent, saving as draft, and publishing. Save and publish actions are available at the top and bottom of the page editor.

The page manager also includes an early page-tree editor. Admins can reorder pages by dragging, drag one page onto another page's "Nest dragged" target to change nesting, edit a page, and publish drafts directly from the tree. The editor supports paragraphs, headings, lists, alerts, editable tables, managed image upload/insertion, fallback image URL blocks, and image width controls. Supported DOCX inline formatting is preserved on import and can be edited in the page editor.

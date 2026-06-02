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

If unset, development falls back to:

```text
admin@example.edu / ChangeMe123!
```

Do not use the fallback credentials in production.

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

Admins can import Confluence-exported `.docx` files at `/admin/import`. The document is converted to KB content (headings, paragraphs, lists), staged for review, and saved as a **draft** page nested under the location you choose.

Embedded images are uploaded to **Vercel Blob** and inlined into the page. This requires a Blob store connected to the project, which sets `BLOB_READ_WRITE_TOKEN` automatically on Vercel (pull it locally with `vercel env pull`). Without the token, text still imports and images are skipped with a notice. Tables and non-web image formats (EMF/WMF) are not yet supported.

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

The current implementation uses seeded in-memory content so the public routes, admin shell, and stable asset route can deploy before Postgres and Blob storage are wired in.

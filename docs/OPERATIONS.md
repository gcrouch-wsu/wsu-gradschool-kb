# Operations

## Deploy Checklist

- Confirm `npm run check`, `npm run lint`, `npm test`, and `npm run build` pass locally or in CI.
- Confirm `npm run test:db` passes against the current Neon test branch before promoting changes that touch migrations or DB behavior.
- Confirm Vercel has `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, and `CRON_SECRET` configured for the target environment.
- If review-date email delivery is expected, confirm `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_TOKEN`, and `EMAIL_FROM`; otherwise expect structured JSON fallback logs.
- Confirm the Vercel plan supports the configured cron count before deploy validation; this project currently schedules audit cleanup, revision cleanup, and review digest routes.
- For Blob-backed assets, confirm the Vercel Blob environment variables are present in the target environment.
- Deploy through the GitHub-to-Vercel flow, then promote the successful Vercel deployment to production.
- After deploy, visit `/`, one public KB landing page, one article page, `/admin`, `/admin/pages`, and `/admin/assets`.
- Confirm scheduled cron routes return authorized success when called with `Authorization: Bearer $CRON_SECRET`.
- Check Vercel function logs for structured JSON errors with `timestamp`, `severity`, `route`, `message`, and `stack`.

## Rollback Checklist

- Use the Vercel dashboard to roll back or promote the last known-good production deployment.
- If a database migration caused the incident, do not point production at an older code deployment until the schema compatibility has been checked.
- Keep Neon production data on the current production branch; use a Neon branch restore only after confirming the restore point and expected data loss window.
- Re-run the public KB smoke checks and admin sign-in check after rollback.
- Record the deployment URL, commit SHA, symptom, rollback action, and follow-up issue in the project tracker.

## Neon Branch Strategy

- Use a separate Neon branch for live-DB CI and destructive manual testing.
- Run new migrations on a Neon test branch before merging to `main`.
- Avoid manual schema edits on production; add versioned migrations in `src/lib/migrations/index.ts`.
- Before large imports or risky schema changes, create a Neon branch or restore point that can be used to inspect or recover data.

## Cron Secrets

- Cron routes require `Authorization: Bearer $CRON_SECRET`.
- Rotate `CRON_SECRET` by updating Vercel environment variables, redeploying, and confirming the scheduled routes still authorize.
- Treat missing email/provider configuration as non-fatal unless the specific cron route documents otherwise.
- `/api/admin/cron/review-digest` sends weekly review-date digests when an email provider is configured; without one it logs recipients/subjects as structured JSON and reports skipped deliveries.
- `/api/admin/cron/audit-cleanup` also folds page-view rows older than 90 days into monthly totals.

## Post-Deploy Checks

- Public KB list renders without loading draft-only content.
- Article pages render blocks, related assets, table of contents, and PDF controls where configured.
- Asset delivery works for a known image/document asset.
- Test owner KB export on a media-heavy KB before relying on it operationally; the current ZIP export is buffered in memory and should become streamed or Blob-backed before very large exports are routine.
- Admin users can sign in, edit a draft page, and see audit-log entries.
- `/admin/usage` loads aggregate view counts when `DATABASE_URL` is configured.
- Logs are structured JSON and suitable for forwarding through Vercel log drains.

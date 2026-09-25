# Agent read/write access to a KB (KaaS)

How an AI agent — this Claude Code session, another one, or an external tool like an OBIEE/OAC
assistant — reads and writes a KB's pages as JSON over HTTPS, instead of scraping the rendered
site or authenticating through the browser sign-in gate on a private KB.

This is the machine API described in `README.md` ("Agent / machine API (KaaS)"). This doc covers
the setup and a ready-made CLI wrapper; `README.md` has the raw endpoint list.

## How it's scoped

`KAAS_API_KEYS` (Vercel env var, comma-separated) holds one entry per key:

- `kb-slug:secret` — **scoped**: only that KB, published pages, public or private.
- `secret` (no colon) — **global/legacy**: any published **public** KB only. Never use this for a
  private KB.

Each KB that needs agent access gets its own scoped entry — a leaked key only exposes one KB.

## One-time setup for a KB

1. Generate a random secret (e.g. `openssl rand -hex 24`). Don't hand-write one.
2. In Vercel → Settings → Environment Variables → `KAAS_API_KEYS`, add `<kb-slug>:<secret>`
   (comma-separated if other entries already exist). Redeploy — env var edits need a fresh deploy
   to take effect.
3. Locally, add the secret **half only** (no `kb-slug:` prefix) to `.env.local` under
   `<KB_SLUG>_KAAS_KEY` (dashes become underscores, upper-cased). For `wsu-reporting` that's:

   ```
   WSU_REPORTING_KAAS_KEY=<secret>
   ```

   `.env.local` is gitignored — this never gets committed. Do not put the raw secret in any
   committed file, and be deliberate about ever pasting it into a chat/agent transcript — treat it
   as compromised and rotate it if that happens.

## Using it — `scripts/kaas-client.mjs`

```bash
node scripts/kaas-client.mjs list wsu-reporting
node scripts/kaas-client.mjs get wsu-reporting agent-start
echo '{"summary":"Updated summary."}' | node scripts/kaas-client.mjs patch wsu-reporting agent-start
node scripts/kaas-client.mjs patch wsu-reporting agent-start --file body.json
node scripts/kaas-client.mjs delete wsu-reporting visualizations/some-duplicate-page
```

It reads the matching `<KB_SLUG>_KAAS_KEY` from `.env.local`, calls
`https://wsu-gradschool-kb.vercel.app/api/v1/kb/<kbSlug>/pages/...`, and prints the JSON response.
Override the host with `KAAS_BASE_URL` if ever needed (e.g. a preview deployment).

`delete` is permanent and immediate — no archive step first, unlike the admin UI. It's rejected
with 409 if the page has children, is referenced by another page's Related Pages, or has an
included excerpt; clear those first. There's no undo, so double-check the path before running it.

`patch` only works on already-published pages and still runs through the publish gate
(`validatePageForPublish`) — a patch that would leave the page failing readiness checks (missing
summary, broken alt text, etc.) is rejected with the issue list, not silently applied.

## Currently provisioned KBs

| KB slug | Purpose | Client env var |
|---|---|---|
| `wsu-reporting` | OBIEE/OAC reporting knowledge source for an AI agent | `WSU_REPORTING_KAAS_KEY` |

Add a row here whenever a new KB gets a scoped key, so a future agent session knows it exists
without re-deriving the setup.

## Rotating a key

Generate a new secret, replace the `kb-slug:` entry in Vercel's `KAAS_API_KEYS`, redeploy, then
update the local `<KB_SLUG>_KAAS_KEY`. The old secret stops working the moment the new deployment
is live — there's no separate revoke step.

## Related docs

| Doc | Use when |
|---|---|
| `README.md` | Raw endpoint list, roles, running the app |
| `AGENTS.md` | Repo orientation and task routing |

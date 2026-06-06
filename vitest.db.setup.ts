// Loads .env.local (then .env) into process.env before the live-DB integration
// tests run, so DATABASE_URL is available just as it is for `next dev`.
//
// We parse the file directly rather than using @next/env: Next deliberately
// SKIPS .env.local when NODE_ENV=test (which vitest sets), which would leave
// DATABASE_URL unset and make every KI-1 test silently skip.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Don't clobber a real value already in the environment with a blank one.
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

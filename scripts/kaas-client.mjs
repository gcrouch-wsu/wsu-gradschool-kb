#!/usr/bin/env node
/**
 * Minimal CLI for the KB's agent/machine API (KaaS). Lets an agent session (this one or another)
 * read/write a KB's pages as JSON over HTTPS, bypassing the browser sign-in gate on private KBs.
 *
 * Auth: a per-KB secret, read from `<KB_SLUG>_KAAS_KEY` in .env.local (e.g. wsu-reporting ->
 * WSU_REPORTING_KAAS_KEY). That secret is the part *after* the colon in the matching
 * `KAAS_API_KEYS` entry set in Vercel (`wsu-reporting:<secret>`) — never the whole entry.
 *
 * See docs/kaas-agent-access.md for setup and README.md for the underlying endpoints.
 *
 * Usage:
 *   node scripts/kaas-client.mjs list <kbSlug>
 *   node scripts/kaas-client.mjs get <kbSlug> <path...>
 *   node scripts/kaas-client.mjs patch <kbSlug> <path...> --file <json-file>
 *   node scripts/kaas-client.mjs patch <kbSlug> <path...>          # reads JSON body from stdin
 *
 * Examples:
 *   node scripts/kaas-client.mjs list wsu-reporting
 *   node scripts/kaas-client.mjs get wsu-reporting agent-start
 *   echo '{"summary":"..."}' | node scripts/kaas-client.mjs patch wsu-reporting agent-start
 *
 * Env overrides:
 *   KAAS_BASE_URL   defaults to https://wsu-gradschool-kb.vercel.app
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index < 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const BASE_URL = process.env.KAAS_BASE_URL ?? "https://wsu-gradschool-kb.vercel.app";

function keyEnvVarFor(kbSlug) {
  return `${kbSlug.replace(/-/g, "_").toUpperCase()}_KAAS_KEY`;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

async function main() {
  const [command, kbSlug, ...rest] = process.argv.slice(2);
  if (!command || !kbSlug) {
    console.error(
      "Usage: node scripts/kaas-client.mjs <list|get|patch> <kbSlug> [path...] [--file <json>]",
    );
    process.exitCode = 1;
    return;
  }

  const envVar = keyEnvVarFor(kbSlug);
  const key = process.env[envVar];
  if (!key) {
    console.error(
      `Missing ${envVar} in .env.local. Add the secret half of the matching "kb-slug:secret" ` +
        `entry from Vercel's KAAS_API_KEYS — see docs/kaas-agent-access.md.`,
    );
    process.exitCode = 1;
    return;
  }

  const fileFlagIndex = rest.indexOf("--file");
  let filePath = null;
  let pathSegments = rest;
  if (fileFlagIndex !== -1) {
    filePath = rest[fileFlagIndex + 1];
    pathSegments = rest.slice(0, fileFlagIndex);
  }

  const url = new URL(
    `/api/v1/kb/${encodeURIComponent(kbSlug)}/pages${
      pathSegments.length > 0 ? `/${pathSegments.map(encodeURIComponent).join("/")}` : ""
    }`,
    BASE_URL,
  );

  const headers = { Authorization: `Bearer ${key}` };
  let response;

  if (command === "list" || command === "get") {
    response = await fetch(url, { headers });
  } else if (command === "patch") {
    const bodyText = filePath ? fs.readFileSync(filePath, "utf8") : await readStdin();
    response = await fetch(url, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: bodyText,
    });
  } else {
    console.error(`Unknown command "${command}". Use list, get, or patch.`);
    process.exitCode = 1;
    return;
  }

  const text = await response.text();
  if (!response.ok) {
    console.error(`HTTP ${response.status}`);
    console.error(text);
    process.exitCode = 1;
    return;
  }
  console.log(text);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

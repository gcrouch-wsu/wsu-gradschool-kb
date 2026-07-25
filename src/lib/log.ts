type LogFields = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export function logError(error: unknown, fields: LogFields = {}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  const normalized = normalizeError(error);
  const stack = "stack" in normalized ? normalized.stack : undefined;
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    severity: "error",
    route: typeof fields.route === "string" ? fields.route : undefined,
    message: normalized.message,
    stack,
    error: normalized,
    ...fields,
  }));
  void reportToSentry(error, fields, normalized);
}

/** Optional Sentry store via DSN. No-op when SENTRY_DSN is unset. */
async function reportToSentry(
  error: unknown,
  fields: LogFields,
  normalized: { name?: string; message: string; stack?: string },
) {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    const parsed = new URL(dsn);
    // DSN form: https://<key>@<host>/<projectId>
    const key = parsed.username;
    const projectId = parsed.pathname.replace(/^\//, "");
    if (!key || !projectId) return;
    const storeUrl = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
    const event = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      server_name: process.env.VERCEL_URL || "wsu-gradschool-kb",
      release: process.env.VERCEL_GIT_COMMIT_SHA || undefined,
      exception: {
        values: [
          {
            type: normalized.name || "Error",
            value: normalized.message,
            stacktrace: normalized.stack
              ? { frames: normalized.stack.split("\n").slice(0, 40).map((line) => ({ filename: line.trim() })) }
              : undefined,
          },
        ],
      },
      tags: {
        route: typeof fields.route === "string" ? fields.route : undefined,
        action: typeof fields.action === "string" ? fields.action : undefined,
      },
      extra: fields,
    };
    await fetch(storeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=wsu-gradschool-kb/1.0, sentry_key=${key}`,
      },
      body: JSON.stringify(event),
    });
  } catch {
    // Never let reporting break the request path.
  }
}

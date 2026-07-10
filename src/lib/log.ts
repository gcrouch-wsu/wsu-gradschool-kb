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
}

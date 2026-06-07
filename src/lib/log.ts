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
  console.error(JSON.stringify({
    level: "error",
    time: new Date().toISOString(),
    error: normalizeError(error),
    ...fields,
  }));
}

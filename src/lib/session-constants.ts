// Runtime-neutral session constants. Kept free of Node-only imports so they can
// be used from edge middleware (src/proxy.ts) as well as Node route handlers.

export const ADMIN_COOKIE_NAME = "kb_admin_session";

// Idle timeout window in seconds. See src/lib/auth.ts for how it is applied.
export const IDLE_TTL_SECONDS = 60 * 60;

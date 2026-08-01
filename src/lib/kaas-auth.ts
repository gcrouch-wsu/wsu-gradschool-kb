import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";

/**
 * Public KaaS API key check. Configure comma-separated secrets in KAAS_API_KEYS.
 * When unset, the API rejects all callers (feature off).
 */
export function isValidKaasApiKey(authorizationHeader: string | null): boolean {
  const configured = (process.env.KAAS_API_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length === 0) {
    return false;
  }
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return false;
  }
  const presented = authorizationHeader.slice(7).trim();
  if (!presented) {
    return false;
  }
  const presentedDigest = createHash("sha256").update(presented).digest();
  return configured.some((secret) => {
    const secretDigest = createHash("sha256").update(secret).digest();
    return (
      presentedDigest.length === secretDigest.length && timingSafeEqual(presentedDigest, secretDigest)
    );
  });
}

const FAILED_AUTH_LIMIT = 10;
const FAILED_AUTH_WINDOW_SECONDS = 60;

/**
 * Auth guard for the KaaS routes. Returns a response to send when the caller is rejected, or
 * null to proceed.
 *
 * The per-route rate limit only runs after a successful check, so on its own it lets a caller
 * guess keys as fast as it likes. Failures are therefore throttled per client here: the first
 * few get 401, and beyond the budget the client is held off with 429.
 */
export async function requireKaasAuth(request: Request): Promise<NextResponse | null> {
  if (isValidKaasApiKey(request.headers.get("authorization"))) {
    return null;
  }
  const client = clientKeyFromHeaders(request.headers);
  const budget = await rateLimit(
    `kaas-auth-fail:${client}`,
    FAILED_AUTH_LIMIT,
    FAILED_AUTH_WINDOW_SECONDS,
  );
  if (!budget.allowed) {
    return NextResponse.json(
      { message: "Too many failed authentication attempts." },
      { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } },
    );
  }
  return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
}

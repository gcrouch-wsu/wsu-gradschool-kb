import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";
import type { KnowledgeBase } from "@/lib/types";

/**
 * KaaS credentials from KAAS_API_KEYS (comma-separated).
 *
 * - `secret` — global key: published **public** KBs only (legacy).
 * - `kb-slug:secret` — scoped key: only that KB, including published **private** KBs.
 *
 * Example: `KAAS_API_KEYS=wsu-reporting:orange-tiger-42`
 */
export type KaasAuth = {
  /** null = any published public KB; otherwise only these slugs. */
  kbSlugs: string[] | null;
};

type KaasCredential = {
  secret: string;
  kbSlugs: string[] | null;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseKaasCredentials(raw: string | undefined = process.env.KAAS_API_KEYS): KaasCredential[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((entry) => {
      const colon = entry.indexOf(":");
      if (colon > 0) {
        const slug = entry.slice(0, colon).trim();
        const secret = entry.slice(colon + 1).trim();
        if (secret && SLUG_PATTERN.test(slug)) {
          return { secret, kbSlugs: [slug] };
        }
      }
      return { secret: entry, kbSlugs: null };
    });
}

function digestEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return left.length === right.length && timingSafeEqual(left, right);
}

export function resolveKaasAuth(authorizationHeader: string | null): KaasAuth | null {
  const credentials = parseKaasCredentials();
  if (credentials.length === 0) {
    return null;
  }
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const presented = authorizationHeader.slice(7).trim();
  if (!presented) {
    return null;
  }
  const match = credentials.find((credential) => digestEqual(presented, credential.secret));
  return match ? { kbSlugs: match.kbSlugs } : null;
}

/** @deprecated Prefer resolveKaasAuth — kept for older call sites/tests. */
export function isValidKaasApiKey(authorizationHeader: string | null): boolean {
  return resolveKaasAuth(authorizationHeader) !== null;
}

/**
 * Whether this credential may read/write the KB.
 * Scoped keys: only listed slugs (public or private), published only.
 * Global keys: published public KBs only.
 */
export function kaasCanAccessKb(
  auth: KaasAuth,
  kb: Pick<KnowledgeBase, "slug" | "visibility" | "status">,
): boolean {
  if (kb.status !== "published") {
    return false;
  }
  if (auth.kbSlugs !== null) {
    return auth.kbSlugs.includes(kb.slug);
  }
  return kb.visibility === "public";
}

const FAILED_AUTH_LIMIT = 10;
const FAILED_AUTH_WINDOW_SECONDS = 60;

export type KaasAuthResult = { ok: true; auth: KaasAuth } | { ok: false; response: NextResponse };

/**
 * Auth guard for KaaS routes. Failures are throttled per client so key guessing is rate-limited.
 */
export async function authenticateKaasRequest(request: Request): Promise<KaasAuthResult> {
  const auth = resolveKaasAuth(request.headers.get("authorization"));
  if (auth) {
    return { ok: true, auth };
  }
  const client = clientKeyFromHeaders(request.headers);
  const budget = await rateLimit(
    `kaas-auth-fail:${client}`,
    FAILED_AUTH_LIMIT,
    FAILED_AUTH_WINDOW_SECONDS,
  );
  if (!budget.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Too many failed authentication attempts." },
        { status: 429, headers: { "Retry-After": String(budget.retryAfterSeconds) } },
      ),
    };
  }
  return { ok: false, response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
}

/** @deprecated Prefer authenticateKaasRequest when you need the auth context. */
export async function requireKaasAuth(request: Request): Promise<NextResponse | null> {
  const result = await authenticateKaasRequest(request);
  return result.ok ? null : result.response;
}

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/auth";

function expectedHost(request: Request): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

function hostOf(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/**
 * Same-origin check for state-changing admin requests. Combined with the
 * SameSite=Lax session cookie this is our anti-CSRF strategy for the MVP
 * (project_spec.md §4): a cross-site page cannot forge a request that carries a
 * matching Origin/Referer for our host. Requests must present an Origin (or, as a
 * fallback for same-origin form posts, a Referer) whose host matches ours.
 */
export function isSameOrigin(request: Request): boolean {
  const host = expectedHost(request);
  if (!host) {
    return false;
  }
  const originHost = hostOf(request.headers.get("origin"));
  if (originHost) {
    return originHost === host;
  }
  const refererHost = hostOf(request.headers.get("referer"));
  if (refererHost) {
    return refererHost === host;
  }
  return false;
}

type AdminGuardResult =
  | { ok: true; email: string }
  | { ok: false; response: NextResponse };

/**
 * Guard for admin mutation routes: requires a valid session AND a same-origin
 * request. Returns the signed-in email or a ready-to-return error response.
 */
export async function requireAdminMutation(request: Request): Promise<AdminGuardResult> {
  const session = await getCurrentAdminSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ message: "Unauthorized." }, { status: 401 }) };
  }
  if (!isSameOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Request blocked: cross-origin request rejected." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, email: session.email };
}

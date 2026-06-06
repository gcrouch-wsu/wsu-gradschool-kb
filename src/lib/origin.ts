// Pure, framework-free origin checks. Kept free of Next imports so the CSRF logic
// can be unit-tested in isolation. Consumed by src/lib/security.ts.

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

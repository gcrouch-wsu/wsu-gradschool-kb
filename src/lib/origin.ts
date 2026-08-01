// Same-origin check behind `requireAdminMutation`. `x-forwarded-host` is set by the platform
// proxy but is client-controlled on a misconfigured or bypassed one, so when APP_PUBLIC_HOST is
// configured it becomes the authority: a forwarded host outside the allowlist is ignored, and
// the Origin/Referer must land inside it too. With nothing configured (local dev, preview
// deployments) the check falls back to comparing against the request's own host headers.
function allowedHosts(): string[] {
  const explicit = process.env.APP_PUBLIC_HOST ?? "";
  const hosts = explicit
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (hosts.length > 0) {
    return hosts;
  }
  // Vercel populates this from project configuration, not from the incoming request.
  const canonical = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim().toLowerCase();
  return canonical ? [canonical] : [];
}

function expectedHost(request: Request): string | null {
  const allowed = allowedHosts();
  const forwarded = request.headers.get("x-forwarded-host")?.trim().toLowerCase() ?? null;
  const direct = request.headers.get("host")?.trim().toLowerCase() ?? null;

  if (allowed.length === 0) {
    return forwarded ?? direct;
  }
  for (const candidate of [forwarded, direct]) {
    if (candidate && allowed.includes(candidate)) {
      return candidate;
    }
  }
  return null;
}

function hostOf(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

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

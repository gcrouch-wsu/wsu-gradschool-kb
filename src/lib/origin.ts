// Same-origin check behind `requireAdminMutation` and the auth routes. `x-forwarded-host` is
// set by the platform proxy but is client-controlled on a misconfigured or bypassed one, so
// when APP_PUBLIC_HOST is configured it becomes the authority: a forwarded host outside the
// allowlist is ignored, and the Origin/Referer must land inside it too.
//
// Leaving APP_PUBLIC_HOST unset is fully supported and is the right choice anywhere the host
// varies per deployment (preview URLs, local dev). The check then compares Origin/Referer
// against the request's own host headers, which is the behaviour this has always had. Only
// set it where you know every hostname the app is served on — omitting one 403s it.
// Configured hosts only. There is deliberately no automatic fallback: a deployment's
// legitimate host set includes custom domains, which cannot be enumerated from the
// environment, so any inferred allowlist is incomplete and locks out the hosts it missed.
// `VERCEL_PROJECT_PRODUCTION_URL` was tried here and was actively wrong — Vercel sets it on
// preview deployments too, where it names production rather than the host actually being
// served, so every preview 403'd its own sign-in.
function allowedHosts(): string[] {
  return (process.env.APP_PUBLIC_HOST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
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

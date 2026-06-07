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

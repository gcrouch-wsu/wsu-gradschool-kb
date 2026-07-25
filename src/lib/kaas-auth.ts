import { createHash, timingSafeEqual } from "node:crypto";

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

/** Shared AI prompt resolution: KB override → site default → built-in. */

export function normalizeAiPrompt(value: unknown, max = 8_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function resolveAiPrompt(
  kbPrompt: string | null | undefined,
  sitePrompt: string | null | undefined,
  builtInDefault: string,
): string {
  const fromKb = (kbPrompt ?? "").trim();
  if (fromKb) return fromKb;
  const fromSite = (sitePrompt ?? "").trim();
  if (fromSite) return fromSite;
  return builtInDefault;
}

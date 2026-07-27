export interface AiProviderInfo {
  model: string;
  configured: boolean;
  hasEndpoint: boolean;
  hasKey: boolean;
}

/** Deployment AI Gateway env (no secrets returned). */
export function getAiProviderInfo(): AiProviderInfo {
  const model = (process.env.AI_MODEL || "").trim();
  const endpoint = (process.env.AI_PROVIDER_ENDPOINT || "").trim();
  const hasKey = Boolean((process.env.AI_API_KEY || "").trim());
  return {
    model,
    configured: Boolean(model && endpoint && hasKey),
    hasEndpoint: Boolean(endpoint),
    hasKey,
  };
}

export function formatAiModelLabel(provider: AiProviderInfo | null | undefined): string {
  if (!provider) {
    return "Loading…";
  }
  if (provider.model) {
    return provider.configured ? provider.model : `${provider.model} (incomplete config)`;
  }
  if (!provider.hasKey || !provider.hasEndpoint) {
    return "Not configured (set AI_PROVIDER_ENDPOINT, AI_API_KEY, and AI_MODEL)";
  }
  return "Not configured";
}

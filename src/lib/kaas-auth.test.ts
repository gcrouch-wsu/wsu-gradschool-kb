import { describe, expect, it, vi, afterEach } from "vitest";
import { isValidKaasApiKey } from "@/lib/kaas-auth";

describe("isValidKaasApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects when no keys are configured", () => {
    vi.stubEnv("KAAS_API_KEYS", "");
    expect(isValidKaasApiKey("Bearer secret")).toBe(false);
  });

  it("accepts a matching bearer key", () => {
    vi.stubEnv("KAAS_API_KEYS", "alpha,beta");
    expect(isValidKaasApiKey("Bearer beta")).toBe(true);
    expect(isValidKaasApiKey("Bearer nope")).toBe(false);
    expect(isValidKaasApiKey(null)).toBe(false);
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { isValidKaasApiKey, requireKaasAuth } from "@/lib/kaas-auth";

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

describe("requireKaasAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function request(authorization: string | null, client: string) {
    const headers = new Headers({ "x-forwarded-for": client });
    if (authorization) {
      headers.set("authorization", authorization);
    }
    return new Request("https://kb.example.edu/api/v1/kb/x/pages/y", { headers });
  }

  it("lets a valid key through", async () => {
    vi.stubEnv("KAAS_API_KEYS", "alpha");
    vi.stubEnv("DATABASE_URL", "");
    expect(await requireKaasAuth(request("Bearer alpha", "203.0.113.10"))).toBeNull();
  });

  it("throttles a client that keeps guessing keys", async () => {
    vi.stubEnv("KAAS_API_KEYS", "alpha");
    vi.stubEnv("DATABASE_URL", "");
    const client = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await requireKaasAuth(request("Bearer wrong", client));
      statuses.push(response!.status);
    }

    // The budget allows a handful of 401s, then holds the client off with 429.
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("keeps separate budgets per client", async () => {
    vi.stubEnv("KAAS_API_KEYS", "alpha");
    vi.stubEnv("DATABASE_URL", "");
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await requireKaasAuth(request("Bearer wrong", "198.51.100.7"));
    }
    const other = await requireKaasAuth(request("Bearer wrong", "198.51.100.8"));
    expect(other!.status).toBe(401);
  });
});

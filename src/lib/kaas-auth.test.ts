import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isValidKaasApiKey,
  kaasCanAccessKb,
  parseKaasCredentials,
  requireKaasAuth,
  resolveKaasAuth,
} from "@/lib/kaas-auth";

describe("parseKaasCredentials / resolveKaasAuth", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects when no keys are configured", () => {
    vi.stubEnv("KAAS_API_KEYS", "");
    expect(isValidKaasApiKey("Bearer secret")).toBe(false);
    expect(resolveKaasAuth("Bearer secret")).toBeNull();
  });

  it("treats bare secrets as global public-only credentials", () => {
    vi.stubEnv("KAAS_API_KEYS", "alpha,beta");
    expect(parseKaasCredentials()).toEqual([
      { secret: "alpha", kbSlugs: null },
      { secret: "beta", kbSlugs: null },
    ]);
    expect(resolveKaasAuth("Bearer beta")).toEqual({ kbSlugs: null });
    expect(resolveKaasAuth("Bearer nope")).toBeNull();
    expect(resolveKaasAuth(null)).toBeNull();
  });

  it("parses kb-slug:secret as a scoped credential", () => {
    vi.stubEnv("KAAS_API_KEYS", "wsu-reporting:orange-tiger-42,global-key");
    expect(parseKaasCredentials()).toEqual([
      { secret: "orange-tiger-42", kbSlugs: ["wsu-reporting"] },
      { secret: "global-key", kbSlugs: null },
    ]);
    expect(resolveKaasAuth("Bearer orange-tiger-42")).toEqual({ kbSlugs: ["wsu-reporting"] });
    expect(resolveKaasAuth("Bearer global-key")).toEqual({ kbSlugs: null });
  });
});

describe("kaasCanAccessKb", () => {
  it("lets global keys read published public KBs only", () => {
    const auth = { kbSlugs: null };
    expect(kaasCanAccessKb(auth, { slug: "graduate-school", visibility: "public", status: "published" })).toBe(
      true,
    );
    expect(
      kaasCanAccessKb(auth, { slug: "graduate-school-staff", visibility: "private", status: "published" }),
    ).toBe(false);
    expect(kaasCanAccessKb(auth, { slug: "draft-preview", visibility: "public", status: "draft" })).toBe(false);
  });

  it("lets scoped keys read only their slug, including private published KBs", () => {
    const auth = { kbSlugs: ["wsu-reporting"] };
    expect(kaasCanAccessKb(auth, { slug: "wsu-reporting", visibility: "private", status: "published" })).toBe(
      true,
    );
    expect(kaasCanAccessKb(auth, { slug: "graduate-school", visibility: "public", status: "published" })).toBe(
      false,
    );
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

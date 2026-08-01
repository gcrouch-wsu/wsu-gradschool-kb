import { afterEach, describe, expect, it, vi } from "vitest";
import { isSameOrigin } from "@/lib/origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

function req(headers: Record<string, string>): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
  } as unknown as Request;
}

describe("isSameOrigin", () => {
  it("accepts a matching Origin host", () => {
    expect(isSameOrigin(req({ "x-forwarded-host": "app.wsu.edu", origin: "https://app.wsu.edu" }))).toBe(true);
  });

  it("rejects a foreign Origin host", () => {
    expect(isSameOrigin(req({ "x-forwarded-host": "app.wsu.edu", origin: "https://evil.example.com" }))).toBe(
      false,
    );
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(
      isSameOrigin(req({ "x-forwarded-host": "app.wsu.edu", referer: "https://app.wsu.edu/admin/pages" })),
    ).toBe(true);
  });

  it("rejects a foreign Referer", () => {
    expect(
      isSameOrigin(req({ "x-forwarded-host": "app.wsu.edu", referer: "https://evil.example.com/x" })),
    ).toBe(false);
  });

  it("rejects when neither Origin nor Referer is present", () => {
    expect(isSameOrigin(req({ "x-forwarded-host": "app.wsu.edu" }))).toBe(false);
  });

  it("prefers x-forwarded-host over host", () => {
    expect(
      isSameOrigin(req({ host: "internal:3000", "x-forwarded-host": "app.wsu.edu", origin: "https://app.wsu.edu" })),
    ).toBe(true);
  });

  it("rejects when no host can be determined", () => {
    expect(isSameOrigin(req({ origin: "https://app.wsu.edu" }))).toBe(false);
  });
});

describe("isSameOrigin with APP_PUBLIC_HOST configured", () => {
  it("ignores a forwarded host outside the allowlist and falls back to the real host", () => {
    vi.stubEnv("APP_PUBLIC_HOST", "app.wsu.edu");
    // A spoofed x-forwarded-host must not become the origin the request is compared against.
    expect(
      isSameOrigin(
        req({
          host: "app.wsu.edu",
          "x-forwarded-host": "evil.example.com",
          origin: "https://evil.example.com",
        }),
      ),
    ).toBe(false);
  });

  it("accepts a request whose forwarded host and Origin are both allowlisted", () => {
    vi.stubEnv("APP_PUBLIC_HOST", "app.wsu.edu");
    expect(
      isSameOrigin(req({ "x-forwarded-host": "app.wsu.edu", origin: "https://app.wsu.edu" })),
    ).toBe(true);
  });

  it("rejects when neither host header is allowlisted", () => {
    vi.stubEnv("APP_PUBLIC_HOST", "app.wsu.edu");
    expect(
      isSameOrigin(req({ host: "other.example.com", origin: "https://other.example.com" })),
    ).toBe(false);
  });

  it("supports several comma-separated hosts", () => {
    vi.stubEnv("APP_PUBLIC_HOST", "app.wsu.edu, kb.wsu.edu");
    expect(isSameOrigin(req({ host: "kb.wsu.edu", origin: "https://kb.wsu.edu" }))).toBe(true);
  });

});

describe("isSameOrigin without APP_PUBLIC_HOST", () => {
  // Regression: an earlier version inferred an allowlist from VERCEL_PROJECT_PRODUCTION_URL.
  // Vercel sets that on preview deployments too, where it names production rather than the
  // host being served — so every preview deployment rejected its own sign-in with a 403.
  it("does not infer an allowlist from VERCEL_PROJECT_PRODUCTION_URL", () => {
    vi.stubEnv("APP_PUBLIC_HOST", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "wsu-gradschool-kb.vercel.app");

    // A preview deployment: served on its own host, same-origin request from that host.
    expect(
      isSameOrigin(
        req({
          "x-forwarded-host": "wsu-gradschool-kb-git-development-team.vercel.app",
          origin: "https://wsu-gradschool-kb-git-development-team.vercel.app",
        }),
      ),
    ).toBe(true);
  });

  it("still rejects a genuinely cross-origin request", () => {
    vi.stubEnv("APP_PUBLIC_HOST", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "wsu-gradschool-kb.vercel.app");
    expect(
      isSameOrigin(
        req({
          "x-forwarded-host": "wsu-gradschool-kb-git-development-team.vercel.app",
          origin: "https://evil.example.com",
        }),
      ),
    ).toBe(false);
  });
});

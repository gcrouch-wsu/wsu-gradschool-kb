import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/origin";

// Build a minimal Request-like object. We avoid constructing a real Request so the
// runtime's forbidden-header guard does not strip Host/Referer during the test.
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

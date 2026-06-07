import { describe, expect, it } from "vitest";
import { clientKeyFromHeaders, rateLimit } from "@/lib/rate-limit";

function uniqueKey(label: string) {
  return `test:${label}:${Math.random().toString(36).slice(2)}`;
}

describe("rateLimit", () => {
  it("allows requests up to the limit, then blocks", async () => {
    const key = uniqueKey("burst");
    expect((await rateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60)).allowed).toBe(true);
    const blocked = await rateLimit(key, 2, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports remaining budget", async () => {
    const key = uniqueKey("remaining");
    expect((await rateLimit(key, 3, 60)).remaining).toBe(2);
    expect((await rateLimit(key, 3, 60)).remaining).toBe(1);
  });

  it("isolates separate keys", async () => {
    const a = uniqueKey("a");
    const b = uniqueKey("b");
    await rateLimit(a, 1, 60);
    expect((await rateLimit(a, 1, 60)).allowed).toBe(false);
    expect((await rateLimit(b, 1, 60)).allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the first x-forwarded-for hop", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientKeyFromHeaders(headers)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(clientKeyFromHeaders(headers)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no client headers are present", () => {
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});

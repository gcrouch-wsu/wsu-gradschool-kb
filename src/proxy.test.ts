import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function cspFor(url: string): string {
  const response = proxy(new NextRequest(url));
  return response.headers.get("content-security-policy") ?? "";
}

describe("proxy CSP", () => {
  it("allows YouTube and Vimeo iframe embeds via frame-src", () => {
    const csp = cspFor("https://kb.example.edu/kb/test");
    const frameSrc = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src"));
    expect(frameSrc).toBeDefined();
    expect(frameSrc).toContain("https://www.youtube.com");
    expect(frameSrc).toContain("https://www.youtube-nocookie.com");
    expect(frameSrc).toContain("https://player.vimeo.com");
  });

  it("does not widen script-src to the video hosts", () => {
    const csp = cspFor("https://kb.example.edu/kb/test");
    const scriptSrc = csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("youtube");
    expect(scriptSrc).not.toContain("vimeo");
  });

  it("keeps the baseline lockdown directives", () => {
    const csp = cspFor("https://kb.example.edu/kb/test");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

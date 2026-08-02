import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/components/AdminSignInForm";

describe("safeNextPath", () => {
  it("returns to the public page you signed in from", () => {
    expect(safeNextPath("/kb/grad-school-kb/faculty-committees/faculty-of-the-graduate-school")).toBe(
      "/kb/grad-school-kb/faculty-committees/faculty-of-the-graduate-school",
    );
  });

  it("still honours admin destinations", () => {
    expect(safeNextPath("/admin/pages/page-1")).toBe("/admin/pages/page-1");
    expect(safeNextPath("/admin")).toBe("/admin");
  });

  it("falls back to /admin when nothing is requested", () => {
    expect(safeNextPath(null)).toBe("/admin");
    expect(safeNextPath("")).toBe("/admin");
    expect(safeNextPath("   ")).toBe("/admin");
  });

  // Widening this from "/admin* only" to "any same-origin path" keeps the open-redirect guard:
  // a signed-in admin must not be bounced to another origin by a crafted link.
  it("rejects absolute URLs to another origin", () => {
    expect(safeNextPath("https://evil.test/steal")).toBe("/admin");
    expect(safeNextPath("http://evil.test")).toBe("/admin");
    expect(safeNextPath("javascript:alert(1)")).toBe("/admin");
  });

  it("rejects protocol-relative URLs, which browsers resolve off-origin", () => {
    expect(safeNextPath("//evil.test/steal")).toBe("/admin");
    expect(safeNextPath("/\\evil.test/steal")).toBe("/admin");
  });

  it("rejects a scheme smuggled into the first segment", () => {
    expect(safeNextPath("/javascript:alert(1)")).toBe("/admin");
  });
});

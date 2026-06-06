import { describe, expect, it } from "vitest";
import { assertPageSlugAllowed, isReservedPageSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Managing Admission in myWSU")).toBe("managing-admission-in-mywsu");
  });

  it("strips leading/trailing separators and collapses runs", () => {
    expect(slugify("  --Hello,  World!!--  ")).toBe("hello-world");
  });

  it("falls back to 'page' when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("page");
    expect(slugify("")).toBe("page");
  });

  it("caps length at 80 characters", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });
});

describe("reserved page slugs", () => {
  it("flags slugs that collide with application routes", () => {
    for (const reserved of ["files", "search", "admin", "api", "new", "edit", "preview"]) {
      expect(isReservedPageSlug(reserved)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedPageSlug("FILES")).toBe(true);
  });

  it("allows normal content slugs", () => {
    expect(isReservedPageSlug("admissions")).toBe(false);
    expect(isReservedPageSlug("graduate-handbook")).toBe(false);
  });

  it("assertPageSlugAllowed throws on reserved and passes otherwise", () => {
    expect(() => assertPageSlugAllowed("files")).toThrow(/reserved/i);
    expect(() => assertPageSlugAllowed("admissions")).not.toThrow();
  });
});

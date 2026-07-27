import { describe, expect, it } from "vitest";
import { expandSearchQueryTerms } from "@/lib/search-synonyms";
import { editDistance, suggestDidYouMean } from "@/lib/search-suggest";

describe("expandSearchQueryTerms", () => {
  it("offers synonyms for known terms without widening the original query", () => {
    const { original, synonyms } = expandSearchQueryTerms("handbook");
    expect(original).toBe("handbook");
    expect(synonyms).toContain("manual");
    expect(synonyms).toContain("guide");
    expect(synonyms).not.toContain("handbook");
  });

  it("leaves unknown queries unchanged", () => {
    expect(expandSearchQueryTerms("quaternion")).toEqual({ original: "quaternion", synonyms: [] });
  });

  it("honors custom groups from site settings", () => {
    const { synonyms } = expandSearchQueryTerms("prelim", [["prelim", "preliminary exam"]]);
    expect(synonyms).toContain("preliminary exam");
  });

  // Regression: synonyms used to be appended to the query string, which made
  // them additional *required* terms once the tsquery AND-joined the tokens —
  // searching "handbook" then matched only pages also saying "manual" and "guide".
  it("keeps synonyms out of the AND-ed token chain", () => {
    const { original, synonyms } = expandSearchQueryTerms("handbook");
    const andChain = original
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/gi, ""))
      .filter(Boolean);
    expect(andChain).toEqual(["handbook"]);
    expect(synonyms.length).toBeGreaterThan(0);
  });
});

describe("suggestDidYouMean", () => {
  it("suggests a close title", () => {
    expect(editDistance("handbok", "handbook")).toBeLessThanOrEqual(2);
    expect(suggestDidYouMean("handbok", ["Program Handbook", "Visa Steps"])).toBe("Program Handbook");
  });

  it("returns null when nothing is close", () => {
    expect(suggestDidYouMean("zzzzzz", ["Handbook", "Visa"])).toBeNull();
  });
});

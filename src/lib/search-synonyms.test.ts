import { describe, expect, it } from "vitest";
import { expandSearchQueryWithSynonyms } from "@/lib/search-synonyms";
import { editDistance, suggestDidYouMean } from "@/lib/search-suggest";

describe("expandSearchQueryWithSynonyms", () => {
  it("adds synonym tokens for known terms", () => {
    const expanded = expandSearchQueryWithSynonyms("handbook");
    expect(expanded.toLowerCase()).toContain("handbook");
    expect(expanded.toLowerCase()).toContain("manual");
  });

  it("leaves unknown queries unchanged", () => {
    expect(expandSearchQueryWithSynonyms("quaternion")).toBe("quaternion");
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

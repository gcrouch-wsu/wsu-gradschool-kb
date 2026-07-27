import { describe, expect, it } from "vitest";
import { rankFuzzyCandidates, scoreFuzzyQuery } from "@/lib/search-fuzzy";

describe("search-fuzzy", () => {
  it("scores close title matches above unrelated pages", () => {
    const score = scoreFuzzyQuery("handbok", {
      id: "1",
      title: "Program Handbook",
      summary: "Overview",
    });
    expect(score).toBeGreaterThan(20);
  });

  it("ranks fuzzy candidates by closeness", () => {
    const ranked = rankFuzzyCandidates("visa steps", [
      { id: "a", title: "Visa Application Steps", summary: "" },
      { id: "b", title: "Parking Permits", summary: "" },
    ]);
    expect(ranked[0]?.candidate.id).toBe("a");
  });
});

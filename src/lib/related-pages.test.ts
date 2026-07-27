import { describe, expect, it } from "vitest";
import {
  RELATED_PAGES_SOFT_MAX,
  canAddRelatedPage,
  filterRelatedPageMatches,
} from "@/lib/related-pages";

const options = [
  { id: "a", title: "Program Handbook", path: "templates/handbook" },
  { id: "b", title: "Visa Steps", path: "procedures/visa" },
  { id: "c", title: "Handbook FAQ", path: "templates/handbook-faq" },
  { id: "d", title: "Deadlines", path: "procedures/deadlines" },
];

describe("filterRelatedPageMatches", () => {
  it("excludes already selected pages", () => {
    const matches = filterRelatedPageMatches(options, ["a", "b"], "hand");
    expect(matches.map((m) => m.id)).toEqual(["c"]);
  });

  it("matches title or path and prefers title prefix", () => {
    const matches = filterRelatedPageMatches(options, [], "hand");
    // "Handbook FAQ" starts with the query; "Program Handbook" only contains it.
    expect(matches.map((m) => m.id)).toEqual(["c", "a"]);
  });

  it("returns a path-sorted browse list when the query is empty", () => {
    const matches = filterRelatedPageMatches(options, ["a"], "");
    expect(matches.map((m) => m.id)).toEqual(["d", "b", "c"]);
  });
});

describe("canAddRelatedPage", () => {
  it("enforces the soft max", () => {
    expect(canAddRelatedPage(RELATED_PAGES_SOFT_MAX - 1)).toBe(true);
    expect(canAddRelatedPage(RELATED_PAGES_SOFT_MAX)).toBe(false);
  });
});

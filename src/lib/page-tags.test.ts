import { describe, expect, it } from "vitest";
import {
  PAGE_TAG_MAX_COUNT,
  PAGE_TAG_MAX_LENGTH,
  normalizeAssetTags,
  normalizePageTags,
} from "@/lib/page-tags";

describe("page tags", () => {
  it("normalizes comma-separated tags and removes case-insensitive duplicates", () => {
    expect(normalizePageTags("visa, deadlines, Visa,  assistantship  ")).toEqual([
      "visa",
      "deadlines",
      "assistantship",
    ]);
  });

  it("caps count and length", () => {
    const long = "x".repeat(PAGE_TAG_MAX_LENGTH + 10);
    const tags = normalizePageTags([long, ...Array.from({ length: PAGE_TAG_MAX_COUNT + 5 }, (_, index) => `tag ${index}`)]);
    expect(tags).toHaveLength(PAGE_TAG_MAX_COUNT);
    expect(tags[0]).toHaveLength(PAGE_TAG_MAX_LENGTH);
  });

  it("normalizes asset tags with the same rules", () => {
    expect(normalizeAssetTags("Forms, admissions, forms")).toEqual(["Forms", "admissions"]);
  });
});

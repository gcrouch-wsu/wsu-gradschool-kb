import { describe, expect, it } from "vitest";
import { parseSearchTagFacets } from "@/lib/search-tags";

describe("parseSearchTagFacets", () => {
  it("parses comma-separated and repeated tag params", () => {
    expect(parseSearchTagFacets(["visa, deadlines", "Visa"])).toEqual(["visa", "deadlines"]);
  });
});

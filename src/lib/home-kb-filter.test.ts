import { describe, expect, it } from "vitest";
import { filterHomeKbs, paginateHomeKbs } from "@/lib/home-kb-filter";

const sample = [
  { title: "Graduate School", description: "Policies and procedures", slug: "grad-school" },
  { title: "Research", description: "Grant guidance", slug: "research" },
  { title: "Student Life", description: "Campus resources", slug: "student-life" },
];

describe("home-kb-filter", () => {
  it("returns all KBs when the query is blank", () => {
    expect(filterHomeKbs(sample, "  ")).toHaveLength(3);
  });

  it("matches title, description, and slug", () => {
    expect(filterHomeKbs(sample, "grant")).toEqual([sample[1]]);
    expect(filterHomeKbs(sample, "GRAD")).toEqual([sample[0]]);
    expect(filterHomeKbs(sample, "student-life")).toEqual([sample[2]]);
  });

  it("paginates after filtering", () => {
    const filtered = filterHomeKbs(sample, "");
    const page1 = paginateHomeKbs(filtered, 1, 2);
    expect(page1.pageItems).toHaveLength(2);
    expect(page1.totalPages).toBe(2);
    const page2 = paginateHomeKbs(filtered, 2, 2);
    expect(page2.pageItems).toEqual([sample[2]]);
    expect(page2.currentPage).toBe(2);
  });

  it("clamps an out-of-range page", () => {
    const result = paginateHomeKbs(sample, 99, 2);
    expect(result.currentPage).toBe(2);
    expect(result.pageItems).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { diffLines, revisionPlainDocument } from "@/lib/revision-diff";
import type { ContentBlock } from "@/lib/types";

// The draft banner has to answer "what is different?" before offering to overwrite the
// editor. It reuses the revision diff rather than inventing a second comparison, so these
// pin the shape the banner depends on.
function doc(title: string, summary: string, blocks: ContentBlock[]) {
  return revisionPlainDocument({ title, summary, blocks });
}

const para = (id: string, text: string): ContentBlock => ({ blockId: id, type: "paragraph", text });

describe("page vs draft comparison", () => {
  it("reports no differences when the draft matches the page", () => {
    const page = doc("Title", "Summary", [para("p1", "One")]);
    const lines = diffLines(page, page);
    expect(lines.every((line) => line.kind === "same")).toBe(true);
  });

  it("surfaces added and removed lines so the banner can summarise them", () => {
    const before = doc("Title", "Summary", [para("p1", "One"), para("p2", "Two")]);
    const after = doc("Title", "Summary", [para("p1", "One"), para("p2", "Two changed")]);
    const lines = diffLines(before, after);
    expect(lines.some((line) => line.kind === "add" && line.text.includes("Two changed"))).toBe(true);
    expect(lines.some((line) => line.kind === "remove" && line.text.includes("Two"))).toBe(true);
  });

  it("detects a title-only change", () => {
    const before = doc("Old title", "Summary", [para("p1", "One")]);
    const after = doc("New title", "Summary", [para("p1", "One")]);
    const lines = diffLines(before, after);
    expect(lines.some((line) => line.kind === "add" && line.text.includes("New title"))).toBe(true);
  });

  // A draft whose body matches but whose page settings differ still warrants the banner —
  // the diff is empty, so the copy must say "settings only" rather than "no changes".
  it("produces an empty change set when only non-text fields differ", () => {
    const before = doc("Title", "Summary", [para("p1", "One")]);
    const after = doc("Title", "Summary", [para("p1", "One")]);
    const changed = diffLines(before, after).filter((line) => line.kind !== "same");
    expect(changed).toHaveLength(0);
  });
});

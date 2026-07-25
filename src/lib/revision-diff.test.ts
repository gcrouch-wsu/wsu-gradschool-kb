import { describe, expect, it } from "vitest";
import { blocksToPlainText, diffLines, revisionPlainDocument } from "@/lib/revision-diff";
import type { ContentBlock } from "@/lib/types";

describe("revision-diff", () => {
  it("flattens paragraphs and headings", () => {
    const blocks: ContentBlock[] = [
      { blockId: "1", type: "heading", level: 2, text: "Intro" },
      { blockId: "2", type: "paragraph", text: "Hello world" },
    ];
    expect(blocksToPlainText(blocks)).toBe("Intro\nHello world");
  });

  it("marks added and removed lines", () => {
    const lines = diffLines("a\nb\nc", "a\nx\nc");
    expect(lines).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "add", text: "x" },
      { kind: "same", text: "c" },
    ]);
  });

  it("builds a plain document from a revision snapshot", () => {
    const doc = revisionPlainDocument({
      title: "Policy",
      summary: "Short summary",
      blocks: [{ blockId: "1", type: "paragraph", text: "Body" }],
    });
    expect(doc).toContain("# Policy");
    expect(doc).toContain("Short summary");
    expect(doc).toContain("Body");
  });
});

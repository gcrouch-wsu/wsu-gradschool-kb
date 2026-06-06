import { describe, expect, it } from "vitest";
import { applyStagedMediaToBlocks } from "@/lib/import-commit";
import type { StagedImportMedia } from "@/lib/types";

describe("applyStagedMediaToBlocks", () => {
  it("drops rejected images and applies alt text from review rows", () => {
    const blocks = [
      { blockId: "img-1", type: "image" as const, url: "https://example.com/a.png", alt: "" },
      { blockId: "img-2", type: "image" as const, url: "https://example.com/b.png", alt: "old" },
      { blockId: "p-1", type: "paragraph" as const, text: "Hello" },
    ];
    const media: StagedImportMedia[] = [
      {
        id: "m1",
        stagedImportId: "s1",
        blockId: "img-1",
        temporaryUrl: "https://example.com/a.png",
        mimeType: "image/png",
        originalFilename: "a.png",
        proposedTitle: "Chart",
        proposedSlug: "chart",
        altText: "Enrollment chart",
        reviewStatus: "approved",
      },
      {
        id: "m2",
        stagedImportId: "s1",
        blockId: "img-2",
        temporaryUrl: "https://example.com/b.png",
        mimeType: "image/png",
        originalFilename: "b.png",
        proposedTitle: "Skip",
        proposedSlug: "skip",
        altText: "",
        reviewStatus: "rejected",
      },
    ];
    const result = applyStagedMediaToBlocks(blocks, media);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "image", alt: "Enrollment chart" });
    expect(result[1]).toMatchObject({ type: "paragraph", text: "Hello" });
  });
});

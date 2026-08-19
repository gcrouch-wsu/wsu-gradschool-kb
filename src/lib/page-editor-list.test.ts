import { describe, expect, it } from "vitest";
import {
  blocksToSections,
  preserveFlowClientKeys,
  stampFlowClientKeys,
  type EditorSection,
} from "@/lib/page-editor-list";
import type { ContentBlock } from "@/lib/types";

describe("flow client keys", () => {
  it("does not rewrite existing flow clientKeys from block ids", () => {
    const sections: EditorSection[] = [
      {
        type: "flow",
        blocks: [{ blockId: "p1", type: "paragraph", text: "Hello", html: "Hello" }],
        clientKey: "flow-stable",
      },
    ];
    const stamped = stampFlowClientKeys(sections);
    expect(stamped[0]).toMatchObject({ type: "flow", clientKey: "flow-stable" });
  });

  it("stamps deterministic keys so SSR and hydration match", () => {
    const blocks: ContentBlock[] = [
      { blockId: "p1", type: "paragraph", text: "Hello", html: "Hello" },
      { blockId: "img-1", type: "image", url: "/kb/x/a.png", alt: "A" },
    ];
    const first = blocksToSections(blocks);
    const second = blocksToSections(blocks);
    expect(first.map((section) => (section.type === "flow" ? section.clientKey : section.block.blockId))).toEqual(
      second.map((section) => (section.type === "flow" ? section.clientKey : section.block.blockId)),
    );
    expect(first.some((section) => section.type === "flow" && section.clientKey?.includes("randomUUID"))).toBe(false);
  });

  it("preserves flow keys across emit cycles when block ids are re-minted", () => {
    const previous = blocksToSections([
      { blockId: "old-1", type: "paragraph", text: "Hello", html: "Hello" },
      { blockId: "img-1", type: "image", url: "/kb/x/a.png", alt: "A" },
    ]).map((section) =>
      section.type === "flow" && section.blocks.some((block) => block.blockId === "old-1")
        ? { ...section, clientKey: "flow-stable" }
        : section,
    );
    const remintedBlocks: ContentBlock[] = [
      { blockId: "new-1", type: "paragraph", text: "Hello", html: "Hello" },
      { blockId: "img-1", type: "image", url: "/kb/x/a.png", alt: "A" },
    ];
    const next = preserveFlowClientKeys(previous, blocksToSections(remintedBlocks));
    const contentFlow = next.find(
      (section) =>
        section.type === "flow" &&
        section.blocks.some((block) => block.type === "paragraph" && block.text === "Hello"),
    );
    expect(contentFlow).toMatchObject({ type: "flow", clientKey: "flow-stable" });
  });
});

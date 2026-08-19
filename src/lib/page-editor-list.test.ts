import { describe, expect, it } from "vitest";
import {
  blocksToSections,
  isEmptyFlowSection,
  moveEditorSection,
  moveTargetIndex,
  normalizeEditorSections,
  preserveFlowClientKeys,
  sectionsToBlocks,
  stampFlowClientKeys,
  type EditorSection,
} from "@/lib/page-editor-list";
import type { ContentBlock } from "@/lib/types";

function paragraph(id: string, text: string): ContentBlock {
  return { blockId: id, type: "paragraph", text, html: text };
}

function image(id: string): Extract<ContentBlock, { type: "image" }> {
  return { blockId: id, type: "image", url: `/kb/x/${id}.png`, alt: id };
}

describe("flow client keys", () => {
  it("does not rewrite existing flow clientKeys from block ids", () => {
    const sections: EditorSection[] = [
      {
        type: "flow",
        blocks: [paragraph("p1", "Hello")],
        clientKey: "flow-stable",
      },
    ];
    const stamped = stampFlowClientKeys(sections);
    expect(stamped[0]).toMatchObject({ type: "flow", clientKey: "flow-stable" });
  });

  it("stamps deterministic keys so SSR and hydration match", () => {
    const blocks: ContentBlock[] = [paragraph("p1", "Hello"), image("img-1")];
    const first = blocksToSections(blocks);
    const second = blocksToSections(blocks);
    expect(first.map((section) => (section.type === "flow" ? section.clientKey : section.block.blockId))).toEqual(
      second.map((section) => (section.type === "flow" ? section.clientKey : section.block.blockId)),
    );
    expect(first.some((section) => section.type === "flow" && section.clientKey?.includes("randomUUID"))).toBe(false);
  });

  it("preserves flow keys across emit cycles when block ids are re-minted", () => {
    const previous = blocksToSections([paragraph("old-1", "Hello"), image("img-1")]).map((section) =>
      section.type === "flow" && section.blocks.some((block) => block.blockId === "old-1")
        ? { ...section, clientKey: "flow-stable" }
        : section,
    );
    const remintedBlocks: ContentBlock[] = [paragraph("new-1", "Hello"), image("img-1")];
    const next = preserveFlowClientKeys(previous, blocksToSections(remintedBlocks));
    const contentFlow = next.find(
      (section) =>
        section.type === "flow" &&
        section.blocks.some((block) => block.type === "paragraph" && block.text === "Hello"),
    );
    expect(contentFlow).toMatchObject({ type: "flow", clientKey: "flow-stable" });
  });
});

describe("separate text flows", () => {
  it("does not merge adjacent non-empty flows", () => {
    const sections = normalizeEditorSections([
      { type: "flow", blocks: [paragraph("a", "Top")], clientKey: "flow-a" },
      { type: "flow", blocks: [paragraph("b", "Bottom")], clientKey: "flow-b" },
    ]);
    const flows = sections.filter((section) => section.type === "flow" && !isEmptyFlowSection(section));
    expect(flows).toHaveLength(2);
    expect(flows[0]).toMatchObject({ clientKey: "flow-a" });
    expect(flows[1]).toMatchObject({ clientKey: "flow-b" });
    expect(sectionsToBlocks(sections).map((block) => block.blockId)).toEqual(["a", "b"]);
  });

  it("keeps an empty text slot before a filled flow (top-level insert)", () => {
    const sections = normalizeEditorSections([
      { type: "flow", blocks: [], clientKey: "gap-top" },
      { type: "flow", blocks: [paragraph("a", "Existing")], clientKey: "flow-a" },
    ]);
    expect(sections[0]).toMatchObject({ type: "flow", blocks: [], clientKey: "gap-top" });
    expect(sections[1]).toMatchObject({ type: "flow", clientKey: "flow-a" });
  });

  it("moves a recreated flow above an earlier flow without collapsing it", () => {
    let sections = normalizeEditorSections([
      { type: "flow", blocks: [paragraph("a", "First")], clientKey: "flow-a" },
      { type: "image", block: image("img-1") },
      { type: "flow", blocks: [paragraph("b", "Recreated")], clientKey: "flow-b" },
    ]);

    const recreatedIndex = sections.findIndex(
      (section) => section.type === "flow" && section.clientKey === "flow-b",
    );
    expect(recreatedIndex).toBeGreaterThan(0);
    expect(moveTargetIndex(sections, recreatedIndex, -1)).toBeGreaterThanOrEqual(0);

    sections = moveEditorSection(sections, recreatedIndex, -1)!;
    const afterPastImage = sections.findIndex(
      (section) => section.type === "flow" && section.clientKey === "flow-b",
    );
    expect(afterPastImage).toBeGreaterThanOrEqual(0);
    expect(sections.some((section) => section.type === "flow" && section.clientKey === "flow-a")).toBe(true);

    sections = moveEditorSection(sections, afterPastImage, -1)!;
    const flows = sections.filter(
      (section): section is Extract<EditorSection, { type: "flow" }> =>
        section.type === "flow" && !isEmptyFlowSection(section),
    );
    expect(flows.map((section) => section.clientKey)).toEqual(["flow-b", "flow-a"]);
    expect(sectionsToBlocks(sections).map((block) => ("text" in block ? block.text : block.blockId))).toEqual([
      "Recreated",
      "First",
      "img-1",
    ]);
  });

  it("moves an image below the following text flow", () => {
    let sections = normalizeEditorSections([
      { type: "image", block: image("img-1") },
      { type: "flow", blocks: [paragraph("p1", "Paragraph after the image.")], clientKey: "flow-a" },
    ]);
    const imageIndex = sections.findIndex((section) => section.type === "image");
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    sections = moveEditorSection(sections, imageIndex, 1)!;

    const meaningful = sections.filter((section) => !(section.type === "flow" && isEmptyFlowSection(section)));
    expect(meaningful.map((section) => section.type)).toEqual(["flow", "image"]);
    expect(sectionsToBlocks(sections).map((block) => ("text" in block ? block.text : block.blockId))).toEqual([
      "Paragraph after the image.",
      "img-1",
    ]);
  });
});

describe("preserveFlowClientKeys", () => {
  it("keeps keys with their sections when two text boxes swap places", () => {
    const previous: EditorSection[] = [
      { type: "flow", blocks: [paragraph("a", "First")], clientKey: "flow-a" },
      { type: "flow", blocks: [paragraph("b", "Second")], clientKey: "flow-b" },
    ];
    const moved = moveEditorSection(previous, 1, -1)!;
    const next = preserveFlowClientKeys(previous, stampFlowClientKeys(moved));
    const flows = next.filter(
      (section): section is Extract<EditorSection, { type: "flow" }> => section.type === "flow",
    );
    expect(flows.map((flow) => flow.clientKey)).toEqual(["flow-b", "flow-a"]);
    expect(flows.map((flow) => (flow.blocks[0] as { text?: string } | undefined)?.text)).toEqual([
      "Second",
      "First",
    ]);
  });

  // A positional pass re-labelled both boxes after a move, so React kept both
  // surfaces exactly where they were and the reorder appeared not to happen.
  it("does not hand one box's key to whatever now sits at its index", () => {
    const previous: EditorSection[] = [
      { type: "flow", blocks: [paragraph("a", "First")], clientKey: "flow-a" },
      { type: "flow", blocks: [paragraph("b", "Second")], clientKey: "flow-b" },
    ];
    const next = preserveFlowClientKeys(previous, [
      { type: "flow", blocks: [paragraph("b", "Second")], clientKey: "flow-b" },
      { type: "flow", blocks: [paragraph("a", "First")], clientKey: "flow-a" },
    ]);
    expect(next[0]).toMatchObject({ clientKey: "flow-b" });
    expect(next[1]).toMatchObject({ clientKey: "flow-a" });
  });

  it("still inherits a key when every block id in the flow was re-minted", () => {
    const previous: EditorSection[] = [
      { type: "flow", blocks: [paragraph("old", "Hello")], clientKey: "flow-stable" },
    ];
    const next = preserveFlowClientKeys(previous, [
      { type: "flow", blocks: [paragraph("new", "Hello there")], clientKey: "flow:new" },
    ]);
    expect(next[0]).toMatchObject({ clientKey: "flow-stable" });
  });

  it("gives every flow a distinct, non-empty key", () => {
    const previous: EditorSection[] = [
      { type: "flow", blocks: [paragraph("a", "First")], clientKey: "flow-a" },
    ];
    const next = preserveFlowClientKeys(
      previous,
      stampFlowClientKeys([
        { type: "flow", blocks: [paragraph("a", "First")] },
        { type: "flow", blocks: [paragraph("b", "Second")] },
        { type: "flow", blocks: [] },
      ]),
    );
    const keys = next
      .filter((section): section is Extract<EditorSection, { type: "flow" }> => section.type === "flow")
      .map((section) => section.clientKey);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

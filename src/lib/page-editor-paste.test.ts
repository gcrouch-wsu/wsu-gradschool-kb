import { describe, expect, it } from "vitest";
import {
  partitionClipboardHtmlImages,
  prepareClipboardHtmlPaste,
} from "@/lib/page-editor-format";

describe("partitionClipboardHtmlImages", () => {
  it("extracts http figures into image blocks and leaves surrounding text", () => {
    const result = partitionClipboardHtmlImages(
      `<p>Before</p>` +
        `<figure class="doc-image" data-block-id="fig-1"><img src="https://example.com/a.png" alt="A" /></figure>` +
        `<p>After</p>`,
    );

    expect(result.imageBlocks).toHaveLength(1);
    expect(result.imageBlocks[0]?.type).toBe("image");
    expect(result.imageBlocks[0]?.url).toContain("example.com/a.png");
    expect(result.dataUrlFiles).toHaveLength(0);
    expect(result.html).toContain("Before");
    expect(result.html).toContain("After");
    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("<figure");
  });

  it("extracts generic figure and bare img hosts", () => {
    const genericFigure = partitionClipboardHtmlImages(
      `<p>Intro</p><figure><img src="https://example.com/bare-figure.png" alt="Fig" /></figure>`,
    );
    expect(genericFigure.imageBlocks).toHaveLength(1);
    expect(genericFigure.imageBlocks[0]?.url).toContain("bare-figure.png");
    expect(genericFigure.html).not.toContain("<figure");

    const bareImg = partitionClipboardHtmlImages(
      `<p>Shot</p><img src="/kb/demo/files/shot.png" alt="Shot" />`,
    );
    expect(bareImg.imageBlocks).toHaveLength(1);
    expect(bareImg.imageBlocks[0]?.url).toContain("/kb/demo/files/shot.png");
    expect(bareImg.html).not.toContain("<img");
  });

  it("converts data-url images into uploadable files", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const result = partitionClipboardHtmlImages(`<p>Shot</p><img src="${dataUrl}" alt="Pixel" />`);

    expect(result.imageBlocks).toHaveLength(0);
    expect(result.dataUrlFiles).toHaveLength(1);
    expect(result.dataUrlFiles[0]?.type).toBe("image/png");
    expect(result.html).toContain("Shot");
    expect(result.html).not.toContain("<img");
  });
});

describe("prepareClipboardHtmlPaste", () => {
  it("partitions images before sanitizing so bare img markup is not lost", () => {
    // Bare <img> (no block-level wrapper) would be stripped by rich-text sanitization
    // if clean ran first. The paste path must promote it before sanitize.
    const result = prepareClipboardHtmlPaste(
      `Hello <img src="https://example.com/pasted.png" alt="Pasted" /> world`,
    );

    expect(result.imageBlocks).toHaveLength(1);
    expect(result.imageBlocks[0]?.url).toContain("pasted.png");
    expect(result.imageBlocks[0]?.alt).toBe("Pasted");
    expect(result.html.toLowerCase()).not.toContain("<img");
    expect(result.html).toMatch(/Hello/i);
    expect(result.html).toMatch(/world/i);
  });

  it("keeps surrounding block HTML after extracting a generic figure", () => {
    const result = prepareClipboardHtmlPaste(
      `<p>Before</p><figure><img src="https://example.com/x.png" alt="X" /></figure><p>After</p>`,
    );

    expect(result.imageBlocks).toHaveLength(1);
    expect(result.html).toContain("Before");
    expect(result.html).toContain("After");
    expect(result.html.toLowerCase()).not.toContain("<figure");
    expect(result.html.toLowerCase()).not.toContain("<img");
  });

  it("converts URL-encoded svg data images into files instead of dropping them", () => {
    const svg =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E";
    const result = prepareClipboardHtmlPaste(`<p>Icon</p><img src="${svg}" alt="Icon" />`);

    expect(result.imageBlocks).toHaveLength(0);
    expect(result.dataUrlFiles).toHaveLength(1);
    expect(result.dataUrlFiles[0]?.type).toBe("image/svg+xml");
    expect(result.html.toLowerCase()).not.toContain("<img");
    expect(result.html).toMatch(/Icon/i);
  });
});

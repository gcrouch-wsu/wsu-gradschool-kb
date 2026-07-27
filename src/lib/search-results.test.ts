import { afterEach, describe, expect, it, vi } from "vitest";
import { createManagedAsset, createPage, searchKb } from "@/lib/kb-store";
import type { ContentBlock } from "@/lib/types";

describe("reader search result types (in-memory)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("excludes image assets from results while keeping documents", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = `zetaquery${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await createManagedAsset({
      homeKbId: "kb-grad-school",
      title: `Image ${token}`,
      assetType: "image",
      mimeType: "image/png",
      fileSizeBytes: 10,
      body: "data:image/png;base64,",
      originalFilename: "shot.png",
    });
    await createManagedAsset({
      homeKbId: "kb-grad-school",
      title: `Document ${token}`,
      assetType: "document",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      body: "pdf-bytes",
      originalFilename: "doc.pdf",
    });

    const results = await searchKb("kb-grad-school", token, true);
    const assetTitles = results.filter((result) => result.type === "asset").map((result) => result.title);
    expect(assetTitles).toContain(`Document ${token}`);
    expect(assetTitles).not.toContain(`Image ${token}`);
  });

  it("finds pages by tags", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = `tagquery${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const blocks: ContentBlock[] = [
      {
        blockId: "p1",
        type: "paragraph",
        text: "This page body intentionally does not include the search token.",
      },
    ];
    const page = await createPage({
      kbId: "kb-grad-school",
      title: "Tagged page",
      slug: `tagged-${token}`,
      status: "published",
      summary: "Ordinary page summary.",
      tags: [token],
      blocks,
    });

    const results = await searchKb("kb-grad-school", token, true);
    expect(results.map((result) => result.id)).toContain(page.id);
  });

  it("finds document assets by tags", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = `assettag${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const asset = await createManagedAsset({
      homeKbId: "kb-grad-school",
      title: "Tagged document asset",
      assetType: "document",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      body: "pdf-bytes",
      originalFilename: "tagged-doc.pdf",
      tags: [token],
    });

    const results = await searchKb("kb-grad-school", token, true);
    expect(results.map((result) => result.id)).toContain(asset.id);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assetHasPublicPublishedUsage,
  createManagedAsset,
  createPage,
  updateAssetMetadata,
} from "@/lib/kb-store";
import type { ContentBlock } from "@/lib/types";

describe("asset metadata + selected-text link delivery (in-memory)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves description, altText, and tags when updated together", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = `meta${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const asset = await createManagedAsset({
      homeKbId: "kb-grad-school",
      title: `Meta ${token}`,
      assetType: "document",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      body: "pdf",
      originalFilename: `${token}.pdf`,
      description: "initial",
      tags: ["seed"],
    });

    const { asset: updated, fields } = await updateAssetMetadata(asset.id, {
      description: "updated description",
      altText: "updated alt",
      tags: ["visa", "forms"],
    });

    expect(fields).toEqual(["description", "altText", "tags"]);
    expect(updated.description).toBe("updated description");
    expect(updated.altText).toBe("updated alt");
    expect(updated.tags).toEqual(["visa", "forms"]);
  });

  it("counts selected-text document links as public published usage", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = `doclink${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const asset = await createManagedAsset({
      homeKbId: "kb-grad-school",
      title: `Linked doc ${token}`,
      assetType: "document",
      mimeType: "application/pdf",
      fileSizeBytes: 10,
      body: "pdf",
      originalFilename: `${token}.pdf`,
    });

    const blocks: ContentBlock[] = [
      {
        blockId: "p1",
        type: "paragraph",
        text: "See the form",
        html: `<a href="/kb/graduate-school/files/${asset.slug}" data-asset-id="${asset.id}">form</a>`,
      },
    ];
    await createPage({
      kbId: "kb-grad-school",
      title: `Page with inline doc link ${token}`,
      slug: `inline-doc-${token}`,
      status: "published",
      visibility: "public",
      summary: "Uses a selected-text document link.",
      blocks,
    });

    await expect(assetHasPublicPublishedUsage(asset)).resolves.toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createManagedAsset, searchKb } from "@/lib/kb-store";

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
});

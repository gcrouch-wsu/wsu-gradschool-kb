import { describe, expect, it } from "vitest";
import {
  activateVersion,
  createDraftVersion,
  currentActiveVersion,
  extractAssetUsages,
  hasSingleActiveVersion,
  nextVersionNumber,
  restoreVersionAsDraft,
} from "@/lib/asset-lifecycle";
import type { AssetVersion, AssetVersionStatus, ContentBlock, KbPage } from "@/lib/types";

function version(id: string, versionNumber: number, status: AssetVersionStatus): AssetVersion {
  return {
    id,
    assetId: "asset-1",
    versionNumber,
    status,
    body: `body-${id}`,
    mimeType: "image/png",
    fileSizeBytes: 100,
    originalFilename: `${id}.png`,
    uploadedAt: "2026-01-01",
  };
}

function page(id: string, blocks: ContentBlock[], relatedAssetIds: string[] = []): KbPage {
  return {
    id,
    kbId: "kb",
    title: `Page ${id}`,
    slug: id,
    path: [id],
    sortOrder: 0,
    summary: "",
    status: "published",
    visibility: "public",
    ownerLabel: "",
    contactEmail: "",
    lastReviewedDate: "",
    updatedDisplayDate: "",
    blocks,
    relatedPageIds: [],
    relatedAssetIds,
    showToc: true,
    tocDepth: 3,
  };
}

describe("version numbering", () => {
  it("starts at 1 and increments past the highest existing number", () => {
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber([version("a", 1, "replaced"), version("b", 3, "active")])).toBe(4);
  });
});

describe("currentActiveVersion / invariant", () => {
  it("returns the active version or null", () => {
    expect(currentActiveVersion([version("a", 1, "replaced")])).toBeNull();
    expect(currentActiveVersion([version("a", 1, "active")])?.id).toBe("a");
  });

  it("detects the single-active invariant", () => {
    expect(hasSingleActiveVersion([version("a", 1, "active")])).toBe(true);
    expect(hasSingleActiveVersion([version("a", 1, "replaced")])).toBe(false);
    expect(hasSingleActiveVersion([version("a", 1, "active"), version("b", 2, "active")])).toBe(false);
  });
});

describe("createDraftVersion", () => {
  it("adds a draft without disturbing the active version", () => {
    const versions = [version("a", 1, "active")];
    const draft = createDraftVersion("asset-1", versions, {
      body: "new",
      mimeType: "image/png",
      fileSizeBytes: 200,
      originalFilename: "new.png",
    }, "2026-06-03");
    expect(draft.status).toBe("draft");
    expect(draft.versionNumber).toBe(2);

    expect(currentActiveVersion(versions)?.id).toBe("a");
  });

  it("refuses a second open draft", () => {
    const versions = [version("a", 1, "active"), version("b", 2, "draft")];
    expect(() =>
      createDraftVersion("asset-1", versions, {
        body: "x",
        mimeType: "image/png",
        fileSizeBytes: 1,
        originalFilename: "x.png",
      }, "2026-06-03"),
    ).toThrow(/already open/i);
  });
});

describe("activateVersion", () => {
  it("activates the target and demotes the prior active to replaced", () => {
    const result = activateVersion([version("a", 1, "active"), version("b", 2, "draft")], "b");
    const byId = Object.fromEntries(result.map((v) => [v.id, v.status]));
    expect(byId.b).toBe("active");
    expect(byId.a).toBe("replaced");
    expect(hasSingleActiveVersion(result)).toBe(true);
  });

  it("is idempotent when the target is already active", () => {
    const result = activateVersion([version("a", 1, "active")], "a");
    expect(hasSingleActiveVersion(result)).toBe(true);
    expect(currentActiveVersion(result)?.id).toBe("a");
  });

  it("refuses to activate an archived version directly", () => {
    expect(() => activateVersion([version("a", 1, "archived")], "a")).toThrow(/restore them as a draft/i);
  });

  it("throws for an unknown version", () => {
    expect(() => activateVersion([version("a", 1, "active")], "missing")).toThrow(/not found/i);
  });
});

describe("restoreVersionAsDraft", () => {
  it("clones an old version into a new draft and keeps the active version", () => {
    const versions = [version("a", 1, "replaced"), version("b", 2, "active")];
    const result = restoreVersionAsDraft(versions, "a", "2026-06-03");
    expect(result).toHaveLength(3);
    const draft = result[result.length - 1];
    expect(draft.status).toBe("draft");
    expect(draft.versionNumber).toBe(3);
    expect(draft.body).toBe("body-a");
    expect(draft.notes).toMatch(/Restored from v1/);
    expect(currentActiveVersion(result)?.id).toBe("b");
  });
});

describe("extractAssetUsages", () => {
  const pages: KbPage[] = [
    page("with-alt", [{ blockId: "img1", type: "image", assetId: "asset-1", alt: "A chart" }]),
    page("no-alt", [{ blockId: "img2", type: "image", assetId: "asset-1", alt: "" }]),
    page("link", [{ blockId: "lnk", type: "asset_link", assetId: "asset-1" }]),
    page("related", [{ blockId: "p", type: "paragraph", text: "hi" }], ["asset-1"]),
    page("other", [{ blockId: "img3", type: "image", assetId: "asset-2", alt: "x" }]),
  ];

  it("finds inline image, link, and related usages", () => {
    const usages = extractAssetUsages(pages, "asset-1");
    expect(usages).toHaveLength(4);
    const types = usages.map((u) => u.usageType).sort();
    expect(types).toEqual(["inline_image", "inline_image", "inline_link", "related"]);
  });

  it("records whether image usages have alt text", () => {
    const usages = extractAssetUsages(pages, "asset-1");
    const withAlt = usages.find((u) => u.pageId === "with-alt");
    const noAlt = usages.find((u) => u.pageId === "no-alt");
    expect(withAlt?.usesAltText).toBe(true);
    expect(noAlt?.usesAltText).toBe(false);
  });

  it("ignores pages that do not reference the asset", () => {
    const usages = extractAssetUsages(pages, "asset-1");
    expect(usages.some((u) => u.pageId === "other")).toBe(false);
  });
});

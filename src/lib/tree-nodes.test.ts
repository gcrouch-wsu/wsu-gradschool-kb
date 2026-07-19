import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPage,
  listPageRevisions,
  restorePageRevision,
  searchKb,
  setKbHomepagePage,
  updatePage,
} from "@/lib/kb-store";
import { validatePageForPublish, validateRevisionForRestore } from "@/lib/publish-gate";

const activeAsset = async () => "active";

describe("tree node kinds (in-memory)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("excludes group headings and links from search results", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = `nodequery${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await createPage({
      kbId: "kb-grad-school",
      title: `Group ${token}`,
      nodeKind: "group",
      blocks: [],
      status: "published",
    });
    await createPage({
      kbId: "kb-grad-school",
      title: `Link ${token}`,
      nodeKind: "link",
      linkUrl: "https://gradschool.wsu.edu/",
      blocks: [],
      status: "published",
    });
    const page = await createPage({
      kbId: "kb-grad-school",
      title: `Page ${token}`,
      blocks: [{ blockId: "p1", type: "paragraph", text: "Body." }],
      status: "published",
    });

    const results = await searchKb("kb-grad-school", token, true);
    const titles = results.filter((result) => result.type === "page").map((result) => result.title);
    expect(titles).toContain(`Page ${token}`);
    expect(titles).not.toContain(`Group ${token}`);
    expect(titles).not.toContain(`Link ${token}`);

    await expect(setKbHomepagePage("kb-grad-school", page.id)).resolves.toBeTruthy();
    await setKbHomepagePage("kb-grad-school", null);
  });

  it("rejects group headings and links as the KB homepage", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(setKbHomepagePage("kb-grad-school", "page-group-reference")).rejects.toThrow(
      /cannot be used as a knowledge base homepage/i,
    );
  });

  it("publishes groups on a title alone and requires a destination for links", async () => {
    const base = {
      title: "Node",
      slug: "node",
      summary: "",
      ownerLabel: "",
      contactEmail: "",
      lastReviewedDate: "",
      blocks: [],
    };
    expect(await validatePageForPublish({ ...base, nodeKind: "group" }, activeAsset)).toEqual([]);
    const badLink = await validatePageForPublish(
      { ...base, nodeKind: "link", linkUrl: "javascript:alert(1)" },
      activeAsset,
    );
    expect(badLink.some((issue) => issue.includes("destination"))).toBe(true);
    expect(
      await validatePageForPublish(
        { ...base, nodeKind: "link", linkUrl: "https://gradschool.wsu.edu/" },
        activeAsset,
      ),
    ).toEqual([]);
  });

  it("restores link-node destinations from the selected revision", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const page = await createPage({
      kbId: "kb-grad-school",
      title: `Restore Link ${token}`,
      nodeKind: "link",
      linkUrl: "https://gradschool.wsu.edu/first",
      linkNewTab: true,
      blocks: [],
      status: "published",
    });
    const revisions = await listPageRevisions(page.id);
    const initialRevision = revisions.find((revision) => revision.revisionNumber === 1);
    if (!initialRevision) {
      throw new Error("Expected an initial page revision.");
    }

    await updatePage(
      {
        pageId: page.id,
        title: page.title,
        slug: page.slug,
        parentPath: page.path.slice(0, -1),
        summary: page.summary,
        visibility: page.visibility,
        status: page.status,
        blocks: [],
        linkUrl: "https://gradschool.wsu.edu/second",
        linkNewTab: false,
      },
      "tester@example.edu",
    );

    const restored = await restorePageRevision(initialRevision.id, "tester@example.edu");
    expect(restored.linkUrl).toBe("https://gradschool.wsu.edu/first");
    expect(restored.linkNewTab).toBe(true);
  });

  it("validates published link-node revisions with link-node rules", async () => {
    const baseRevision = {
      status: "published" as const,
      title: "Restored Link",
      slug: "restored-link",
      summary: "",
      ownerLabel: "",
      contactEmail: "",
      lastReviewedDate: "",
      blocks: [],
      nodeKind: "link" as const,
      linkUrl: "https://gradschool.wsu.edu/",
    };

    expect(await validateRevisionForRestore(baseRevision, activeAsset)).toEqual([]);
    const badLink = await validateRevisionForRestore(
      { ...baseRevision, linkUrl: "data:text/html,hi" },
      activeAsset,
    );
    expect(badLink.some((issue) => issue.includes("destination"))).toBe(true);
  });
});

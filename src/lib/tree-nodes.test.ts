import { afterEach, describe, expect, it, vi } from "vitest";
import { createPage, searchKb, setKbHomepagePage } from "@/lib/kb-store";
import { validatePageForPublish } from "@/lib/publish-gate";

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
});

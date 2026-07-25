import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPage,
  getActiveRedirectTarget,
  getKbBySlug,
  getPageByIdForAdmin,
  relocatePage,
} from "@/lib/kb-store";

describe("relocatePage (in-memory)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("copies a page into another KB as a draft with reminted block ids", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const destKb = await getKbBySlug("graduate-school-2");
    const source = await createPage({
      kbId: sourceKb!.id,
      title: "Copy me across KBs",
      blocks: [{ blockId: "b1", type: "paragraph", text: "Hello" }],
      status: "published",
      authorEmail: "editor@example.edu",
    });

    const result = await relocatePage({
      pageId: source.id,
      targetKbId: destKb!.id,
      parentPath: [],
      mode: "copy",
      includeChildren: false,
      authorEmail: "editor@example.edu",
    });

    expect(result.mode).toBe("copy");
    expect(result.rootPage.kbId).toBe(destKb!.id);
    expect(result.rootPage.status).toBe("draft");
    expect(result.rootPage.id).not.toBe(source.id);
    expect(result.rootPage.blocks[0]?.blockId).not.toBe(source.blocks[0]?.blockId);

    const original = await getPageByIdForAdmin(source.id);
    expect(original?.kbId).toBe(sourceKb!.id);
  });

  it("moves a published page and leaves an absolute redirect on the source KB", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const destKb = await getKbBySlug("graduate-school-3");
    const source = await createPage({
      kbId: sourceKb!.id,
      title: "Move me across KBs",
      blocks: [{ blockId: "b1", type: "paragraph", text: "Moving" }],
      status: "published",
      authorEmail: "editor@example.edu",
    });
    const oldPath = [...source.path];

    const result = await relocatePage({
      pageId: source.id,
      targetKbId: destKb!.id,
      parentPath: [],
      mode: "move",
      authorEmail: "editor@example.edu",
    });

    expect(result.rootPage.kbId).toBe(destKb!.id);
    expect(result.rootPage.id).toBe(source.id);

    const moved = await getPageByIdForAdmin(source.id);
    expect(moved?.kbId).toBe(destKb!.id);

    const redirect = await getActiveRedirectTarget(sourceKb!.id, oldPath);
    expect(redirect).toEqual({
      kind: "href",
      href: `/kb/${destKb!.slug}/${result.rootPage.path.join("/")}`,
    });
  });

  it("does not leave a public redirect when moving a published page into a private KB", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const destKb = await getKbBySlug("graduate-school-staff", true);
    expect(destKb?.visibility).toBe("private");
    const source = await createPage({
      kbId: sourceKb!.id,
      title: "Move me into private",
      blocks: [{ blockId: "b1", type: "paragraph", text: "Secret move" }],
      status: "published",
      authorEmail: "editor@example.edu",
    });
    const oldPath = [...source.path];

    const result = await relocatePage({
      pageId: source.id,
      targetKbId: destKb!.id,
      parentPath: [],
      mode: "move",
      authorEmail: "editor@example.edu",
    });

    expect(result.rootPage.kbId).toBe(destKb!.id);
    expect(await getActiveRedirectTarget(sourceKb!.id, oldPath)).toBeNull();
  });

  it("rejects same-KB moves", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const source = await createPage({
      kbId: sourceKb!.id,
      title: "Stay put",
      blocks: [{ blockId: "b1", type: "paragraph", text: "Nope" }],
      authorEmail: "editor@example.edu",
    });
    await expect(
      relocatePage({
        pageId: source.id,
        targetKbId: sourceKb!.id,
        mode: "move",
      }),
    ).rejects.toThrow(/same knowledge base/i);
  });
});

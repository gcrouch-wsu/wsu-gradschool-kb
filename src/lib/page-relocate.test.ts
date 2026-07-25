import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPage,
  getActiveRedirectTarget,
  getKbBySlug,
  getPageByIdForAdmin,
  relocatePage,
  updatePage,
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

  it("moves a multi-level subtree and preserves nesting under the destination parent", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const destKb = await getKbBySlug("graduate-school-2");
    const root = await createPage({
      kbId: sourceKb!.id,
      title: "Subtree root",
      blocks: [{ blockId: "r1", type: "paragraph", text: "Root" }],
      status: "published",
      authorEmail: "editor@example.edu",
    });
    const child = await createPage({
      kbId: sourceKb!.id,
      title: "Subtree child",
      parentPath: root.path,
      blocks: [{ blockId: "c1", type: "paragraph", text: "Child" }],
      status: "published",
      authorEmail: "editor@example.edu",
    });
    const grand = await createPage({
      kbId: sourceKb!.id,
      title: "Subtree grand",
      parentPath: child.path,
      blocks: [{ blockId: "g1", type: "paragraph", text: "Grand" }],
      status: "draft",
      authorEmail: "editor@example.edu",
    });

    const destParent = await createPage({
      kbId: destKb!.id,
      title: "Dest nest",
      blocks: [{ blockId: "d1", type: "paragraph", text: "Nest" }],
      authorEmail: "editor@example.edu",
    });

    const result = await relocatePage({
      pageId: root.id,
      targetKbId: destKb!.id,
      parentPath: destParent.path,
      mode: "move",
      authorEmail: "editor@example.edu",
    });

    expect(result.pages).toHaveLength(3);
    const movedRoot = await getPageByIdForAdmin(root.id);
    const movedChild = await getPageByIdForAdmin(child.id);
    const movedGrand = await getPageByIdForAdmin(grand.id);
    expect(movedRoot?.kbId).toBe(destKb!.id);
    expect(movedChild?.kbId).toBe(destKb!.id);
    expect(movedGrand?.kbId).toBe(destKb!.id);
    expect(movedRoot?.path.slice(0, -1)).toEqual(destParent.path);
    expect(movedChild?.path.slice(0, -1)).toEqual(movedRoot?.path);
    expect(movedGrand?.path.slice(0, -1)).toEqual(movedChild?.path);
  });

  it("clears an edit lock when moving a locked page", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const destKb = await getKbBySlug("graduate-school-3");
    const source = await createPage({
      kbId: sourceKb!.id,
      title: "Locked then moved",
      blocks: [{ blockId: "b1", type: "paragraph", text: "Locked" }],
      status: "draft",
      authorEmail: "editor@example.edu",
    });
    source.lockedBy = "other-editor@example.edu";
    source.lockedAt = new Date().toISOString();

    const result = await relocatePage({
      pageId: source.id,
      targetKbId: destKb!.id,
      parentPath: [],
      mode: "move",
      authorEmail: "mover@example.edu",
    });

    expect(result.rootPage.lockedBy).toBeNull();
    const moved = await getPageByIdForAdmin(source.id);
    expect(moved?.kbId).toBe(destKb!.id);
    expect(moved?.lockedBy ?? null).toBeNull();
  });

  it("tells a displaced editor to reload when saving with a stale parent path", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const sourceKb = await getKbBySlug("graduate-school");
    const destKb = await getKbBySlug("graduate-school-2");
    const nest = await createPage({
      kbId: sourceKb!.id,
      title: "Old parent",
      blocks: [{ blockId: "p1", type: "paragraph", text: "Parent" }],
      authorEmail: "editor@example.edu",
    });
    const source = await createPage({
      kbId: sourceKb!.id,
      title: "Child to move",
      parentPath: nest.path,
      blocks: [{ blockId: "c1", type: "paragraph", text: "Child" }],
      authorEmail: "editor@example.edu",
    });
    const staleParentPath = [...nest.path];

    await relocatePage({
      pageId: source.id,
      targetKbId: destKb!.id,
      parentPath: [],
      mode: "move",
      authorEmail: "mover@example.edu",
    });

    await expect(
      updatePage(
        {
          pageId: source.id,
          title: "Child to move",
          parentPath: staleParentPath,
          blocks: [{ blockId: "c1", type: "paragraph", text: "Stale save" }],
        },
        "displaced@example.edu",
      ),
    ).rejects.toThrow(/reload the editor/i);
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

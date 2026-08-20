import { describe, expect, it, vi } from "vitest";
import { createPage, getKbBySlug, getPageByIdForAdmin, updatePageLayout } from "@/lib/kb-store";

async function makePage(kbId: string, title: string, parentPath: string[]) {
  return createPage({
    kbId,
    title,
    parentPath,
    summary: "Fixture.",
    ownerLabel: "Graduate School",
    contactEmail: "gradschool@wsu.edu",
    blocks: [],
  });
}

describe("updatePageLayout batch moves", () => {
  // The tree manager submits the whole intended arrangement at once, so a child's new
  // parentPath routinely names a location its parent only reaches in the same request.
  // Validating against the pre-move paths rejected those batches with "Parent page not
  // found" — the intermittent error editors hit right after reorganising.
  it("accepts a batch that moves a parent and re-parents a child onto its new path", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school");
    expect(kb).toBeTruthy();

    const host = await makePage(kb!.id, `Batch Host ${crypto.randomUUID().slice(0, 6)}`, []);
    const mover = await makePage(kb!.id, `Batch Mover ${crypto.randomUUID().slice(0, 6)}`, []);
    const rider = await makePage(kb!.id, `Batch Rider ${crypto.randomUUID().slice(0, 6)}`, []);

    // Move `mover` under `host`, and in the SAME batch put `rider` under mover's new path.
    await expect(
      updatePageLayout(kb!.id, [
        { pageId: mover.id, parentPath: [...host.path], sortOrder: 10 },
        { pageId: rider.id, parentPath: [...host.path, mover.slug], sortOrder: 20 },
      ]),
    ).resolves.toBeUndefined();

    const movedRider = await getPageByIdForAdmin(rider.id);
    expect(movedRider?.path).toEqual([...host.path, mover.slug, rider.slug]);
  });

  it("still rejects a parent path that no arrangement produces", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school");
    const orphan = await makePage(kb!.id, `Batch Orphan ${crypto.randomUUID().slice(0, 6)}`, []);

    await expect(
      updatePageLayout(kb!.id, [
        { pageId: orphan.id, parentPath: ["nothing-here-at-all"], sortOrder: 10 },
      ]),
    ).rejects.toThrow(/Parent page not found/);
  });

  it("still rejects nesting a page under its own child", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school");
    const parent = await makePage(kb!.id, `Batch Cycle ${crypto.randomUUID().slice(0, 6)}`, []);
    const child = await makePage(kb!.id, "Batch Cycle Child", [...parent.path]);

    await expect(
      updatePageLayout(kb!.id, [
        { pageId: parent.id, parentPath: [...child.path], sortOrder: 10 },
      ]),
    ).rejects.toThrow(/cannot be nested under itself/);
  });
});

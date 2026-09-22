import { afterEach, describe, expect, it, vi } from "vitest";

describe("Neon egress-sensitive helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("publishDueDraftPages returns immediately when no drafts are due (DB path)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.resetModules();

    const db = await import("@/lib/db");
    vi.spyOn(db, "isDatabaseEnabled").mockReturnValue(true);
    const loadDue = vi.spyOn(db, "loadDueScheduledPagesFromDb").mockResolvedValue([]);
    const loadDataset = vi.spyOn(db, "loadDatasetFromDb");

    const { publishDueDraftPages } = await import("@/lib/kb-store");
    await expect(publishDueDraftPages()).resolves.toEqual({
      attempted: 0,
      published: [],
      blocked: [],
    });
    expect(loadDue).toHaveBeenCalledOnce();
    expect(loadDataset).not.toHaveBeenCalled();
  });

  it("getAdminCounts uses SQL aggregates when the database is enabled", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.resetModules();

    const db = await import("@/lib/db");
    vi.spyOn(db, "isDatabaseEnabled").mockReturnValue(true);
    vi.spyOn(db, "loadAdminCountsFromDb").mockResolvedValue({
      publishedKbs: 2,
      publishedPages: 10,
      draftPages: 3,
      archivedPages: 1,
      activeAssets: 4,
      archivedAssets: 0,
    });
    const loadDataset = vi.spyOn(db, "loadDatasetFromDb");

    const { getAdminCounts } = await import("@/lib/kb-store");
    await expect(getAdminCounts()).resolves.toMatchObject({
      publishedKbs: 2,
      publishedPages: 10,
      draftPages: 3,
      storageMode: "neon",
    });
    expect(loadDataset).not.toHaveBeenCalled();
  });

  it("getVisiblePagesForKb uses page summaries without blocks on the DB path", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example");
    vi.resetModules();

    const db = await import("@/lib/db");
    vi.spyOn(db, "isDatabaseEnabled").mockReturnValue(true);
    const summaries = vi.spyOn(db, "loadPagesForKbWithoutBlocksFromDb").mockResolvedValue([]);
    const fullPages = vi.spyOn(db, "loadPagesForKbFromDb");

    const { getVisiblePagesForKb } = await import("@/lib/kb-store");
    await getVisiblePagesForKb("kb-grad-school", false);
    expect(summaries).toHaveBeenCalledWith("kb-grad-school");
    expect(fullPages).not.toHaveBeenCalled();
  });
});

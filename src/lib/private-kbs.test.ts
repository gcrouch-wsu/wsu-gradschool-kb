import { afterEach, describe, expect, it, vi } from "vitest";
import { getKbReadAccess, type AdminSession } from "@/lib/auth";
import {
  assetHasPublicPublishedUsage,
  getAssetById,
  getKbBySlug,
  getPageByPath,
  searchKb,
} from "@/lib/kb-store";

function session(role: AdminSession["role"], userId: string): AdminSession {
  return {
    userId,
    email: `${userId}@example.edu`,
    role,
    source: "env",
    expiresAt: Date.now() + 60_000,
    version: "test",
  };
}

describe("private KB read access (in-memory)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("hides private KBs from anonymous readers and allows an assigned viewer", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const privateKb = await getKbBySlug("graduate-school-staff");
    expect(privateKb).not.toBeNull();

    expect(await getKbReadAccess(null, privateKb!)).toMatchObject({ canRead: false });
    expect(await getKbReadAccess(session("viewer", "seed-viewer-private-staff"), privateKb!)).toMatchObject({
      canRead: true,
      canReadStaffContent: false,
    });
    expect(await getKbReadAccess(session("viewer", "unassigned-viewer"), privateKb!)).toMatchObject({
      canRead: false,
    });
  });

  it("treats unpublished KBs as unreadable for anonymous users and viewers", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const draftPublicKb = { id: "kb-any", visibility: "public" as const, status: "draft" as const };
    const draftPrivateKb = { id: "kb-private-staff", visibility: "private" as const, status: "draft" as const };

    expect(await getKbReadAccess(null, draftPublicKb)).toMatchObject({ canRead: false });
    expect(await getKbReadAccess(session("viewer", "seed-viewer-private-staff"), draftPublicKb)).toMatchObject({
      canRead: false,
    });
    expect(await getKbReadAccess(session("viewer", "seed-viewer-private-staff"), draftPrivateKb)).toMatchObject({
      canRead: false,
    });
    expect(await getKbReadAccess(session("editor", "seed-editor-private-staff"), draftPrivateKb)).toMatchObject({
      canRead: true,
      canReadStaffContent: true,
    });
    expect(await getKbReadAccess(session("editor", "unassigned-editor"), draftPublicKb)).toMatchObject({
      canRead: false,
    });
    expect(await getKbReadAccess(session("owner", "any-owner"), draftPublicKb)).toMatchObject({
      canRead: true,
      canReadStaffContent: true,
    });
  });

  it("does not expose staff-only pages to viewers even when they have a session", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const publicKb = await getKbBySlug("graduate-school");
    expect(publicKb).not.toBeNull();

    const viewerAccess = await getKbReadAccess(session("viewer", "seed-viewer-private-staff"), publicKb!);
    expect(viewerAccess.canRead).toBe(true);
    expect(viewerAccess.canReadStaffContent).toBe(false);
    await expect(
      getPageByPath(publicKb!.id, ["templates", "graduate-program-handbooks"], viewerAccess.canReadStaffContent),
    ).resolves.toBeNull();
  });

  it("scopes private KB search to assigned viewers", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const privateKb = await getKbBySlug("graduate-school-staff");
    expect(privateKb).not.toBeNull();

    const anonymousResults = await searchKb(undefined, "Private Staff Orientation", false, {
      readableKbIds: ["kb-grad-school", "kb-grad-school-2", "kb-grad-school-3"],
      staffKbIds: [],
    });
    expect(anonymousResults.some((result) => result.kbId === privateKb!.id)).toBe(false);

    const viewerResults = await searchKb(undefined, "Private Staff Orientation", false, {
      readableKbIds: [privateKb!.id],
      staffKbIds: [],
    });
    expect(viewerResults.some((result) => result.id === "page-private-staff-orientation")).toBe(true);
    expect(viewerResults.some((result) => result.id === "asset-private-orientation")).toBe(true);
  });

  it("distinguishes public-page asset usage from staff-only asset usage", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const publicAsset = await getAssetById("asset-fact-sheet-checklist");
    const staffAsset = await getAssetById("asset-handbook-template");
    expect(publicAsset).not.toBeNull();
    expect(staffAsset).not.toBeNull();

    await expect(assetHasPublicPublishedUsage(publicAsset!)).resolves.toBe(true);
    await expect(assetHasPublicPublishedUsage(staffAsset!)).resolves.toBe(false);
  });
});

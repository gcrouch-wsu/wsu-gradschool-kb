import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { Asset } from "@/lib/types";

const asset: Asset = {
  id: "asset-1",
  homeKbId: "kb-grad-school",
  title: "Handbook",
  slug: "handbook",
  description: "old description",
  tags: ["old"],
  assetType: "document",
  mimeType: "application/pdf",
  fileSizeBytes: 1000,
  status: "active",
  ownerLabel: "Graduate School",
  lastReviewedDate: "2026-07-01",
  updatedDisplayDate: "2026-07-01",
  versionId: "v1",
  body: "pdf",
  altText: "old alt",
};

function session(role: AdminSession["role"] = "owner"): AdminSession {
  return {
    userId: `${role}-1`,
    email: `${role}@example.edu`,
    role,
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "v1",
  };
}

describe("PATCH /api/admin/assets/[assetId]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("applies description, altText, and tags in one metadata update", async () => {
    const security = await import("@/lib/security");
    const store = await import("@/lib/kb-store");
    const audit = await import("@/lib/audit-log");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "owner@example.edu",
      session: session("owner"),
    });
    vi.spyOn(security, "requireKbAccess").mockResolvedValue(null);
    vi.spyOn(store, "getAssetHomeKbId").mockResolvedValue(asset.homeKbId);
    const metadataSpy = vi.spyOn(store, "updateAssetMetadata").mockResolvedValue({
      asset: {
        ...asset,
        description: "new description",
        altText: "new alt",
        tags: ["visa", "forms"],
      },
      fields: ["description", "altText", "tags"],
    });
    vi.spyOn(audit, "recordAuditEvent").mockResolvedValue(undefined);

    const { PATCH } = await import("@/app/api/admin/assets/[assetId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/admin/assets/asset-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: "new description",
          altText: "new alt",
          tags: ["visa", "forms"],
        }),
      }),
      { params: Promise.resolve({ assetId: "asset-1" }) },
    );

    expect(response.status).toBe(200);
    expect(metadataSpy).toHaveBeenCalledTimes(1);
    expect(metadataSpy).toHaveBeenCalledWith("asset-1", {
      description: "new description",
      altText: "new alt",
      tags: ["visa", "forms"],
    });
    const body = await response.json();
    expect(body.asset.description).toBe("new description");
    expect(body.asset.altText).toBe("new alt");
    expect(body.asset.tags).toEqual(["visa", "forms"]);
  });
});

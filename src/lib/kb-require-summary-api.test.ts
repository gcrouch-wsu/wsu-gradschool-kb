import { afterEach, describe, expect, it, vi } from "vitest";

describe("PATCH /api/admin/kbs/[kbId] requireSummary auth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function session(role: "owner" | "admin" | "editor") {
    return {
      userId: `${role}-1`,
      email: `${role}@example.edu`,
      role,
      source: "managed" as const,
      expiresAt: Date.now() + 60_000,
      version: "v1" as const,
    };
  }

  async function patchKb(body: Record<string, unknown>) {
    const { PATCH } = await import("@/app/api/admin/kbs/[kbId]/route");
    return PATCH(new Request("http://localhost/api/admin/kbs/kb-grad-school", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ kbId: "kb-grad-school" }) });
  }

  it("rejects editors", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "editor@example.edu",
      session: session("editor"),
    });
    const response = await patchKb({ requireSummary: false });
    expect(response.status).toBe(403);
  });

  it("lets an admin toggle requireSummary only", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const security = await import("@/lib/security");
    const store = await import("@/lib/kb-store");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "admin@example.edu",
      session: session("admin"),
    });
    const setFlag = vi.spyOn(store, "setKbRequireSummary").mockResolvedValue({
      id: "kb-grad-school",
      title: "Graduate School Knowledge Base",
      slug: "graduate-school",
      description: "",
      status: "published",
      visibility: "public",
      updatedOn: "2026-07-25",
      requireSummary: false,
    });

    const ok = await patchKb({ requireSummary: false });
    expect(ok.status).toBe(200);
    expect(setFlag).toHaveBeenCalledWith("kb-grad-school", false);

    const denied = await patchKb({ requireSummary: false, title: "Nope" });
    expect(denied.status).toBe(403);
    expect(setFlag).toHaveBeenCalledTimes(1);
  });

  it("lets an owner toggle requireSummary", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const security = await import("@/lib/security");
    const store = await import("@/lib/kb-store");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "owner@example.edu",
      session: session("owner"),
    });
    const setFlag = vi.spyOn(store, "setKbRequireSummary").mockResolvedValue({
      id: "kb-grad-school",
      title: "Graduate School Knowledge Base",
      slug: "graduate-school",
      description: "",
      status: "published",
      visibility: "public",
      updatedOn: "2026-07-25",
      requireSummary: true,
    });

    const response = await patchKb({ requireSummary: true });
    expect(response.status).toBe(200);
    expect(setFlag).toHaveBeenCalledWith("kb-grad-school", true);
  });

  it("keeps DELETE owner-only", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const security = await import("@/lib/security");
    vi.spyOn(security, "requireAdminMutation").mockResolvedValue({
      ok: true,
      email: "admin@example.edu",
      session: session("admin"),
    });
    const { DELETE } = await import("@/app/api/admin/kbs/[kbId]/route");
    const response = await DELETE(new Request("http://localhost/api/admin/kbs/kb-grad-school", { method: "DELETE" }), {
      params: Promise.resolve({ kbId: "kb-grad-school" }),
    });
    expect(response.status).toBe(403);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveRedirectTarget, getKbBySlug, upsertManualRedirect } from "@/lib/kb-store";

describe("redirect chain resolution (in-memory)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a single-hop redirect", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school-staff");
    await upsertManualRedirect({ kbId: kb!.id, fromPath: "old-a", toPath: "new-a" });

    expect(await getActiveRedirectTarget(kb!.id, ["old-a"])).toEqual(["new-a"]);
  });

  it("follows a multi-hop redirect chain to the final path", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school-staff");
    // Simulates a page moved twice: old-b -> mid-b (first move), then mid-b -> final-b (second move).
    await upsertManualRedirect({ kbId: kb!.id, fromPath: "old-b", toPath: "mid-b" });
    await upsertManualRedirect({ kbId: kb!.id, fromPath: "mid-b", toPath: "final-b" });

    expect(await getActiveRedirectTarget(kb!.id, ["old-b"])).toEqual(["final-b"]);
  });

  it("does not follow a cycle back onto itself", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school-staff");
    await upsertManualRedirect({ kbId: kb!.id, fromPath: "loop-a", toPath: "loop-b" });
    await upsertManualRedirect({ kbId: kb!.id, fromPath: "loop-b", toPath: "loop-a" });

    expect(await getActiveRedirectTarget(kb!.id, ["loop-a"])).toBeNull();
  });

  it("returns null when there is no redirect for the path", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const kb = await getKbBySlug("graduate-school-staff");

    expect(await getActiveRedirectTarget(kb!.id, ["never-redirected"])).toBeNull();
  });
});

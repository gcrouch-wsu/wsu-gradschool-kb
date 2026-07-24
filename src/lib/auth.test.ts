import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canAccessKb,
  createAdminSessionToken,
  getKbReadAccess,
  readAdminSessionToken,
  validateAdminCredentials,
  type AdminSession,
} from "@/lib/auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("bootstrap owner sessions", () => {
  it("rejects tokens after bootstrap password rotation", async () => {
    vi.stubEnv("KB_ADMIN_EMAIL", "owner@example.edu");
    vi.stubEnv("KB_ADMIN_PASSWORD", "first-password");
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "stable-session-secret");

    const session = await validateAdminCredentials("owner@example.edu", "first-password");
    expect(session).not.toBeNull();
    const token = createAdminSessionToken(session!);
    expect(await readAdminSessionToken(token)).not.toBeNull();

    vi.stubEnv("KB_ADMIN_PASSWORD", "second-password");
    expect(await readAdminSessionToken(token)).toBeNull();
  });

  it("returns null (not a crash) for unknown emails when no database is configured", async () => {
    vi.stubEnv("KB_ADMIN_EMAIL", "owner@example.edu");
    vi.stubEnv("KB_ADMIN_PASSWORD", "first-password");
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "stable-session-secret");
    vi.stubEnv("DATABASE_URL", "");

    expect(await validateAdminCredentials("someone-else@example.edu", "whatever")).toBeNull();
  });
});

describe("managed (DB-backed) sessions", () => {
  it("fails closed instead of throwing when the user lookup DB call errors transiently", async () => {
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "stable-session-secret");
    const dbUsers = await import("@/lib/db-users");
    vi.spyOn(dbUsers, "loadUserById").mockRejectedValueOnce(new Error("simulated transient DB error"));

    const token = createAdminSessionToken({
      userId: "user-1",
      email: "person@example.edu",
      role: "editor",
      source: "managed",
      expiresAt: Date.now() + 60_000,
      version: "v1",
    });

    await expect(readAdminSessionToken(token)).resolves.toBeNull();
  });
});

describe("per-KB access checks", () => {
  const editorSession: AdminSession = {
    userId: "user-1",
    email: "editor@example.edu",
    role: "editor",
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "v1",
  };

  it("canAccessKb fails closed (denies) instead of throwing when the assignment lookup errors", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://stub-for-test-only");
    const dbUsers = await import("@/lib/db-users");
    vi.spyOn(dbUsers, "isUserAssignedToKb").mockRejectedValueOnce(
      new Error("simulated transient DB error"),
    );

    await expect(canAccessKb(editorSession, "kb-1")).resolves.toBe(false);
  });

  it("getKbReadAccess fails closed instead of throwing when the assignment lookup errors", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://stub-for-test-only");
    const dbUsers = await import("@/lib/db-users");
    vi.spyOn(dbUsers, "isUserAssignedToKb").mockRejectedValueOnce(
      new Error("simulated transient DB error"),
    );

    const access = await getKbReadAccess(editorSession, {
      id: "kb-1",
      visibility: "private",
      status: "published",
    });
    expect(access).toEqual({ canRead: false, canReadStaffContent: false });
  });
});

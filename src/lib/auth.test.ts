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

describe("session signing secret", () => {
  it("refuses to derive a secret from the bootstrap credentials in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "");
    vi.stubEnv("BOOTSTRAP_OWNER_SESSION_SECRET", "");
    vi.stubEnv("KB_ADMIN_EMAIL", "owner@example.edu");
    vi.stubEnv("KB_ADMIN_PASSWORD", "some-password");

    expect(() =>
      createAdminSessionToken({
        userId: "bootstrap-owner",
        email: "owner@example.edu",
        role: "owner",
        source: "env",
        expiresAt: Date.now() + 60_000,
        version: "v1",
      }),
    ).toThrow(/KB_ADMIN_SESSION_SECRET must be set in production/);
  });

  it("still derives a development secret outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "");
    vi.stubEnv("BOOTSTRAP_OWNER_SESSION_SECRET", "");
    vi.stubEnv("KB_ADMIN_EMAIL", "owner@example.edu");
    vi.stubEnv("KB_ADMIN_PASSWORD", "some-password");

    const session = await validateAdminCredentials("owner@example.edu", "some-password");
    expect(session).not.toBeNull();
    expect(createAdminSessionToken(session!)).toContain(".");
  });
});

describe("managed (DB-backed) sessions", () => {
  it("authorizes the role on the current user row, not the role embedded in the cookie", async () => {
    vi.stubEnv("KB_ADMIN_SESSION_SECRET", "stable-session-secret");
    const dbUsers = await import("@/lib/db-users");
    vi.spyOn(dbUsers, "loadUserById").mockResolvedValueOnce({
      id: "user-1",
      email: "person@example.edu",
      fullName: "Person",
      passwordHash: "unused",
      role: "editor",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "v1",
    });

    // A cookie claiming "owner" for a user row that says "editor" must resolve to editor.
    const token = createAdminSessionToken({
      userId: "user-1",
      email: "person@example.edu",
      role: "owner",
      source: "managed",
      expiresAt: Date.now() + 60_000,
      version: "v1",
    });

    const session = await readAdminSessionToken(token);
    expect(session?.role).toBe("editor");
  });

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

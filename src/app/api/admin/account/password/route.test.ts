import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/auth";
import type { User } from "@/lib/types";

const CURRENT = "old readable phrase";

function session(overrides: Partial<AdminSession> = {}): AdminSession {
  return {
    userId: "user-1",
    email: "viewer@example.edu",
    role: "viewer",
    source: "managed",
    expiresAt: Date.now() + 60_000,
    version: "v1",
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/admin/account/password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/account/password", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function setup(activeSession: AdminSession | null = session()) {
    const auth = await import("@/lib/auth");
    const security = await import("@/lib/security");
    const db = await import("@/lib/db");
    const dbUsers = await import("@/lib/db-users");
    const rate = await import("@/lib/rate-limit");

    const user: User = {
      id: "user-1",
      email: "viewer@example.edu",
      fullName: "Vera Viewer",
      role: "viewer",
      passwordHash: auth.hashPassword(CURRENT),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "v1",
    };

    vi.spyOn(security, "isSameOrigin").mockReturnValue(true);
    vi.spyOn(auth, "getCurrentAdminSession").mockResolvedValue(activeSession);
    vi.spyOn(auth, "createAdminSessionToken").mockReturnValue("new-token");
    vi.spyOn(db, "isDatabaseEnabled").mockReturnValue(true);
    vi.spyOn(rate, "rateLimit").mockResolvedValue({ allowed: true, retryAfterSeconds: 0 } as never);
    vi.spyOn(dbUsers, "loadUserById").mockImplementation(async () => user);
    const updateUser = vi.spyOn(dbUsers, "updateUser").mockImplementation(async (update) => {
      if (update.passwordHash) user.passwordHash = update.passwordHash;
      if (update.updatedAt) user.updatedAt = update.updatedAt;
    });

    const { POST } = await import("@/app/api/admin/account/password/route");
    return { POST, updateUser, auth, user };
  }

  it("lets a viewer change their own password and re-issues their cookie", async () => {
    const { POST, updateUser, auth, user } = await setup();
    const response = await POST(request({ currentPassword: CURRENT, newPassword: "maple river lantern" }));
    expect(response.status).toBe(200);
    expect(updateUser).toHaveBeenCalledOnce();
    expect(updateUser.mock.calls[0][0].id).toBe("user-1");
    expect(auth.verifyPassword("maple river lantern", user.passwordHash)).toBe(true);
    expect(response.headers.get("set-cookie")).toContain("new-token");
  });

  it("rejects a wrong current password without changing anything", async () => {
    const { POST, updateUser } = await setup();
    const response = await POST(request({ currentPassword: "not it at all", newPassword: "maple river lantern" }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch("Current password is incorrect");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("enforces the password policy", async () => {
    const { POST, updateUser } = await setup();
    const response = await POST(request({ currentPassword: CURRENT, newPassword: "Password2026!" }));
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch("too common");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses the environment bootstrap account", async () => {
    const { POST, updateUser } = await setup(session({ source: "env", role: "owner", userId: "bootstrap-owner" }));
    const response = await POST(request({ currentPassword: CURRENT, newPassword: "maple river lantern" }));
    expect(response.status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const { POST } = await setup(null);
    const response = await POST(request({ currentPassword: CURRENT, newPassword: "maple river lantern" }));
    expect(response.status).toBe(401);
  });
});
